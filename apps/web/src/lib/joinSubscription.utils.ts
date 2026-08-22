/**
 * Pure helper utilities for the JoinSubscriptionModal billing flow.
 *
 * Extracted here so they can be unit-tested independently.
 */

import { parseDecimalInput } from './parseDecimalInput'
import { groupIntoBundles, getBundleEnd } from './bundleHelpers'

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

// ── resolveBatchMonthsCovered ──────────────────────────────────────────────────

/**
 * Resolves how many months a manual ("yes" path) backfill row actually covers, for the
 * billingBatches payload sent to the backend.
 *
 * A row's months are normally bucketed automatically by date (bucketedMonthCount — how many
 * SubscriptionMonth rows happen to fall between this row's date and the next one's). That
 * undercounts a row that covers months which haven't been announced yet as real
 * SubscriptionMonth rows (typically the last row) — the row still covers however many months
 * were actually paid for, just fewer of them currently exist to bucket into it. The user can
 * override the count explicitly per row; an empty/invalid override falls back to the bucketed
 * count, preserving today's behavior for every row that doesn't need one.
 */
export function resolveBatchMonthsCovered(rowMonthsCovered: string, bucketedMonthCount: number): number {
  const parsed = parseInt(rowMonthsCovered, 10)
  return rowMonthsCovered !== '' && !Number.isNaN(parsed) && parsed > 0 ? parsed : bucketedMonthCount
}

// ── buildPartialPrepayBillingBatch ─────────────────────────────────────────────

export interface PartialPrepayBillingBatch {
  billedAt: string
  baseAmount: number
  monthsCovered: number
  currency: string
  monthIds: string[]
  shippingAmount?: number
  fees?: { name: string; amount: number; currency: string }[]
}

/**
 * Builds the single billingBatches entry for the "partial prepay period" join shortcut — when
 * a new joiner has fewer eligible months to backfill than their chosen prepay period length
 * (e.g. joining mid-quarter with only the current month announced so far), the modal skips the
 * Step3 batches UI (nothing meaningful to ask when there's only ever going to be one batch) and
 * calls /join/backfill directly.
 *
 * Sending NO billingBatches in that case used to make the backend fall through to its plain-
 * monthly "no batch" path, which is completely prepay-unaware: undivided price/shipping, and the
 * subscription's currently-effective MONTHLY price instead of what was actually paid for the
 * whole prepaid period. It also clobbers the correctly-divided preorder that join's own
 * recordFirstMonthAsPreorder just created for the same month(s), since this backfill call runs
 * afterward and wins the final book price. Building this batch explicitly routes it through the
 * same (now-fixed) division + period-reuse logic every other backfill path uses.
 *
 * entryFees (the entry's linked fee templates, e.g. postage/VAT) are included as batch.fees —
 * same as the full Step3 auto-path already does (autoBatchOverrides pre-fills fees from
 * entryFees) — so the backend's existing "divide batch.fees by monthsCovered" logic picks them
 * up too: the user enters one combined total (base price, shipping, AND any recurring fee) for
 * the whole prepaid period in one payment, so all of it needs splitting the same way.
 */
export function buildPartialPrepayBillingBatch(
  joinPayload: { startDate?: string; costCurrency?: string; basePrice?: string; shippingCost?: string } | null,
  prepayOption: { months: number; price: number | string },
  selectedMonthIds: string[],
  fallbackCurrency: string,
  entryFees: { name: string; amount: string; currency: string }[] = [],
): PartialPrepayBillingBatch {
  const baseAmount = parseDecimalInput(resolveBackfillFallbackPrice(joinPayload?.basePrice, prepayOption.price))
  const shippingAmount = joinPayload?.shippingCost ? parseDecimalInput(joinPayload.shippingCost) : undefined
  const fees = entryFees
    .filter(f => f.name && f.amount)
    .map(f => ({ name: f.name, amount: parseDecimalInput(f.amount), currency: f.currency }))
  return {
    billedAt: joinPayload?.startDate ?? new Date().toISOString().slice(0, 10),
    baseAmount,
    monthsCovered: prepayOption.months,
    currency: joinPayload?.costCurrency ?? fallbackCurrency,
    monthIds: selectedMonthIds,
    ...(fees.length > 0 && { fees }),
    ...(shippingAmount !== undefined && { shippingAmount }),
  }
}

// ── First-box picker (previous / current / next) ─────────────────────────────

export interface BoxUnitMonth {
  id: string
  year: number
  month: number
}

export interface BoxCandidate {
  year: number
  month: number
  endYear: number
  endMonth: number
  /** IDs of the real SubscriptionMonth rows making up this unit — empty means "not yet announced". */
  monthIds: string[]
}

export interface FirstBoxCandidates {
  previous: BoxCandidate | null
  current: BoxCandidate
  next: BoxCandidate
  /**
   * Which of the 3 above matches the server's renewal-cycle-aware eligibility suggestion
   * (defaultFirstBoxYear/Month) — null if none do (rare: a large renewalMonthOffset can land
   * outside this ±1 window). Drives the "Suggested" badge and the picker's initial selection.
   */
  suggested: 'previous' | 'current' | 'next' | null
}

function shiftCalendarMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta
  let y = year
  while (m > 12) { m -= 12; y++ }
  while (m < 1) { m += 12; y-- }
  return { year: y, month: m }
}

