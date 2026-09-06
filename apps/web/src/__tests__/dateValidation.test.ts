import { describe, it, expect } from 'vitest'
import { isValidCalendarDate, isValidCalendarDateTime } from '../lib/dateValidation'

describe('isValidCalendarDate', () => {
  it('rejects empty / nullish / wrong-shape input', () => {
    expect(isValidCalendarDate(null)).toBe(false)
    expect(isValidCalendarDate(undefined)).toBe(false)
    expect(isValidCalendarDate('')).toBe(false)
    expect(isValidCalendarDate('garbage')).toBe(false)
    expect(isValidCalendarDate('2024-1-5')).toBe(false) // needs zero-padded segments
  })

  it('rejects an out-of-range month or day that new Date() would silently roll over', () => {
    expect(isValidCalendarDate('2024-13-01')).toBe(false)
    expect(isValidCalendarDate('2024-02-30')).toBe(false)
    expect(isValidCalendarDate('2024-00-10')).toBe(false)
  })

  it('handles the leap-year Feb 29 boundary', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true)
    expect(isValidCalendarDate('2023-02-29')).toBe(false)
  })

  it('accepts an ordinary valid date', () => {
    expect(isValidCalendarDate('2024-01-15')).toBe(true)
    expect(isValidCalendarDate('2026-12-31')).toBe(true)
  })
})

describe('isValidCalendarDateTime', () => {
  it('rejects nullish input', () => {
    expect(isValidCalendarDateTime(null)).toBe(false)
    expect(isValidCalendarDateTime('')).toBe(false)
  })

  it('validates only the date half of a YYYY-MM-DDTHH:mm string', () => {
    expect(isValidCalendarDateTime('2024-02-30T12:00')).toBe(false)
    expect(isValidCalendarDateTime('2024-02-29T23:59')).toBe(true)
    expect(isValidCalendarDateTime('2026-06-15T00:00')).toBe(true)
  })
})
