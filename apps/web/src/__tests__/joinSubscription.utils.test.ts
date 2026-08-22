/**
 * Unit tests for joinSubscription.utils.ts
 *
 * Covers all variants of the price/currency fallback flow:
 *
 * lookupPriceAt:
 *   1. Empty date → fallback
 *   2. Official currency, exact month match
 *   3. Official currency, most recent prior change wins
 *   4. Custom currency with no records → fallback
 *   5. Multiple currencies → picks matching currency only
 *   6. Change in future relative to billing date → not applied
 *
 * lookupPrepayPriceAt:
 *   7. Matching option found for currency + months → option price used
 *   8. No matching option for custom currency → fallback
 *   9. Multiple currencies — only matching currency returned
 *  10. validFrom/validUntil date range filtering
 *  11. Multiple valid options → most recent validFrom wins
 *  12. Empty billingDateStr → fallback
 *
 * resolveBackfillFallbackPrice:
 *  13. entry.basePrice positive → uses it
 *  14. entry.basePrice absent, prepay price available → uses prepay price
 *  15. Both absent/zero → returns '0'
 *  16. Custom currency: entry.basePrice (user's custom value) preferred over prepay option price
 *  17. Official currency: entry.basePrice (auto-filled from price history) used
 *
 * computeAutoBatches:
 *  18. Official currency (USD) with matching prepay option → uses option price
 *  19. Custom currency (PLN) with no matching prepay option → uses fallbackPrice
 *  20. Multiple currencies in prepay options → picks user's currency
 *  21. startDate YYYY-MM-DD used for first batch billing date
 *  22. startDate YYYY-MM with renewalDay → correct billing date
 *  23. Skipped months extend batch (don't count toward prepayN)
 *  24. Partial last batch uses full period price
 *  25. Single month, prepayN=1 (monthly) — one batch per month
 *  26. Price changes over time: first batch uses historical price, second uses new price
 */

import { describe, it, expect } from 'vitest'
import {
  lookupPriceAt,
  lookupPrepayPriceAt,
  resolveBackfillFallbackPrice,
  computeAutoBatches,
  resolveBatchMonthsCovered,
  computeFirstBillingMonth,
  isGrandfatheredExcluded,
  buildFirstBoxCandidates,
  applyFirstBoxChoice,
} from '../lib/joinSubscription.utils'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function pc(year: number, month: number, price: string, currency = 'USD', grandfatheredPrice = false) {
  return { effectiveYear: year, effectiveMonth: month, newBasePrice: price, currency, grandfatheredPrice }
}

function prepayOpt(months: number, price: number | string, currency = 'USD', validFrom?: string, validUntil?: string) {
  return { months, price, currency, validFrom: validFrom ?? null, validUntil: validUntil ?? null }
}

function month(id: string, year: number, m: number) {
  return { id, year, month: m }
}

// ── lookupPriceAt ─────────────────────────────────────────────────────────────

describe('lookupPriceAt', () => {
  it('1. returns fallback when dateStr is empty', () => {
    const changes = [pc(2024, 1, '29.99')]
    expect(lookupPriceAt('', changes, 'USD', '19.99')).toBe('19.99')
  })

  it('2. returns price for exact month match', () => {
    const changes = [pc(2024, 3, '29.99')]
    expect(lookupPriceAt('2024-03-01', changes, 'USD', '19.99')).toBe('29.99')
  })

  it('3. picks most recent change on or before billing date', () => {
    const changes = [pc(2023, 6, '24.99'), pc(2024, 1, '29.99'), pc(2024, 6, '34.99')]
    // billing date 2024-04 → most recent is Jan 2024
    expect(lookupPriceAt('2024-04-01', changes, 'USD', '19.99')).toBe('29.99')
  })

  it('4. returns fallback when custom currency has no records', () => {
    const changes = [pc(2024, 1, '29.99', 'USD'), pc(2024, 1, '27.99', 'EUR')]
    expect(lookupPriceAt('2024-05-01', changes, 'PLN', '299.00')).toBe('299.00')
  })

  it('5. ignores records for other currencies', () => {
    const changes = [pc(2024, 1, '29.99', 'USD'), pc(2024, 1, '27.99', 'EUR')]
    expect(lookupPriceAt('2024-05-01', changes, 'EUR', '19.99')).toBe('27.99')
    expect(lookupPriceAt('2024-05-01', changes, 'USD', '19.99')).toBe('29.99')
  })

  it('6. future change not applied — billing date before effective month', () => {
    const changes = [pc(2024, 6, '34.99')]
    expect(lookupPriceAt('2024-05-01', changes, 'USD', '29.99')).toBe('29.99')
  })
})

