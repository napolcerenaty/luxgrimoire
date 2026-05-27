/**
 * Pure helper utilities for the JoinSubscriptionModal billing flow.
 *
 * Extracted here so they can be unit-tested independently.
 */

import { parseDecimalInput } from './parseDecimalInput'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PriceChangeRecord {
  effectiveYear: number
  effectiveMonth: number
  newBasePrice: string
  currency: string
}

export interface PrepayOptionRecord {
  months: number
  price: number | string
  currency: string
  validFrom?: string | null
  validUntil?: string | null
}

export interface SubscriptionMonthRef {
  id: string
  year: number
  month: number
}

export interface ComputedBatch {
  billingDate: string   // ISO date yyyy-mm-dd
  monthIds: string[]
  amount: string        // base price as decimal string
  currency: string
}

// ── lookupPriceAt ─────────────────────────────────────────────────────────────

/**
 * Find the most recent official base price effective at or before the given
 * billing date (YYYY-MM-DD), for the specified currency.
 *
 * Returns `fallback` when:
 * - `dateStr` is empty
 * - no price change record exists for the currency on/before that date
 */
export function lookupPriceAt(
  dateStr: string,
  priceChanges: PriceChangeRecord[],
  currency: string,
  fallback: string,
): string {
  if (!dateStr) return fallback
  const [y, m] = dateStr.split('-').map(Number)
  const matching = priceChanges
    .filter(pc => pc.currency === currency)
    .filter(pc => pc.effectiveYear < y || (pc.effectiveYear === y && pc.effectiveMonth <= m))
    .sort((a, b) => b.effectiveYear !== a.effectiveYear ? b.effectiveYear - a.effectiveYear : b.effectiveMonth - a.effectiveMonth)
  return matching.length > 0 ? matching[0].newBasePrice : fallback
}

// ── lookupPrepayPriceAt ───────────────────────────────────────────────────────

/**
 * Find the prepay option price valid at the given billing date for a specific
 * (months, currency) combination.
 *
 * Returns `fallbackPrice` when no matching option is found.
 */
export function lookupPrepayPriceAt(
  billingDateStr: string,
  options: PrepayOptionRecord[],
  targetMonths: number,
  targetCurrency: string,
  fallbackPrice: string,
): string {
  if (!billingDateStr) return fallbackPrice
  const matching = options
    .filter(o => o.months === targetMonths && o.currency === targetCurrency)
    .filter(o => {
      const from = o.validFrom ? o.validFrom.slice(0, 10) : null
      const until = o.validUntil ? o.validUntil.slice(0, 10) : null
      return (!from || from <= billingDateStr) && (!until || until > billingDateStr)
    })
    .sort((a, b) => {
      const af = a.validFrom ?? ''
      const bf = b.validFrom ?? ''
      return bf > af ? 1 : bf < af ? -1 : 0
    })
  return matching.length > 0 ? String(matching[0].price) : fallbackPrice
}

// ── resolveBackfillFallbackPrice ──────────────────────────────────────────────

/**
 * Pick the correct fallback base price for a backfill batch when the user
 * leaves the amount field blank.
 *
 * Priority:
 *  1. Use the entry base price (the price the user actually entered / had set
 *     in Step 1, in their chosen currency).  This covers both:
 *     - custom currency (no official price records) → user's own entered value
 *     - official currency where entry.basePrice was auto-filled from price history
 *  2. Fall back to the current prepay option price if entry.basePrice is absent.
 *  3. Fall back to 0 if nothing is available.
 */
export function resolveBackfillFallbackPrice(
  entryBasePrice: string | null | undefined,
  prepayOptionPrice: string | number | null | undefined,
): string {
  const fromEntry = entryBasePrice ? parseDecimalInput(entryBasePrice) : 0
  if (fromEntry > 0) return String(fromEntry)
  const fromPrepay = prepayOptionPrice != null ? parseDecimalInput(String(prepayOptionPrice)) : 0
  if (fromPrepay > 0) return String(fromPrepay)
  return '0'
}

// ── computeAutoBatches ────────────────────────────────────────────────────────

/**
 * Group selected months into prepay billing batches.
 *
 * - Skipped months (not in selectedMonthIds) extend the current batch (they
 *   don't count toward N).
 * - For the first batch the billing date is derived from startDate; subsequent
 *   batches use the first month of the batch + renewalDay.
 * - The batch amount is looked up from allPrepayOptions at that billing date
 *   and currency; if none found, fallbackPrice is used (should be the user's
 *   entry.basePrice so custom-currency users get the right amount).
 */
export function computeAutoBatches(
  eligibleMonths: SubscriptionMonthRef[],
  selectedMonthIds: string[],
  prepayN: number,
  renewalDay: number | null,
  currency: string,
  allPrepayOptions: PrepayOptionRecord[],
  fallbackPrice: string,
  startDate?: string | null,
): ComputedBatch[] {
  const selectedSet = new Set(selectedMonthIds)
  const sorted = [...eligibleMonths].sort(
    (a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month,
  )

  // Parse the subscription start date for first batch billing date
  let firstBatchDate: string | null = null
  if (startDate) {
    if (startDate.length === 7) {
      const day = renewalDay ?? 1
      firstBatchDate = `${startDate}-${String(day).padStart(2, '0')}`
    } else {
      firstBatchDate = startDate
    }
  }

  const batches: ComputedBatch[] = []
  let batchStart: { year: number; month: number } | null = null
  let currentBatch: string[] = []

  for (const m of sorted) {
    if (batchStart === null) batchStart = { year: m.year, month: m.month }
    if (selectedSet.has(m.id)) {
      currentBatch.push(m.id)
      if (currentBatch.length === prepayN) {
        const day = renewalDay ?? 1
        const isFirst = batches.length === 0
        const dateStr = isFirst && firstBatchDate
          ? firstBatchDate
          : `${batchStart.year}-${String(batchStart.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const batchAmount = parseDecimalInput(lookupPrepayPriceAt(dateStr, allPrepayOptions, prepayN, currency, fallbackPrice)).toFixed(2)
        batches.push({ billingDate: dateStr, monthIds: [...currentBatch], amount: batchAmount, currency })
        batchStart = null
        currentBatch = []
      }
    }
  }
  // Partial last batch — always use full period price
  if (currentBatch.length > 0 && batchStart) {
    const day = renewalDay ?? 1
    const isFirst = batches.length === 0
    const dateStr = isFirst && firstBatchDate
      ? firstBatchDate
      : `${batchStart.year}-${String(batchStart.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const batchAmount = parseDecimalInput(lookupPrepayPriceAt(dateStr, allPrepayOptions, prepayN, currency, fallbackPrice)).toFixed(2)
    batches.push({ billingDate: dateStr, monthIds: [...currentBatch], amount: batchAmount, currency })
  }
  return batches
}
