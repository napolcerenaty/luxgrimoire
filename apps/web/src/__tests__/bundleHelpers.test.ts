/**
 * Unit tests for bundleHelpers.ts — the pure month-grouping math shared by
 * ManageSkipsModal and SkipStatusPanel to render/skip bundle subscriptions
 * as whole periods instead of individual calendar months.
 */
import { describe, it, expect } from 'vitest'
import { getBundleStart, getBundleEnd, bundleRangeLabel, groupIntoBundles } from '../lib/bundleHelpers'

describe('getBundleStart', () => {
  it('quarterly (interval=3, startingMonth=1): mid-quarter month resolves to quarter start', () => {
    expect(getBundleStart(2025, 2, 1, 3)).toEqual({ year: 2025, month: 1 })
    expect(getBundleStart(2025, 5, 1, 3)).toEqual({ year: 2025, month: 4 })
    expect(getBundleStart(2025, 9, 1, 3)).toEqual({ year: 2025, month: 7 })
    expect(getBundleStart(2025, 12, 1, 3)).toEqual({ year: 2025, month: 10 })
  })

  it('quarterly: the start month itself is its own bundle start (idempotent)', () => {
    expect(getBundleStart(2025, 4, 1, 3)).toEqual({ year: 2025, month: 4 })
  })

  it('bimonthly (interval=2, startingMonth=1): pairs from January', () => {
    expect(getBundleStart(2025, 1, 1, 2)).toEqual({ year: 2025, month: 1 })
    expect(getBundleStart(2025, 2, 1, 2)).toEqual({ year: 2025, month: 1 })
    expect(getBundleStart(2025, 3, 1, 2)).toEqual({ year: 2025, month: 3 })
    expect(getBundleStart(2025, 6, 1, 2)).toEqual({ year: 2025, month: 5 })
  })

  it('annual (interval=12): any month in the year resolves to startingMonth', () => {
    expect(getBundleStart(2025, 6, 1, 12)).toEqual({ year: 2025, month: 1 })
    expect(getBundleStart(2025, 12, 1, 12)).toEqual({ year: 2025, month: 1 })
  })

  it('non-January startingMonth (e.g. 2): quarters offset accordingly', () => {
    // startingMonth=2 → quarters start Feb, May, Aug, Nov
    expect(getBundleStart(2025, 2, 2, 3)).toEqual({ year: 2025, month: 2 })
    expect(getBundleStart(2025, 4, 2, 3)).toEqual({ year: 2025, month: 2 })
    expect(getBundleStart(2025, 1, 2, 3)).toEqual({ year: 2024, month: 11 }) // Jan belongs to the Nov-Jan quarter
  })

  it('crosses a year boundary correctly (startingMonth=11: Nov–Jan bundle)', () => {
    expect(getBundleStart(2025, 12, 11, 3)).toEqual({ year: 2025, month: 11 })
    expect(getBundleStart(2026, 1, 11, 3)).toEqual({ year: 2025, month: 11 })
    // February belongs to the NEXT bundle (Feb–Apr), not the Nov–Jan one
    expect(getBundleStart(2026, 2, 11, 3)).toEqual({ year: 2026, month: 2 })
  })

  it('January stays its own quarter start for a January-anchored quarterly bundle', () => {
    expect(getBundleStart(2026, 1, 1, 3)).toEqual({ year: 2026, month: 1 })
  })
})

describe('getBundleEnd', () => {
  it('quarterly bundle within the same year', () => {
    expect(getBundleEnd(2025, 4, 3)).toEqual({ year: 2025, month: 6 })
  })

  it('bundle crossing into the next year', () => {
    expect(getBundleEnd(2025, 11, 3)).toEqual({ year: 2026, month: 1 })
  })

  it('single-month bundle (interval=1) ends on the same month it starts', () => {
    expect(getBundleEnd(2025, 6, 1)).toEqual({ year: 2025, month: 6 })
  })

  it('annual bundle (interval=12) ends 11 months later, same start month next cycle', () => {
    expect(getBundleEnd(2025, 1, 12)).toEqual({ year: 2025, month: 12 })
  })
})

describe('bundleRangeLabel', () => {
  it('formats a same-year range as "Start–End Year"', () => {
    expect(bundleRangeLabel(2025, 4, 3)).toBe('Apr–Jun 2025')
  })

  it('formats a year-crossing range as "Start Year–End Year"', () => {
    expect(bundleRangeLabel(2025, 11, 3)).toBe('Nov 2025–Jan 2026')
  })

  it('single-month bundle labels start and end as the same month', () => {
    expect(bundleRangeLabel(2025, 6, 1)).toBe('Jun–Jun 2025')
  })
})

describe('groupIntoBundles', () => {
  it('groups consecutive calendar months belonging to the same quarter into one bundle', () => {
    const months = [
      { year: 2025, month: 4 },
      { year: 2025, month: 5 },
      { year: 2025, month: 6 },
    ]
    const groups = groupIntoBundles(months, 3, 1)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: '2025-4', startYear: 2025, startMonth: 4, endYear: 2025, endMonth: 6, label: 'Apr–Jun 2025',
    })
    expect(groups[0].items).toEqual(months)
  })

  it('splits months across different bundle periods into separate groups', () => {
    const months = [
      { year: 2025, month: 4 },
      { year: 2025, month: 7 },
      { year: 2025, month: 10 },
    ]
    const groups = groupIntoBundles(months, 3, 1)
    expect(groups.map((g) => g.key)).toEqual(['2025-4', '2025-7', '2025-10'])
    expect(groups.every((g) => g.items.length === 1)).toBe(true)
  })

  it('handles a partial bundle (only 1 of 3 months present) without inventing missing months', () => {
    const months = [{ year: 2025, month: 5 }]
    const groups = groupIntoBundles(months, 3, 1)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ startYear: 2025, startMonth: 4, endYear: 2025, endMonth: 6 })
    expect(groups[0].items).toEqual(months)
  })

  it('preserves arbitrary item fields (e.g. books) alongside year/month', () => {
    const months = [
      { year: 2025, month: 4, books: [{ title: 'A' }] },
      { year: 2025, month: 5, books: [{ title: 'B' }] },
    ]
    const groups = groupIntoBundles(months, 3, 1)
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toEqual(months)
  })

  it('returns an empty array for an empty input', () => {
    expect(groupIntoBundles([], 3, 1)).toEqual([])
  })

  it('groups out-of-order input into the same bundle regardless of array order', () => {
    const months = [
      { year: 2025, month: 6 },
      { year: 2025, month: 4 },
      { year: 2025, month: 5 },
    ]
    const groups = groupIntoBundles(months, 3, 1)
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(3)
  })
})