// ── lookupPrepayPriceAt ───────────────────────────────────────────────────────

describe('lookupPrepayPriceAt', () => {
  it('7. matching option found for currency + months → option price', () => {
    const opts = [prepayOpt(6, 149.99, 'USD')]
    expect(lookupPrepayPriceAt('2024-01-01', opts, 6, 'USD', '0')).toBe('149.99')
  })

  it('8. no matching option for custom currency → fallback', () => {
    const opts = [prepayOpt(6, 149.99, 'USD'), prepayOpt(6, 139.99, 'EUR')]
    expect(lookupPrepayPriceAt('2024-01-01', opts, 6, 'PLN', '599.99')).toBe('599.99')
  })

  it('9. multiple currencies — returns correct currency', () => {
    const opts = [prepayOpt(6, 149.99, 'USD'), prepayOpt(6, 139.99, 'EUR')]
    expect(lookupPrepayPriceAt('2024-01-01', opts, 6, 'EUR', '0')).toBe('139.99')
    expect(lookupPrepayPriceAt('2024-01-01', opts, 6, 'USD', '0')).toBe('149.99')
  })

  it('10a. option not yet valid at billing date (validFrom in future) → fallback', () => {
    const opts = [prepayOpt(6, 149.99, 'USD', '2025-01-01')]
    expect(lookupPrepayPriceAt('2024-06-01', opts, 6, 'USD', '129.99')).toBe('129.99')
  })

  it('10b. option expired at billing date (validUntil in past) → fallback', () => {
    const opts = [prepayOpt(6, 149.99, 'USD', '2022-01-01', '2023-01-01')]
    expect(lookupPrepayPriceAt('2024-01-01', opts, 6, 'USD', '129.99')).toBe('129.99')
  })

  it('10c. option valid within date range → used', () => {
    const opts = [prepayOpt(6, 149.99, 'USD', '2023-01-01', '2025-01-01')]
    expect(lookupPrepayPriceAt('2024-06-01', opts, 6, 'USD', '0')).toBe('149.99')
  })

  it('11. multiple valid options → most recent validFrom wins', () => {
    const opts = [
      prepayOpt(6, 139.99, 'USD', '2022-01-01'),
      prepayOpt(6, 149.99, 'USD', '2024-01-01'),
    ]
    expect(lookupPrepayPriceAt('2024-06-01', opts, 6, 'USD', '0')).toBe('149.99')
  })

  it('12. empty billingDateStr → fallback', () => {
    const opts = [prepayOpt(6, 149.99, 'USD')]
    expect(lookupPrepayPriceAt('', opts, 6, 'USD', '99.00')).toBe('99.00')
  })
})

// ── resolveBackfillFallbackPrice ──────────────────────────────────────────────

