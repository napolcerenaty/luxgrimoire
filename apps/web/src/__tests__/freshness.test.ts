/**
 * Unit tests for the admin Data Freshness colour buckets.
 */
import { describe, it, expect } from 'vitest'
import { freshness, isNeverChecked } from '../app/(admin)/admin/data-freshness/freshness'

const NOW = Date.parse('2026-08-31T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW - h * 36e5).toISOString()

describe('freshness', () => {
  it('epoch / never-checked → red with warning', () => {
    expect(freshness(new Date(0).toISOString(), NOW)).toMatchObject({ bucket: 'never', warn: true })
    expect(freshness('1970-01-01T00:00:00.000Z', NOW).cls).toContain('red')
  })

  it('< 24h → blue, no warning', () => {
    expect(freshness(hoursAgo(1), NOW)).toMatchObject({ bucket: 'day', warn: false })
    expect(freshness(hoursAgo(23), NOW).cls).toContain('sky')
  })

  it('24–72h → yellow', () => {
    expect(freshness(hoursAgo(24), NOW).bucket).toBe('threeDays')
    expect(freshness(hoursAgo(71), NOW).cls).toContain('yellow')
  })

  it('3–7 days → orange', () => {
    expect(freshness(hoursAgo(72), NOW).bucket).toBe('week')
    expect(freshness(hoursAgo(24 * 7 - 1), NOW).cls).toContain('orange')
  })

  it('7–30 days → red, no warning', () => {
    expect(freshness(hoursAgo(24 * 7), NOW)).toMatchObject({ bucket: 'month', warn: false })
    expect(freshness(hoursAgo(24 * 29), NOW).cls).toContain('red')
  })

  it('> 30 days → red with warning', () => {
    expect(freshness(hoursAgo(24 * 30), NOW)).toMatchObject({ bucket: 'stale', warn: true })
  })

  it('unparseable input is treated as never', () => {
    expect(freshness('not-a-date', NOW)).toMatchObject({ bucket: 'never', warn: true })
  })
})

describe('isNeverChecked', () => {
  it('true for epoch, false for a real date', () => {
    expect(isNeverChecked(new Date(0).toISOString())).toBe(true)
    expect(isNeverChecked('2026-08-01T00:00:00.000Z')).toBe(false)
  })
})