function unitsFromMonths<T extends BoxUnitMonth>(
  months: T[],
  isBundleMode: boolean,
  intervalMonths: number,
  startingMonth: number,
): BoxCandidate[] {
  if (!isBundleMode) {
    return [...months]
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
      .map(m => ({ year: m.year, month: m.month, endYear: m.year, endMonth: m.month, monthIds: [m.id] }))
  }
  return groupIntoBundles(months, intervalMonths, startingMonth)
    .sort((a, b) => a.startYear !== b.startYear ? a.startYear - b.startYear : a.startMonth - b.startMonth)
    .map(g => ({ year: g.startYear, month: g.startMonth, endYear: g.endYear, endMonth: g.endMonth, monthIds: g.items.map(i => i.id) }))
}

function makeSyntheticCandidate(year: number, month: number, isBundleMode: boolean, intervalMonths: number): BoxCandidate {
  const end = isBundleMode ? getBundleEnd(year, month, intervalMonths) : { year, month }
  return { year, month, endYear: end.year, endMonth: end.month, monthIds: [] }
}

/**
 * Builds the previous/current/next candidates for the join modal's mandatory first-box picker
 * step, from the months already fetched by the dry-run join call — no extra requests needed.
 *
 * `current` is anchored on `joinWindowYear`/`joinWindowMonth` — the box unit containing the join
 * date's own calendar position (see computeJoinDateWindow), i.e. "the window presently in
 * progress" — NOT the renewal-cycle-aware eligibility suggestion. Those are deliberately
 * different: a subscriber joining today whose subscription has signupIncludesCurrentMonth=false
 * has an eligibility default of NEXT month, but the window actually shipping right now is still
 * THIS month — showing that as "current" (with next month separately marked "Suggested") is far
 * less confusing than making "current" jump ahead of the calendar. `suggestedYear`/`suggestedMonth`
 * (defaultFirstBoxYear/Month from the dry-run response) only decides which of the 3 gets the
 * "Suggested" badge. `previous`/`next` come from adjacent real content when it exists
 * (previousBoxMonths, or the second unit of eligibleMonths), or a calendar-shifted placeholder
 * with empty monthIds ("not yet announced") when it doesn't.
 */
export function buildFirstBoxCandidates(
  eligibleMonths: BoxUnitMonth[],
  previousBoxMonths: BoxUnitMonth[],
  joinWindowYear: number,
  joinWindowMonth: number,
  suggestedYear: number,
  suggestedMonth: number,
  isBundleMode: boolean,
  intervalMonths: number,
  startingMonth: number,
): FirstBoxCandidates {
  const eligibleUnits = unitsFromMonths(eligibleMonths, isBundleMode, intervalMonths, startingMonth)
  const prevUnits = unitsFromMonths(previousBoxMonths, isBundleMode, intervalMonths, startingMonth)

  const firstEligibleIsJoinWindow = !!eligibleUnits[0]
    && eligibleUnits[0].year === joinWindowYear
    && eligibleUnits[0].month === joinWindowMonth

  const current: BoxCandidate = firstEligibleIsJoinWindow
    ? eligibleUnits[0]
    : makeSyntheticCandidate(joinWindowYear, joinWindowMonth, isBundleMode, intervalMonths)

  const previous: BoxCandidate | null = prevUnits[0] ?? null

  const next: BoxCandidate = (firstEligibleIsJoinWindow && eligibleUnits[1])
    ? eligibleUnits[1]
    : (() => {
        // Shift by the subscription's own release cadence, not by `isBundleMode` — a genuinely
        // quarterly-release sub (isBundleSubscription=false, intervalMonths=3: content itself only
        // exists every 3rd month) needs the same +intervalMonths step as an actual bundle box.
        // `intervalMonths` is already 1 for plain monthly subs, so this covers every case.
        const nextStart = shiftCalendarMonth(current.year, current.month, intervalMonths)
        return makeSyntheticCandidate(nextStart.year, nextStart.month, isBundleMode, intervalMonths)
      })()

  const matchesSuggested = (c: BoxCandidate | null) => !!c && c.year === suggestedYear && c.month === suggestedMonth
  const suggested: 'previous' | 'current' | 'next' | null =
    matchesSuggested(previous) ? 'previous'
    : matchesSuggested(current) ? 'current'
    : matchesSuggested(next) ? 'next'
    : null

  return { previous, current, next, suggested }
}

/**
 * Given which of previous/current/next the user picked, returns the final set of months (in the
 * shape Step2 expects) to offer for backfill — previous prepends previousBoxMonths, next drops
 * the current unit's months, current leaves eligibleMonths untouched.
 */
export function applyFirstBoxChoice<T extends BoxUnitMonth>(
  choice: 'previous' | 'current' | 'next',
  eligibleMonths: T[],
  previousBoxMonths: T[],
  candidates: FirstBoxCandidates,
): T[] {
  if (choice === 'previous') {
    return [...previousBoxMonths, ...eligibleMonths]
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
  }
  if (choice === 'next') {
    const dropIds = new Set(candidates.current.monthIds)
    return eligibleMonths.filter(m => !dropIds.has(m.id))
  }
  return eligibleMonths
}