describe('resolveBackfillFallbackPrice', () => {
  it('13. entry.basePrice positive → returned', () => {
    expect(resolveBackfillFallbackPrice('179.94', 149.99)).toBe('179.94')
  })

  it('14. entry.basePrice absent, prepay price available → prepay price', () => {
    expect(resolveBackfillFallbackPrice(null, 149.99)).toBe('149.99')
    expect(resolveBackfillFallbackPrice('', 149.99)).toBe('149.99')
    expect(resolveBackfillFallbackPrice(undefined, 149.99)).toBe('149.99')
  })

  it('15. both absent/zero → returns "0"', () => {
    expect(resolveBackfillFallbackPrice(null, null)).toBe('0')
    expect(resolveBackfillFallbackPrice('', 0)).toBe('0')
    expect(resolveBackfillFallbackPrice('0', 0)).toBe('0')
  })

  it('16. custom currency: entry.basePrice (user custom) preferred over prepay option price', () => {
    // User entered 599 PLN; prepay option price is 149.99 USD — entry.basePrice should win
    // Note: parseDecimalInput normalizes '599.00' → 599, so String(599) = '599'
    expect(resolveBackfillFallbackPrice('599.00', 149.99)).toBe('599')
    // Verify: prepay option price would NOT be used
    expect(parseFloat(resolveBackfillFallbackPrice('599.00', 149.99))).toBe(599)
  })

  it('17. official currency: entry.basePrice (auto-filled from history) used', () => {
    // entry.basePrice was auto-filled to 29.99 USD from price history in Step1
    expect(resolveBackfillFallbackPrice('29.99', 29.99)).toBe('29.99')
  })
})

// ── computeAutoBatches ────────────────────────────────────────────────────────

