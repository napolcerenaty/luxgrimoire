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
  grandfatheredPrice?: boolean
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

// ── Grandfathered price helpers ───────────────────────────────────────────────

/**
 * Compute the first billing month (year + month) for a subscriber joining on a
 * given date, taking into account the renewal cycle.
 *
 * "Current month" = the box month the LAST renewal was for.
 * "Next month"    = the box month the NEXT renewal is for.
 *
 * Algorithm:
 *   renewalAlreadyHappened = joinDay >= (renewalDay ?? 1)
 *   lastBillingMonth = joinMonth if renewalAlreadyHappened, else joinMonth - 1
 *   currentBoxMonth  = lastBillingMonth + renewalMonthOffset
 *   signupIncludesCurrentMonth=true  → first = currentBoxMonth
 *   signupIncludesCurrentMonth=false → first = currentBoxMonth + 1
 */
export function computeFirstBillingMonth(
  joinYear: number,
  joinMonth: number,
  signupIncludesCurrentMonth: boolean,
  joinDay = 1,
  renewalDay: number | null = null,
  renewalMonthOffset = 0,
): { year: number; month: number } {
  const effectiveRenewalDay = renewalDay ?? 1;
  const renewalAlreadyHappened = joinDay >= effectiveRenewalDay;

  let lastBillingMonth = joinMonth;
  let lastBillingYear = joinYear;
  if (!renewalAlreadyHappened) {
    lastBillingMonth -= 1;
    if (lastBillingMonth === 0) { lastBillingMonth = 12; lastBillingYear -= 1; }
  }

  let currentBoxMonth = lastBillingMonth + renewalMonthOffset;
  let currentBoxYear = lastBillingYear;
  while (currentBoxMonth > 12) { currentBoxMonth -= 12; currentBoxYear += 1; }
  while (currentBoxMonth < 1)  { currentBoxMonth += 12; currentBoxYear -= 1; }

  if (signupIncludesCurrentMonth) return { year: currentBoxYear, month: currentBoxMonth };

  let firstMonth = currentBoxMonth + 1;
  let firstYear = currentBoxYear;
  if (firstMonth > 12) { firstMonth = 1; firstYear += 1; }
  return { year: firstYear, month: firstMonth };
}

/**
 * Returns true when a grandfathered price change does NOT apply to a new
 * subscriber — i.e. their first billing month is before the change's
 * effective month, so they are considered a pre-existing subscriber who
 * keeps the old price.
 *
 * Returns false when:
 * - the change is not grandfathered
 * - the first billing month is on or after the effective month (user pays new price)
 */
export function isGrandfatheredExcluded(
  pc: PriceChangeRecord,
  firstBillingYear: number,
  firstBillingMonth: number,
): boolean {
  if (!pc.grandfatheredPrice) return false
  // User's first billing month is on or after change → they pay the new price (not excluded)
  if (
    firstBillingYear > pc.effectiveYear ||
    (firstBillingYear === pc.effectiveYear && firstBillingMonth >= pc.effectiveMonth)
  ) return false
  // User's first billing month is before the change → grandfathered, excluded
  return true
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
