/**
 * Unit tests for getInterestOpenState (saleTiers.ts) — whether a user's tracked sale tier is
 * currently open for purchase, and the two dates needed to label it unambiguously.
 *
 * Regression coverage for a real bug: OPEN_PREORDER interests substituted announcement.endsAt
 * (the closing deadline) for the tier's own opening date, so a sale showed as "(open)" — with
 * the closing date printed next to it — days before it had actually started.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolveInterestDate, getInterestOpenState } from '../lib/saleTiers'

const NOW = new Date('2026-08-22T00:00:00Z')
const realDateNow = Date.now

beforeAll(() => {
  Date.now = () => NOW.getTime()
})

afterAll(() => {
  Date.now = realDateNow
})

function interest(tierDate: string | null, endsAt: string | null = null) {
  return {
    saleTier: tierDate ? { date: tierDate } : null,
    announcement: { endsAt },
  }
}

describe('resolveInterestDate', () => {
  it('returns the tracked tier\'s own date', () => {
    expect(resolveInterestDate(interest('2026-08-28T00:00:00Z'))).toBe('2026-08-28T00:00:00Z')
  })

  it('returns null when there is no tier (pre-migration, not yet backfilled)', () => {
    expect(resolveInterestDate(interest(null))).toBeNull()
  })
})

describe('getInterestOpenState', () => {
  it('not yet started (tier date in the future) — not open, not closed', () => {
    const state = getInterestOpenState(interest('2026-08-28T00:00:00Z', '2026-09-05T00:00:00Z'))
    expect(state.isOpen).toBe(false)
    expect(state.hasClosed).toBe(false)
    expect(state.openDate).toBe('2026-08-28T00:00:00Z')
    expect(state.closesDate).toBe('2026-09-05T00:00:00Z')
  })

  it('started, no closing deadline — open', () => {
    const state = getInterestOpenState(interest('2026-08-01T00:00:00Z', null))
    expect(state.isOpen).toBe(true)
    expect(state.hasClosed).toBe(false)
  })

  it('started, deadline still ahead — open (the OPEN_PREORDER-with-endsAt case)', () => {
    const state = getInterestOpenState(interest('2026-08-01T00:00:00Z', '2026-09-05T00:00:00Z'))
    expect(state.isOpen).toBe(true)
    expect(state.hasClosed).toBe(false)
  })

  it('started AND past the closing deadline — closed, not open', () => {
    const state = getInterestOpenState(interest('2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z'))
    expect(state.isOpen).toBe(false)
    expect(state.hasClosed).toBe(true)
  })

  it('regression: a tier starting AFTER now must never read as open just because endsAt is still ahead', () => {
    // The exact bug: tier starts Aug 28 (6 days after "now" = Aug 22), sale closes Sep 5. The old
    // code ignored the tier's own date entirely for OPEN_PREORDER and only checked endsAt > now,
    // which is true here — so it showed "(open)" six days too early, dated by the closing date.
    const state = getInterestOpenState(interest('2026-08-28T00:00:00Z', '2026-09-05T00:00:00Z'))
    expect(state.isOpen).toBe(false)
  })

  it('no tier at all — never open, never closed, regardless of endsAt', () => {
    const state = getInterestOpenState(interest(null, '2026-09-05T00:00:00Z'))
    expect(state.isOpen).toBe(false)
    expect(state.hasClosed).toBe(false)
    expect(state.openDate).toBeNull()
  })

  it('tier date exactly at "now" counts as started', () => {
    const state = getInterestOpenState(interest(NOW.toISOString(), null))
    expect(state.isOpen).toBe(true)
  })
})