describe('computeAutoBatches', () => {
  it('18. official currency (USD) with matching prepay option → option price used', () => {
    const months = [month('m1', 2026, 1), month('m2', 2026, 2), month('m3', 2026, 3), month('m4', 2026, 4), month('m5', 2026, 5), month('m6', 2026, 6)]
    const opts = [prepayOpt(6, 179.94, 'USD')]
    const batches = computeAutoBatches(months, months.map(m => m.id), 6, 1, 'USD', opts, '179.94', '2026-01-22')
    expect(batches).toHaveLength(1)
    expect(batches[0].amount).toBe('179.94')
    expect(batches[0].currency).toBe('USD')
  })

  it('19. custom currency (PLN) with no matching prepay option → fallbackPrice used', () => {
    const months = [month('m1', 2026, 1), month('m2', 2026, 2), month('m3', 2026, 3)]
    const opts = [prepayOpt(3, 89.99, 'USD')]  // USD only, no PLN
    const batches = computeAutoBatches(months, months.map(m => m.id), 3, 1, 'PLN', opts, '359.00', '2026-01-01')
    expect(batches).toHaveLength(1)
    expect(batches[0].amount).toBe('359.00')
    expect(batches[0].currency).toBe('PLN')
  })

  it('20. multiple currencies in prepay options → picks user currency', () => {
    const months = [month('m1', 2026, 1), month('m2', 2026, 2), month('m3', 2026, 3)]
    const opts = [prepayOpt(3, 89.99, 'USD'), prepayOpt(3, 82.99, 'EUR')]
    const batchesEur = computeAutoBatches(months, months.map(m => m.id), 3, 1, 'EUR', opts, '82.99', '2026-01-01')
    expect(batchesEur[0].amount).toBe('82.99')
    expect(batchesEur[0].currency).toBe('EUR')

    const batchesUsd = computeAutoBatches(months, months.map(m => m.id), 3, 1, 'USD', opts, '89.99', '2026-01-01')
    expect(batchesUsd[0].amount).toBe('89.99')
    expect(batchesUsd[0].currency).toBe('USD')
  })

  it('21. startDate YYYY-MM-DD used for first batch billing date', () => {
    const months = [month('m1', 2026, 1), month('m2', 2026, 2)]
    const batches = computeAutoBatches(months, months.map(m => m.id), 2, 1, 'USD', [], '29.99', '2026-01-22')
    expect(batches[0].billingDate).toBe('2026-01-22')
  })

  it('22. startDate YYYY-MM with renewalDay → correct billing date for first batch', () => {
    const months = [month('m1', 2026, 1), month('m2', 2026, 2)]
    const batches = computeAutoBatches(months, months.map(m => m.id), 2, 15, 'USD', [], '29.99', '2026-01')
    expect(batches[0].billingDate).toBe('2026-01-15')
  })

  it('23. skipped months extend batch (not counted toward prepayN)', () => {
    const all = [month('m1', 2026, 1), month('m2', 2026, 2), month('m3', 2026, 3), month('m4', 2026, 4)]
    // select m1, m3, m4 (m2 skipped) — prepayN=3 → should need 3 selected months → m1+m3+m4
    const selected = ['m1', 'm3', 'm4']
    const batches = computeAutoBatches(all, selected, 3, 1, 'USD', [], '89.99')
    expect(batches).toHaveLength(1)
    expect(batches[0].monthIds).toEqual(['m1', 'm3', 'm4'])
  })

  it('24. partial last batch uses fallback price', () => {
    const all = [month('m1', 2026, 1), month('m2', 2026, 2), month('m3', 2026, 3), month('m4', 2026, 4), month('m5', 2026, 5)]
    // prepayN=3, 5 months selected → 1 full batch (m1-m3) + partial batch (m4-m5)
    const selected = all.map(m => m.id)
    const batches = computeAutoBatches(all, selected, 3, 1, 'USD', [prepayOpt(3, 89.99, 'USD')], '89.99')
    expect(batches).toHaveLength(2)
    expect(batches[1].monthIds).toEqual(['m4', 'm5'])
    expect(batches[1].amount).toBe('89.99')
  })

  it('25. prepayN=1 (monthly) — one batch per selected month', () => {
    const months = [month('m1', 2026, 1), month('m2', 2026, 2), month('m3', 2026, 3)]
    const batches = computeAutoBatches(months, months.map(m => m.id), 1, 1, 'USD', [], '29.99')
    expect(batches).toHaveLength(3)
    batches.forEach(b => expect(b.monthIds).toHaveLength(1))
  })

  it('26. price changes over time: different batches get historical prepay prices', () => {
    const months = [
      month('m1', 2025, 1), month('m2', 2025, 2), month('m3', 2025, 3),
      month('m4', 2025, 4), month('m5', 2025, 5), month('m6', 2025, 6),
    ]
    const opts = [
      prepayOpt(3, 79.99, 'USD', '2024-01-01', '2025-04-01'),  // old price, expired April 2025
      prepayOpt(3, 89.99, 'USD', '2025-04-01'),                  // new price from April 2025
    ]
    const selected = months.map(m => m.id)
    const batches = computeAutoBatches(months, selected, 3, 1, 'USD', opts, '89.99', '2025-01-01')
    expect(batches).toHaveLength(2)
    expect(batches[0].amount).toBe('79.99')  // Jan 2025 batch → old price still valid
    expect(batches[1].amount).toBe('89.99')  // Apr 2025 batch → new price
  })
})

// ── resolveBatchMonthsCovered ──────────────────────────────────────────────────

describe('resolveBatchMonthsCovered', () => {
  it('falls back to the bucketed month count when no override is given', () => {
    expect(resolveBatchMonthsCovered('', 2)).toBe(2)
  })

  it('uses the user-provided override when present', () => {
    // Last row: paid for 3 months, but only 2 exist as SubscriptionMonth rows yet.
    expect(resolveBatchMonthsCovered('3', 2)).toBe(3)
  })

  it('falls back to the bucketed count for a non-numeric override', () => {
    expect(resolveBatchMonthsCovered('abc', 2)).toBe(2)
  })

  it('falls back to the bucketed count for a zero or negative override', () => {
    expect(resolveBatchMonthsCovered('0', 2)).toBe(2)
    expect(resolveBatchMonthsCovered('-1', 2)).toBe(2)
  })

  it('a full (non-trailing) row with no override keeps using its own bucketed count', () => {
    expect(resolveBatchMonthsCovered('', 3)).toBe(3)
  })
})

