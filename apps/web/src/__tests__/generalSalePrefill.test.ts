import { describe, it, expect } from 'vitest'
import { computeGeneralSaleDatePrefill } from '../lib/generalSalePrefill'

describe('computeGeneralSaleDatePrefill', () => {
  // ── Missing prerequisites ────────────────────────────────────────────────

  it('returns empty string when monthYear is null', () => {
    expect(computeGeneralSaleDatePrefill(null, 3, 15)).toBe('')
  })

  it('returns empty string when monthMonth is null', () => {
    expect(computeGeneralSaleDatePrefill(2024, null, 15)).toBe('')
  })

  it('returns empty string when renewalDay is null and renewalDayUserSet is false', () => {
    expect(computeGeneralSaleDatePrefill(2024, 3, null, false)).toBe('')
  })

  it('returns empty string when renewalDay is null and renewalDayUserSet is not provided', () => {
    expect(computeGeneralSaleDatePrefill(2024, 3, null)).toBe('')
  })

  // ── No offset (standard subscription) ───────────────────────────────────

  it('returns the box month with renewal day when offset is 0 (default)', () => {
    expect(computeGeneralSaleDatePrefill(2024, 3, 15)).toBe('2024-03-15')
  })

  it('pads month and day to 2 digits', () => {
    expect(computeGeneralSaleDatePrefill(2024, 1, 5)).toBe('2024-01-05')
  })

  // ── With positive offset ─────────────────────────────────────────────────

  it('subtracts offset from box month to get renewal month', () => {
    // box = March 2024, offset = 1 → renewal = February 2024
    expect(computeGeneralSaleDatePrefill(2024, 3, 15, false, 1)).toBe('2024-02-15')
  })

  it('wraps to previous year when offset pushes month below January', () => {
    // box = January 2024, offset = 1 → renewal = December 2023
    expect(computeGeneralSaleDatePrefill(2024, 1, 15, false, 1)).toBe('2023-12-15')
  })

  it('handles large offset with year rollover', () => {
    // box = February 2024, offset = 3 → renewal = November 2023
    expect(computeGeneralSaleDatePrefill(2024, 2, 20, false, 3)).toBe('2023-11-20')
  })

  it('handles offset equal to 12 (full year back)', () => {
    // box = June 2024, offset = 12 → renewal = June 2023
    expect(computeGeneralSaleDatePrefill(2024, 6, 10, false, 12)).toBe('2023-06-10')
  })

  // ── renewalDayUserSet = true ─────────────────────────────────────────────

  it('uses day 1 when renewalDayUserSet is true (no offset)', () => {
    expect(computeGeneralSaleDatePrefill(2024, 3, null, true)).toBe('2024-03-01')
  })

  it('uses day 1 with offset when renewalDayUserSet is true', () => {
    // box = March 2024, offset = 1, user-set day → renewal = February 2024, day 1
    expect(computeGeneralSaleDatePrefill(2024, 3, null, true, 1)).toBe('2024-02-01')
  })

  it('uses day 1 even when renewalDay is also provided (renewalDayUserSet takes precedence)', () => {
    expect(computeGeneralSaleDatePrefill(2024, 3, 20, true)).toBe('2024-03-01')
  })

  it('wraps to previous year with renewalDayUserSet and offset', () => {
    // box = January 2024, offset = 2, user-set → renewal = November 2023, day 1
    expect(computeGeneralSaleDatePrefill(2024, 1, null, true, 2)).toBe('2023-11-01')
  })

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('treats null offset as 0', () => {
    expect(computeGeneralSaleDatePrefill(2024, 6, 15, false, null)).toBe('2024-06-15')
  })

  it('treats undefined offset as 0', () => {
    expect(computeGeneralSaleDatePrefill(2024, 6, 15, false, undefined)).toBe('2024-06-15')
  })
})
