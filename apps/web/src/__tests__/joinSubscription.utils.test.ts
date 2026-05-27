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
} from '../lib/joinSubscription.utils'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function pc(year: number, month: number, price: string, currency = 'USD') {
  return { effectiveYear: year, effectiveMonth: month, newBasePrice: price, currency }
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