// ── computeFirstBillingMonth ──────────────────────────────────────────────────

describe('computeFirstBillingMonth', () => {
  // Default behaviour (joinDay=1, renewalDay=null, offset=0):
  // joinDay(1) >= effectiveRenewalDay(1) → renewal happened → lastBillingMonth = joinMonth → currentBox = joinMonth

  it('27. includes=true, defaults → same month as join', () => {
    expect(computeFirstBillingMonth(2025, 11, true)).toEqual({ year: 2025, month: 11 })
  })

  it('28. includes=false, defaults → next month', () => {
    expect(computeFirstBillingMonth(2025, 11, false)).toEqual({ year: 2025, month: 12 })
  })

  it('29. includes=false, December, defaults → wraps to January next year', () => {
    expect(computeFirstBillingMonth(2025, 12, false)).toEqual({ year: 2026, month: 1 })
  })

  it('30. includes=true, December, defaults → stays December', () => {
    expect(computeFirstBillingMonth(2025, 12, true)).toEqual({ year: 2025, month: 12 })
  })

  // Renewal-cycle-aware: joinDay before renewalDay → lastBillingMonth = joinMonth - 1

  it('37. renewalDay=20, joinDay=5, Feb, offset=1, includes=true → lastBillingMonth=Jan, currentBox=Feb → first=Feb', () => {
    expect(computeFirstBillingMonth(2025, 2, true, 5, 20, 1)).toEqual({ year: 2025, month: 2 })
  })

  it('38. renewalDay=20, joinDay=25, Feb, offset=1, includes=true → lastBillingMonth=Feb, currentBox=March → first=March', () => {
    expect(computeFirstBillingMonth(2025, 2, true, 25, 20, 1)).toEqual({ year: 2025, month: 3 })
  })

  it('39. renewalDay=20, joinDay=5, Jan, offset=1, includes=true → lastBillingMonth=Dec2024, currentBox=Jan2025 → first=Jan', () => {
    expect(computeFirstBillingMonth(2025, 1, true, 5, 20, 1)).toEqual({ year: 2025, month: 1 })
  })

  it('40. renewalDay=1, joinDay=10, Feb, offset=1, includes=false → lastBillingMonth=Feb, currentBox=March, first=April', () => {
    expect(computeFirstBillingMonth(2025, 2, false, 10, 1, 1)).toEqual({ year: 2025, month: 4 })
  })
})

// ── isGrandfatheredExcluded ───────────────────────────────────────────────────

describe('isGrandfatheredExcluded', () => {
  it('31. non-grandfathered change → never excluded', () => {
    const change = pc(2026, 1, '21.00', 'GBP', false)
    expect(isGrandfatheredExcluded(change, 2025, 11)).toBe(false)
    expect(isGrandfatheredExcluded(change, 2026, 1)).toBe(false)
  })

  it('32. grandfathered change, first billing month BEFORE change → excluded (won\'t affect user)', () => {
    const change = pc(2026, 1, '21.00', 'GBP', true)
    // joining in Nov 2025, signupIncludesCurrentMonth=true → first billing Nov 2025 < Jan 2026
    expect(isGrandfatheredExcluded(change, 2025, 11)).toBe(true)
    // joining in Dec 2025, signupIncludesCurrentMonth=true → first billing Dec 2025 < Jan 2026
    expect(isGrandfatheredExcluded(change, 2025, 12)).toBe(true)
  })

  it('33. grandfathered change, first billing month ON change effective month → NOT excluded (affected)', () => {
    const change = pc(2026, 1, '21.00', 'GBP', true)
    // joining in Dec 2025 with signupIncludesCurrentMonth=false → first billing Jan 2026 = Jan 2026
    expect(isGrandfatheredExcluded(change, 2026, 1)).toBe(false)
  })

  it('34. grandfathered change, first billing month AFTER change → NOT excluded (affected)', () => {
    const change = pc(2026, 1, '21.00', 'GBP', true)
    // joining in Jan 2026 → first billing Feb 2026 > Jan 2026
    expect(isGrandfatheredExcluded(change, 2026, 2)).toBe(false)
  })

  it('35. FairyLoot scenario: join Nov 2025, signupIncludesCurrentMonth=false → first billing Dec 2025, grandfathered Jan 2026 change → excluded', () => {
    const change = pc(2026, 1, '21.00', 'GBP', true)
    const { year, month } = computeFirstBillingMonth(2025, 11, false) // Dec 2025
    expect(isGrandfatheredExcluded(change, year, month)).toBe(true)
  })

  it('36. FairyLoot scenario: join Dec 2025, signupIncludesCurrentMonth=false → first billing Jan 2026, grandfathered Jan 2026 change → NOT excluded (pays new price)', () => {
    const change = pc(2026, 1, '21.00', 'GBP', true)
    const { year, month } = computeFirstBillingMonth(2025, 12, false) // Jan 2026
    expect(isGrandfatheredExcluded(change, year, month)).toBe(false)
  })
})

// ── buildFirstBoxCandidates / applyFirstBoxChoice ─────────────────────────────
//
// Regression coverage for a real bug: a genuinely quarterly-release subscription
// (isBundleSubscription=false, intervalMonths=3 — content itself only exists every 3rd month,
// e.g. Enchantasy-style) showed March / June / July as previous/current/next — July was wrong,
// should have been September. The synthetic "next" placeholder was shifting by 1 calendar month
// whenever isBundleMode was false, instead of by the subscription's actual release cadence
// (intervalMonths) — which applies just as much to a non-bundle quarterly release as to an actual
// bundle box.

// buildFirstBoxCandidates(eligibleMonths, previousBoxMonths, joinWindowYear, joinWindowMonth,
//   suggestedYear, suggestedMonth, isBundleMode, intervalMonths, startingMonth)
// In most tests below joinWindow === suggested (no divergence) — see the dedicated
// "join-window vs suggested diverge" block for the Afterlight-style case where they don't.

describe('buildFirstBoxCandidates', () => {
  it('quarterly release (isBundleMode=false, intervalMonths=3): no content after June → next is September, not July', () => {
    const eligibleMonths = [month('june', 2026, 6)]
    const previousBoxMonths = [month('march', 2026, 3)]
    const candidates = buildFirstBoxCandidates(eligibleMonths, previousBoxMonths, 2026, 6, 2026, 6, false, 3, 3)
    expect(candidates.previous).toMatchObject({ year: 2026, month: 3 })
    expect(candidates.current).toMatchObject({ year: 2026, month: 6 })
    expect(candidates.next).toMatchObject({ year: 2026, month: 9, monthIds: [] })
  })

  it('actual bundle box (isBundleMode=true, intervalMonths=3): no content after the current bundle → next is 3 months later', () => {
    // Bundle content is monthly under the hood, but grouped into 3-month blocks for picking.
    const eligibleMonths = [month('apr', 2026, 4), month('may', 2026, 5), month('jun', 2026, 6)]
    const candidates = buildFirstBoxCandidates(eligibleMonths, [], 2026, 4, 2026, 4, true, 3, 4)
    expect(candidates.current).toMatchObject({ year: 2026, month: 4, endYear: 2026, endMonth: 6 })
    expect(candidates.next).toMatchObject({ year: 2026, month: 7, monthIds: [] })
  })

  it('plain monthly (intervalMonths=1): no content after current → next is 1 month later', () => {
    const eligibleMonths = [month('jun', 2026, 6)]
    const candidates = buildFirstBoxCandidates(eligibleMonths, [], 2026, 6, 2026, 6, false, 1, 1)
    expect(candidates.next).toMatchObject({ year: 2026, month: 7, monthIds: [] })
  })

  it('when real content already exists for next, uses it instead of a synthetic placeholder', () => {
    const eligibleMonths = [month('june', 2026, 6), month('sept', 2026, 9)]
    const candidates = buildFirstBoxCandidates(eligibleMonths, [], 2026, 6, 2026, 6, false, 3, 3)
    expect(candidates.next).toMatchObject({ year: 2026, month: 9, monthIds: ['sept'] })
  })

  it('suggested matches whichever slot equals the eligibility guess', () => {
    const eligibleMonths = [month('june', 2026, 6), month('sept', 2026, 9)]
    const candidates = buildFirstBoxCandidates(eligibleMonths, [], 2026, 6, 2026, 6, false, 3, 3)
    expect(candidates.suggested).toBe('current')
  })

  // Regression coverage for a real bug report: "Afterlight Romance" (monthly, renewalDay=1,
  // signupIncludesCurrentMonth=false) — joining Aug 2 (after the Aug 1 renewal already fired),
  // the eligibility-computed first box is September (join-modal-utils.ts's "current"/suggested
  // slot used to be pinned to that). But August is the box actually shipping RIGHT NOW — showing
  // it as "previous" instead of "current" was confusing. joinWindow (Aug) and the eligibility
  // suggestion (Sep) are allowed to diverge: "current" always follows joinWindow; "suggested"
  // just marks whichever of the 3 slots matches the eligibility guess.
  describe('join-window vs suggested diverge (signupIncludesCurrentMonth=false mid-cycle join)', () => {
    it('"current" follows the join-date window (August), not the eligibility default (September)', () => {
      // eligibleMonths/previousBoxMonths are fetched anchored at joinWindow (Aug) now, not at the
      // eligibility default (Sep) — Sep isn't announced yet so it's not in eligibleMonths at all.
      const eligibleMonths = [month('aug', 2026, 8)]
      const previousBoxMonths = [month('july', 2026, 7)]
      const candidates = buildFirstBoxCandidates(eligibleMonths, previousBoxMonths, 2026, 8, 2026, 9, false, 1, 1)
      expect(candidates.previous).toMatchObject({ year: 2026, month: 7, monthIds: ['july'] })
      expect(candidates.current).toMatchObject({ year: 2026, month: 8, monthIds: ['aug'] })
      expect(candidates.next).toMatchObject({ year: 2026, month: 9, monthIds: [] }) // Sep not yet announced
      expect(candidates.suggested).toBe('next') // September is the eligibility guess, shown as "next" here
    })
  })
})

describe('applyFirstBoxChoice', () => {
  it('picking "next" drops the current unit\'s months from the eligible list', () => {
    const eligibleMonths = [month('june', 2026, 6), month('sept', 2026, 9)]
    const candidates = buildFirstBoxCandidates(eligibleMonths, [], 2026, 6, 2026, 6, false, 3, 3)
    const result = applyFirstBoxChoice('next', eligibleMonths, [], candidates)
    expect(result.map(m => m.id)).toEqual(['sept'])
  })

  it('picking "previous" prepends previousBoxMonths to the eligible list', () => {
    const eligibleMonths = [month('june', 2026, 6)]
    const previousBoxMonths = [month('march', 2026, 3)]
    const candidates = buildFirstBoxCandidates(eligibleMonths, previousBoxMonths, 2026, 6, 2026, 6, false, 3, 3)
    const result = applyFirstBoxChoice('previous', eligibleMonths, previousBoxMonths, candidates)
    expect(result.map(m => m.id)).toEqual(['march', 'june'])
  })

  it('picking "current" leaves the eligible list untouched', () => {
    const eligibleMonths = [month('june', 2026, 6), month('sept', 2026, 9)]
    const candidates = buildFirstBoxCandidates(eligibleMonths, [], 2026, 6, 2026, 6, false, 3, 3)
    const result = applyFirstBoxChoice('current', eligibleMonths, [], candidates)
    expect(result.map(m => m.id)).toEqual(['june', 'sept'])
  })
})
