import { PrismaService } from '../../prisma/prisma.service';
import { resolveEffectiveSettings } from '../../modules/subscriptions/subscription-settings.util';

function incrementMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1];
}

/**
 * Shifts (year, month) by `offset` months (positive = forward, negative = backward).
 * Used to convert between box month and renewal month when renewalMonthOffset > 0.
 */
function shiftMonth(year: number, month: number, offset: number): [number, number] {
  let m = month + offset;
  let y = year;
  while (m > 12) { m -= 12; y++; }
  while (m <= 0) { m += 12; y--; }
  return [y, m];
}

function getRenewalAlignmentBaseMonth(startingMonth: number, renewalMonthOffset: number): number {
  // startingMonth is always the box (content) month; renewal month = box month - offset,
  // for both positive and negative offsets (see renewalMonthFromBoxMonth).
  const adjustedStartingMonth = startingMonth - renewalMonthOffset;
  return ((adjustedStartingMonth - 1 + 1200) % 12) + 1;
}

/**
 * Converts a box month to its corresponding renewal month.
 * renewal month = box month - offset  (e.g. May box, offset=1 → April renewal)
 */
export function renewalMonthFromBoxMonth(year: number, month: number, offset: number): [number, number] {
  return shiftMonth(year, month, -offset);
}

/**
 * Returns the start {year, month} of the bundle period (box months) that contains the given
 * (year, month). Bundle cycles begin at `startingMonth` and repeat every `intervalMonths` months.
 * Mirrors apps/web/src/lib/bundleHelpers.ts#getBundleStart — keep in sync.
 */
export function getBundleBoxStart(
  year: number,
  month: number,
  startingMonth: number,
  intervalMonths: number,
): { year: number; month: number } {
  const absMonth = year * 12 + (month - 1);
  const absStart = 2000 * 12 + (startingMonth - 1);
  const intervals = Math.floor((absMonth - absStart) / intervalMonths);
  const bundleAbsStart = absStart + intervals * intervalMonths;
  return {
    year: Math.floor(bundleAbsStart / 12),
    month: (bundleAbsStart % 12) + 1,
  };
}

/**
 * Returns the `intervalMonths` consecutive calendar (year, month) slots that make up a bundle
 * period, starting at `start`.
 */
export function enumerateBundleMonths(
  start: { year: number; month: number },
  intervalMonths: number,
): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  let y = start.year;
  let m = start.month;
  for (let i = 0; i < intervalMonths; i++) {
    months.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

/**
 * Advances (year, month) forward by `n` months.
 */
export function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  let y = year;
  let m = month + n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return { year: y, month: m };
}

/**
 * Subscription-wide (not per-user) check: is this subscription generally due to ship/renew in
 * calendar month (year, month)? Unlike computeFirstEligibleBoxMonth/computeLastProcessedBoxMonth
 * (which are per-user, keyed off a join date), this only looks at the subscription's own
 * lifecycle fields — used to scan across all subscriptions for a given month (admin gap view,
 * public books-by-month catalog).
 *
 * Discontinued subscriptions stay visible for PAST months (they were live then) but drop out of
 * the current/future scan — that's the whole point of "discontinued". `isHidden` subscriptions
 * (incomplete historical data, not yet ready to show users) and `isUpcoming` subscriptions
 * (announced/waitlist-only, not actually launched) are excluded unconditionally, in every month —
 * unlike `isDiscontinued`, an upcoming subscription has no past either, so there's no month where
 * it should ever count as due. `startDate` alone isn't a reliable signal for this: an upcoming
 * subscription commonly has no startDate set yet at all.
 *
 * Cadence: `intervalMonths`/`startingMonth` behave differently depending on `isBundleSubscription`.
 * A bundle (isBundleSubscription=true) ships N calendar months packaged together, but each of
 * those calendar months still gets its own SubscriptionMonth row — content is monthly, only the
 * shipping/packaging is multi-month — so a bundle is due EVERY calendar month. A non-bundle
 * subscription with intervalMonths>1 (e.g. a genuinely quarterly release, isBundleSubscription
 * false) only has SubscriptionMonth rows on its cadence-aligned months (e.g. Mar/Jun/Sep/Dec for
 * startingMonth=3, intervalMonths=3) — every other month is never going to have data and must not
 * be flagged as due/missing.
 */
export function isSubscriptionDueInMonth(
  sub: {
    startDate: Date | null;
    endDate: Date | null;
    isDiscontinued: boolean;
    isHidden: boolean;
    isUpcoming?: boolean;
    intervalMonths?: number;
    startingMonth?: number | null;
    isBundleSubscription?: boolean;
  },
  year: number,
  month: number,
  now: Date = new Date(),
): boolean {
  if (sub.isHidden) return false;
  if (sub.isUpcoming) return false;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (sub.isDiscontinued && monthStart >= currentMonthStart) return false;
  if (sub.startDate && sub.startDate > monthEnd) return false;
  if (sub.endDate && sub.endDate < monthStart) return false;

  const interval = sub.intervalMonths ?? 1;
  if (interval > 1 && !sub.isBundleSubscription) {
    const cycleStart = getBundleBoxStart(year, month, sub.startingMonth ?? 1, interval);
    if (cycleStart.year !== year || cycleStart.month !== month) return false;
  }
  return true;
}

/**
 * Does a UserSubscriptionEntry cover calendar month (year, month)? Cancellation (see
 * cancelMySubscription) never deletes the row or touches startDate — it only sets
 * active=false and cancellationDate — so a CANCELLED entry still counts as covering any month
 * up to (and including) the one it was cancelled in: a user who cancelled mid-July was still
 * subscribed for part of July, so July should still show as "theirs". Month-level granularity
 * (not day-level) is enough here since highlighting is per calendar month, not per day.
 */
export function entryCoversMonth(
  entry: { startDate: string | null; cancellationDate: string | null; active: boolean },
  year: number,
  month: number,
): boolean {
  const targetAbs = year * 12 + (month - 1);
  if (entry.startDate) {
    const p = entry.startDate.split('-').map(Number);
    const startAbs = p[0] * 12 + ((p[1] ?? 1) - 1);
    if (startAbs > targetAbs) return false;
  }
  if (!entry.active) {
    if (!entry.cancellationDate) return false;
    const p = entry.cancellationDate.split('-').map(Number);
    const cancelAbs = p[0] * 12 + ((p[1] ?? 1) - 1);
    if (cancelAbs < targetAbs) return false;
  }
  return true;
}

/**
 * For bundle subscriptions: finds the renewal month for the most recently FIRED quarterly (or
 * N-monthly) renewal as of refDate. "Fired" = refDay >= renewalDay in or before the renewal month.
 *
 * Algorithm:
 * - Base renewal month stays on startingMonth for non-negative offsets and shifts forward for
 *   negative offsets, e.g. startingMonth=1, offset=-2 → base=3 (March)
 * - Find k such that baseAbs + k*interval is the most recent aligned month
 * - If that month has fired (is in the past or is current with refDay >= renewalDay) → return it
 * - Otherwise → go back one interval
 */
function findMostRecentFiredRenewalMonth(
  refDate: Date,
  renewalDay: number,
  renewalMonthOffset: number,
  startingMonth: number,
  intervalMonths: number,
): { year: number; month: number } {
  const baseMonth0 = getRenewalAlignmentBaseMonth(startingMonth, renewalMonthOffset) - 1;
  const baseAbs = 2000 * 12 + baseMonth0;
  const refAbs0 = refDate.getFullYear() * 12 + refDate.getMonth();

  const k = Math.floor((refAbs0 - baseAbs) / intervalMonths);
  let candidateAbs0 = baseAbs + k * intervalMonths;
  let cYear = Math.floor(candidateAbs0 / 12);
  let cMonth = (candidateAbs0 % 12) + 1;

  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth() + 1;
  const refDay = refDate.getDate();

  const hasFired =
    cYear < refYear ||
    (cYear === refYear && cMonth < refMonth) ||
    (cYear === refYear && cMonth === refMonth && refDay >= renewalDay);

  if (!hasFired) {
    candidateAbs0 -= intervalMonths;
    cYear = Math.floor(candidateAbs0 / 12);
    cMonth = (candidateAbs0 % 12) + 1;
  }

  return { year: cYear, month: cMonth };
}

/**
 * For bundle subscriptions: finds the renewal month for the CURRENT bundle cycle.
 * "Current" means the renewal that defines the bundle the user is currently in or joining.
 *
 * The (baseAbs + k*intervalMonths) floor-division above already selects the cycle whose
 * calendar-month window [candidate, candidate+intervalMonths) contains refDate — that's true
 * regardless of how far refMonth has advanced past cMonth within the window (e.g. a bimonthly
 * cycle starting May stays "current" all through June, not just on May itself). The ONLY
 * day-level correction needed is at the window's OPENING month: if refDate is still in that
 * exact month but hasn't reached renewalDay yet, the cycle hasn't actually started firing yet,
 * so the true current cycle is the previous one — shift back by one interval.
 *
 * (Previously this also forced a forward shift whenever cMonth < refMonth, treating "later
 * month in the same window" as "expired" — which broke every multi-month, non-boundary month:
 * e.g. joining a bimonthly box mid-cycle always got bumped to the NEXT cycle instead of the
 * one already running. See the Enchantasy bimonthly regression this was fixed for.)
 *
 * Used by computeFirstEligibleBoxMonth for bundle subscriptions.
 */
function findCurrentBundleRenewal(
  refDate: Date,
  renewalDay: number,
  renewalMonthOffset: number,
  startingMonth: number,
  intervalMonths: number,
): { year: number; month: number } {
  const baseMonth0 = getRenewalAlignmentBaseMonth(startingMonth, renewalMonthOffset) - 1;
  const baseAbs = 2000 * 12 + baseMonth0;
  const refAbs0 = refDate.getFullYear() * 12 + refDate.getMonth();

  const k = Math.floor((refAbs0 - baseAbs) / intervalMonths);
  let candidateAbs0 = baseAbs + k * intervalMonths;
  let cYear = Math.floor(candidateAbs0 / 12);
  let cMonth = (candidateAbs0 % 12) + 1;

  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth() + 1;
  const refDay = refDate.getDate();

  const cycleNotYetStarted = cYear === refYear && cMonth === refMonth && refDay < renewalDay;

  if (cycleNotYetStarted) {
    candidateAbs0 -= intervalMonths;
    cYear = Math.floor(candidateAbs0 / 12);
    cMonth = (candidateAbs0 % 12) + 1;
  }

  return { year: cYear, month: cMonth };
}

/**
 * Compute the first eligible box month for a subscriber.
 * For monthly subscriptions (intervalMonths=1): uses the simple joinDay >= renewalDay heuristic.
 * For bundle subscriptions (intervalMonths>1): uses findCurrentBundleRenewal to correctly
 * identify the current bundle and apply offset.
 *
 *   signupIncludesCurrentMonth=true  → firstBox = current bundle start
 *   signupIncludesCurrentMonth=false → firstBox = next bundle start (current + intervalMonths)
 *
 * @param subscriptionStartDate - When provided and `joinDate` is before it, the entry predates
 *   the subscription's own launch (allowed for standalone subs, for historical data entry — see
 *   joinSubscription). There's no earlier cycle for such a joiner to be "mid-way through", and the
 *   normal cycle math has no notion of "this cycle didn't exist yet": depending on phase alignment
 *   it can land before, at, or after the true launch box. So this case is special-cased directly to
 *   the box month containing subscriptionStartDate, bypassing signupIncludesCurrentMonth entirely.
 */
export function computeFirstEligibleBoxMonth(
  joinDate: Date,
  renewalDay: number,
  renewalMonthOffset: number,
  signupIncludesCurrentMonth: boolean,
  intervalMonths = 1,
  startingMonth = 1,
  subscriptionStartDate: Date | null = null,
): { year: number; month: number } {
  if (subscriptionStartDate) {
    // Defensive: callers may pass a value that's typed as Date but is actually a string at
    // runtime (e.g. subscriptions fetched through a cache layer that JSON-serializes results,
    // turning Date fields into ISO strings) — coerce so the comparison below can't silently
    // become `number < NaN` (always false) and skip this branch.
    const subStart = subscriptionStartDate instanceof Date ? subscriptionStartDate : new Date(subscriptionStartDate);
    if (joinDate < subStart) {
      return getBundleBoxStart(
        subStart.getUTCFullYear(),
        subStart.getUTCMonth() + 1,
        startingMonth,
        intervalMonths,
      );
    }
  }

  if (intervalMonths > 1) {
    const { year: rYear, month: rMonth } = findCurrentBundleRenewal(
      joinDate, renewalDay, renewalMonthOffset, startingMonth, intervalMonths,
    );
    let boxMonth = rMonth + renewalMonthOffset;
    let boxYear = rYear;
    while (boxMonth > 12) { boxMonth -= 12; boxYear++; }
    while (boxMonth < 1)  { boxMonth += 12; boxYear--; }

    if (!signupIncludesCurrentMonth) {
      boxMonth += intervalMonths;
      while (boxMonth > 12) { boxMonth -= 12; boxYear++; }
    }
    return { year: boxYear, month: boxMonth };
  }

  const joinDay = joinDate.getDate();
  const renewalAlreadyHappened = joinDay >= renewalDay;

  let lastBillingMonth = joinDate.getMonth() + 1;
  let lastBillingYear = joinDate.getFullYear();
  if (!renewalAlreadyHappened) {
    lastBillingMonth -= 1;
    if (lastBillingMonth === 0) { lastBillingMonth = 12; lastBillingYear -= 1; }
  }

  let boxMonth = lastBillingMonth + renewalMonthOffset;
  let boxYear = lastBillingYear;
  while (boxMonth > 12) { boxMonth -= 12; boxYear += 1; }
  while (boxMonth < 1)  { boxMonth += 12; boxYear -= 1; }

  if (!signupIncludesCurrentMonth) {
    boxMonth += 1;
    if (boxMonth > 12) { boxMonth = 1; boxYear += 1; }
  }

  return { year: boxYear, month: boxMonth };
}

/**
 * Compute the last box month whose renewal has already processed as of the reference date.
 * For monthly subscriptions: uses the simple refDay >= renewalDay heuristic.
 * For bundle subscriptions (intervalMonths>1): uses findMostRecentFiredRenewalMonth to correctly
 * identify the last fired quarterly (or N-monthly) renewal and returns the bundle END month.
 *
 *   refDay >= renewalDay → renewal has happened → lastBilledMonth = refMonth (for monthly)
 *   refDay <  renewalDay → renewal hasn't fired  → lastBilledMonth = refMonth - 1 (for monthly)
 *   For bundles: returns the END month of the last fired bundle (bundleStart + intervalMonths - 1)
 */
export function computeLastProcessedBoxMonth(
  referenceDate: Date,
  renewalDay: number,
  renewalMonthOffset: number,
  intervalMonths = 1,
  startingMonth = 1,
): { year: number; month: number } {
  if (intervalMonths > 1) {
    const { year: rYear, month: rMonth } = findMostRecentFiredRenewalMonth(
      referenceDate, renewalDay, renewalMonthOffset, startingMonth, intervalMonths,
    );
    let boxStart = rMonth + renewalMonthOffset;
    let boxStartYear = rYear;
    while (boxStart > 12) { boxStart -= 12; boxStartYear++; }
    while (boxStart < 1)  { boxStart += 12; boxStartYear--; }

    let boxEnd = boxStart + intervalMonths - 1;
    let boxEndYear = boxStartYear;
    while (boxEnd > 12) { boxEnd -= 12; boxEndYear++; }
    return { year: boxEndYear, month: boxEnd };
  }

  const refDay = referenceDate.getDate();
  const renewalHappened = refDay >= renewalDay;

  let lastBilledMonth = referenceDate.getMonth() + 1;
  let lastBilledYear = referenceDate.getFullYear();
  if (!renewalHappened) {
    lastBilledMonth -= 1;
    if (lastBilledMonth === 0) { lastBilledMonth = 12; lastBilledYear -= 1; }
  }

  let boxMonth = lastBilledMonth + renewalMonthOffset;
  let boxYear = lastBilledYear;
  while (boxMonth > 12) { boxMonth -= 12; boxYear += 1; }
  while (boxMonth < 1)  { boxMonth += 12; boxYear -= 1; }

  return { year: boxYear, month: boxMonth };
}

/**
 * Computes all past renewal dates for a subscription entry.
 * Used to backfill UserSubscriptionRenewal records for calendar display.
 *
 * @param renewalDay - Default renewal day used when no per-month override is provided.
 * @param renewalDayFn - Optional per-month override: given (year, month), returns the
 *   effective renewal day for that month. When provided, takes precedence over `renewalDay`.
 *   Used to apply settings-history-aware day resolution in backfillRenewalHistory.
 */
export function computePastRenewalDates(
  renewalDay: number,
  intervalMonths: number,
  startingMonth: number | null,
  startDate: Date,
  skippedMonths: { year: number; month: number }[],
  renewalMonthOffset: number = 0,
  renewalDayFn?: (year: number, month: number) => number,
): Date[] {
  const interval = intervalMonths;
  const now = new Date();
  const dates: Date[] = [];

  let year = startDate.getUTCFullYear();
  let month = startDate.getUTCMonth() + 1;

  for (let i = 0; i < 120; i++) {
    // For multi-month intervals, skip months that don't align to renewal months.
    // Negative renewalMonthOffset values shift the alignment base forward into renewal-month space.
    if (interval > 1 && startingMonth != null) {
      const alignBase = getRenewalAlignmentBaseMonth(startingMonth, renewalMonthOffset);
      const monthDiff = ((month - alignBase) % 12 + 12) % 12;
      if (monthDiff % interval !== 0) {
        [year, month] = incrementMonth(year, month);
        continue;
      }
    }

    const effectiveDay = renewalDayFn ? renewalDayFn(year, month) : renewalDay;
    const candDate = new Date(Date.UTC(year, month - 1, effectiveDay));

    if (candDate >= now) break;

    if (candDate >= startDate) {
      const isSkipped = skippedMonths.some((s) => s.year === year && s.month === month);
      if (!isSkipped) dates.push(candDate);
    }

    [year, month] = incrementMonth(year, month);
  }

  return dates;
}

/**
 * Pure function — computes the next renewal date given subscription parameters.
 * Used both for display (API responses) and for persisting to DB.
 */
export function computeNextRenewalDate(
  renewalDay: number,
  intervalMonths: number,
  startingMonth: number | null,
  userStartDate: string | null,
  skippedMonths: { year: number; month: number }[] = [],
  /**
   * For paymentOnStartup subscriptions: the billing month that was already paid at signup.
   * This month is skipped when searching for the next due date.
   */
  paidUpFrontDate: Date | null = null,
  /**
   * The subscription's own start date. Candidates before this date are excluded,
   * which prevents returning renewal dates for months before the subscription begins.
   * Example: user joins a subscription that starts Nov 2026 — July 2026 (aligned to
   * a 4-month cycle) should not be returned as the next renewal.
   */
  subscriptionEarliestDate: Date | null = null,
  /**
   * Offset from renewal month to box/content month. For example, renewalMonthOffset=-2
   * means the renewal in March covers the January–March bundle (1 - (-2) = March for renewal).
   * This shifts the alignment base so renewal months land on correct quarterly dates.
   */
  renewalMonthOffset: number = 0,
): Date | null {
  const interval = intervalMonths;
  const now = new Date();
  // Start iteration from the later of "now" and "subscriptionEarliestDate" so that
  // we don't waste iterations (and exceed the loop cap) on months before the
  // subscription opens for business.
  const floorDate = subscriptionEarliestDate && subscriptionEarliestDate > now
    ? subscriptionEarliestDate
    : now;
  let candYear = floorDate.getUTCFullYear();
  let candMonth = floorDate.getUTCMonth() + 1;

  for (let i = 0; i < 24; i++) {
    if (interval > 1 && startingMonth != null) {
      // Negative renewalMonthOffset values shift the alignment base forward.
      // e.g. startingMonth=1 (Jan content), offset=-2 → alignBase=3 (March renewals)
      const alignBase = getRenewalAlignmentBaseMonth(startingMonth, renewalMonthOffset);
      const monthDiff = ((candMonth - alignBase) % 12 + 12) % 12;
      if (monthDiff % interval !== 0) {
        [candYear, candMonth] = incrementMonth(candYear, candMonth);
        continue;
      }
    }

    if (paidUpFrontDate) {
      const paidYear = paidUpFrontDate.getFullYear();
      const paidMonth = paidUpFrontDate.getMonth() + 1;
      if (candYear === paidYear && candMonth === paidMonth) {
        [candYear, candMonth] = incrementMonth(candYear, candMonth);
        continue;
      }
    }

    const candDate = new Date(Date.UTC(candYear, candMonth - 1, renewalDay));
    const isSkipped = skippedMonths.some((s) => s.year === candYear && s.month === candMonth);

    if (!isSkipped && candDate > now) {
      if (subscriptionEarliestDate && candDate < subscriptionEarliestDate) {
        [candYear, candMonth] = incrementMonth(candYear, candMonth);
        continue;
      }
      if (userStartDate) {
        const startD = new Date(userStartDate);
        if (candDate >= startD) return candDate;
      } else {
        return candDate;
      }
    }

    [candYear, candMonth] = incrementMonth(candYear, candMonth);
  }
  return null;
}

/**
 * For prepaid subscriptions: computes the next renewal date by tracking
 * how many non-skipped billing months have been used in the current period.
 * Each prepay period covers exactly `prepayMonths` non-skipped months.
 * A skip extends the current period by one month.
 *
 * @param skippedMonths - months in renewal-month space (after applying renewalMonthOffset)
 */
export function computeNextRenewalDatePrepaid(
  renewalDay: number,
  prepayMonths: number,
  startDate: Date,
  paymentOnStartup: boolean,
  paidUpFrontDate: Date | null,
  skippedMonths: { year: number; month: number }[],
): Date | null {
  const skipped = new Set(skippedMonths.map((s) => `${s.year}-${s.month}`));
  const now = new Date();

  // Determine the first billing year/month
  let billingYear: number;
  let billingMonth: number;

  if (paymentOnStartup && paidUpFrontDate) {
    billingYear = paidUpFrontDate.getUTCFullYear();
    billingMonth = paidUpFrontDate.getUTCMonth() + 1;
  } else {
    // First renewal day strictly after the start date
    billingYear = startDate.getUTCFullYear();
    billingMonth = startDate.getUTCMonth() + 1;
    const startDay = startDate.getUTCDate();
    if (startDay >= renewalDay) {
      [billingYear, billingMonth] = incrementMonth(billingYear, billingMonth);
    }
  }

  // Walk through prepay periods: each period covers `prepayMonths` non-skipped months
  for (let iter = 0; iter < 200; iter++) {
    let year = billingYear;
    let month = billingMonth;
    let boxCount = 0;

    while (boxCount < prepayMonths) {
      if (!skipped.has(`${year}-${month}`)) {
        boxCount++;
      }
      if (boxCount < prepayMonths) {
        [year, month] = incrementMonth(year, month);
      }
    }

    // Next period starts the month after the last box month of this period
    [year, month] = incrementMonth(year, month);
    const nextRenewal = new Date(Date.UTC(year, month - 1, renewalDay));

    if (nextRenewal > now) return nextRenewal;

    // This period's renewal already passed — advance to the next period
    billingYear = year;
    billingMonth = month;
  }

  return null;
}

/**
 * Company-wide (not per-user) skipped box months for a subscription — see SubscriptionMonthSkip.
 * A plain equality lookup on subscriptionId: the admin write path (subscriptions.service.ts
 * markMonthSkipped) denormalizes one row per content-stream member subscription up front, so no
 * parent/variant resolution is needed here.
 */
export async function getSubscriptionMonthSkips(
  prisma: PrismaService,
  subscriptionId: string,
): Promise<{ year: number; month: number }[]> {
  return prisma.subscriptionMonthSkip.findMany({
    where: { subscriptionId, undoneAt: null },
    select: { year: true, month: true },
  });
}

/**
 * Recomputes and persists nextRenewalDate for a given entry.
 * Call this after: join, skip, unskip, cancel.
 */
export async function refreshNextRenewalDate(
  prisma: PrismaService,
  entryId: string,
): Promise<void> {
  const entry = await prisma.userSubscriptionEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      active: true,
      startDate: true,
      renewalDay: true,
      prepaidMonths: true,
      scheduledPrepayOptionId: true,
      scheduledPrepayOption: { select: { months: true } },
      skipRecords: {
        where: { undoneAt: null },
        include: { month: { select: { year: true, month: true } } },
      },
      subscription: {
        select: {
          id: true,
          startDate: true,
          renewalDay: true,
          renewalDayUserSet: true,
          intervalMonths: true,
          startingMonth: true,
          paymentOnStartup: true,
          renewalMonthOffset: true,
          signupIncludesCurrentMonth: true,
          settingsHistory: {
            select: {
              effectiveFrom: true,
              renewalDay: true,
              renewalDayUserSet: true,
              paymentOnStartup: true,
              signupIncludesCurrentMonth: true,
              renewalMonthOffset: true,
            },
          },
        },
      },
    },
  });

  if (!entry) return;

  if (!entry.active) {
    await prisma.userSubscriptionEntry.update({
      where: { id: entryId },
      data: { nextRenewalDate: null },
    });
    return;
  }

  const sub = entry.subscription as any;

  type HistoryEntry = { effectiveFrom: Date; renewalDay: number | null; renewalDayUserSet: boolean; paymentOnStartup: boolean; signupIncludesCurrentMonth: boolean; renewalMonthOffset: number };
  const history = (sub.settingsHistory ?? []) as HistoryEntry[];
  const fallbackSettings = {
    renewalDay: sub.renewalDay ?? null,
    renewalDayUserSet: sub.renewalDayUserSet ?? false,
    paymentOnStartup: sub.paymentOnStartup ?? false,
    signupIncludesCurrentMonth: sub.signupIncludesCurrentMonth ?? false,
    renewalMonthOffset: sub.renewalMonthOffset ?? 0,
  };

  const subStartDate: Date | null = sub.startDate ? new Date(sub.startDate) : null;

  /**
   * Shift sub.startDate back by renewalMonthOffset months so the floor is in
   * renewal-month space.  Example: sub starts Nov 2026, offset=1 → earliest
   * renewal is Oct 2026 (the month before the first box).
   */
  function buildSubscriptionEarliestDate(renewalOffset: number): Date | null {
    if (!subStartDate) return null;
    let ey = subStartDate.getUTCFullYear();
    let em = subStartDate.getUTCMonth() + 1 - renewalOffset;
    while (em <= 0) { em += 12; ey--; }
    return new Date(Date.UTC(ey, em - 1, 1));
  }

  // Two-step settings resolution:
  // Step 1 — compute a rough candidate next renewal date using current sub settings (ignoring
  //           history) to determine which calendar month the next renewal will fall in.
  // Step 2 — resolve effective settings for THAT target month, then recompute the final date.
  //
  // This is critical: using "now"'s month would apply the wrong settings when called right after
  // processing a renewal that fired today (e.g. cron fires June 18, next renewal is July —
  // we need July's settings, not June's).
  const now = new Date();
  const baseRenewalDay = fallbackSettings.renewalDayUserSet
    ? (entry.renewalDay ?? 1)
    : (fallbackSettings.renewalDay ?? 1);
  const roughCandidate = computeNextRenewalDate(
    baseRenewalDay,
    sub.intervalMonths ?? 1,
    sub.startingMonth ?? null,
    entry.startDate ?? null,
    [],
    null,
    buildSubscriptionEarliestDate(fallbackSettings.renewalMonthOffset),
    fallbackSettings.renewalMonthOffset,
  );
  const targetYear = roughCandidate?.getUTCFullYear() ?? now.getUTCFullYear();
  const targetMonth = roughCandidate ? roughCandidate.getUTCMonth() + 1 : now.getUTCMonth() + 1;

  const effectiveSettings = resolveEffectiveSettings(history, targetYear, targetMonth, fallbackSettings);

  // If the subscription uses a fixed renewal day, use the subscription's day.
  // If it uses each subscriber's own sign-up day (renewalDayUserSet), use the entry's day.
  const renewalDay = effectiveSettings.renewalDayUserSet
    ? (entry.renewalDay ?? 1)
    : (effectiveSettings.renewalDay ?? 1);

  const offset: number = effectiveSettings.renewalMonthOffset;
  // Skip records are keyed by box month; convert to renewal month for the renewal-date computation
  const personalSkippedMonths = (entry.skipRecords as any[]).map((r) => {
    const [ry, rm] = renewalMonthFromBoxMonth(r.month.year, r.month.month, offset);
    return { year: ry, month: rm };
  });
  const companySkips = await getSubscriptionMonthSkips(prisma, sub.id);
  const companySkippedMonths = companySkips.map((s) => {
    const [ry, rm] = renewalMonthFromBoxMonth(s.year, s.month, offset);
    return { year: ry, month: rm };
  });
  const skippedMonths = [...personalSkippedMonths, ...companySkippedMonths];

  // For paymentOnStartup: determine which month was already paid at signup
  let paidUpFrontDate: Date | null = null;
  if (effectiveSettings.paymentOnStartup && entry.startDate) {
    const joinDate = new Date(entry.startDate);
    const { year: firstEligibleYear, month: firstEligibleMonth } = computeFirstEligibleBoxMonth(
      joinDate,
      renewalDay,
      offset,
      effectiveSettings.signupIncludesCurrentMonth,
      sub.intervalMonths ?? 1,
      sub.startingMonth ?? 1,
      subStartDate,
    );
    const firstSubMonth = await prisma.subscriptionMonth.findFirst({
      where: {
        subscriptionId: sub.id,
        OR: [
          { year: { gt: firstEligibleYear } },
          { year: firstEligibleYear, month: { gte: firstEligibleMonth } },
        ],
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
      select: { year: true, month: true },
    });
    const paidYear = firstSubMonth?.year ?? firstEligibleYear;
    const paidMonth = firstSubMonth?.month ?? firstEligibleMonth;
    // Convert box month → renewal month (paidUpFrontDate is used to skip the already-charged renewal)
    const [renewalYear, renewalMonth] = renewalMonthFromBoxMonth(paidYear, paidMonth, offset);
    paidUpFrontDate = new Date(Date.UTC(renewalYear, renewalMonth - 1, renewalDay));
  }

  const prepayOption = (entry as any).scheduledPrepayOption as { months: number } | null;
  // Use scheduledPrepayOption.months if available; fall back to prepaidMonths field for resilience
  const effectivePrepayMonths: number | null = prepayOption?.months ?? ((entry as any).prepaidMonths > 1 ? (entry as any).prepaidMonths : null);

  let nextDate: Date | null;
  if (effectivePrepayMonths && entry.startDate) {
    const parts = entry.startDate.split('-').map(Number);
    const startDateParsed = new Date(Date.UTC(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1));
    nextDate = computeNextRenewalDatePrepaid(
      renewalDay,
      effectivePrepayMonths,
      startDateParsed,
      effectiveSettings.paymentOnStartup,
      paidUpFrontDate,
      skippedMonths,
    );
  } else {
    nextDate = computeNextRenewalDate(
      renewalDay,
      sub.intervalMonths ?? 1,
      sub.startingMonth ?? null,
      entry.startDate ?? null,
      skippedMonths,
      paidUpFrontDate,
      buildSubscriptionEarliestDate(offset),
      offset,
    );
  }

  await prisma.userSubscriptionEntry.update({
    where: { id: entryId },
    data: { nextRenewalDate: nextDate ?? null },
  });
}

/**
 * Backfills UserSubscriptionRenewal records for a given entry.
 * Computes all past renewal dates and upserts them as source='backfill'.
 * Safe to call multiple times — uses upsert with unique(entryId, renewalDate).
 */
export async function backfillRenewalHistory(
  prisma: PrismaService,
  entryId: string,
): Promise<void> {
  const entry = await prisma.userSubscriptionEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      userId: true,
      active: true,
      startDate: true,
      renewalDay: true,
      skipRecords: {
        where: { undoneAt: null },
        include: { month: { select: { year: true, month: true } } },
      },
      subscription: {
        select: {
          id: true,
          renewalDay: true,
          renewalDayUserSet: true,
          intervalMonths: true,
          startingMonth: true,
          renewalMonthOffset: true,
          paymentOnStartup: true,
          signupIncludesCurrentMonth: true,
          settingsHistory: {
            select: {
              effectiveFrom: true,
              renewalDay: true,
              renewalDayUserSet: true,
              paymentOnStartup: true,
              signupIncludesCurrentMonth: true,
              renewalMonthOffset: true,
            },
          },
        },
      },
    },
  });

  if (!entry?.startDate) return;

  const sub = entry.subscription as any;
  const history = (sub.settingsHistory ?? []) as Array<{
    effectiveFrom: Date;
    renewalDay: number | null;
    renewalDayUserSet: boolean;
    paymentOnStartup: boolean;
    signupIncludesCurrentMonth: boolean;
    renewalMonthOffset: number;
  }>;
  const fallback = {
    renewalDay: sub.renewalDay ?? null,
    renewalDayUserSet: sub.renewalDayUserSet ?? false,
    paymentOnStartup: sub.paymentOnStartup ?? false,
    signupIncludesCurrentMonth: sub.signupIncludesCurrentMonth ?? false,
    renewalMonthOffset: sub.renewalMonthOffset ?? 0,
  };

  // Use base offset for skipped-month conversion (offset is unlikely to change
  // but we use the fallback here as a conservative baseline).
  const offset: number = fallback.renewalMonthOffset;
  // Convert skipped box months → renewal months for computePastRenewalDates
  const personalSkippedMonths = (entry.skipRecords as any[]).map((r) => {
    const [ry, rm] = renewalMonthFromBoxMonth(r.month.year, r.month.month, offset);
    return { year: ry, month: rm };
  });
  const companySkips = await getSubscriptionMonthSkips(prisma, sub.id);
  const companySkippedMonths = companySkips.map((s) => {
    const [ry, rm] = renewalMonthFromBoxMonth(s.year, s.month, offset);
    return { year: ry, month: rm };
  });
  const skippedMonths = [...personalSkippedMonths, ...companySkippedMonths];

  // Parse startDate: supports YYYY-MM-DD and YYYY-MM
  const parts = entry.startDate.split('-').map(Number);
  const startDate = new Date(Date.UTC(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1));

  // Per-month renewal day resolved from settings history.
  const renewalDayFn = (year: number, month: number): number => {
    const s = resolveEffectiveSettings(history, year, month, fallback);
    return s.renewalDayUserSet ? (entry.renewalDay ?? 1) : (s.renewalDay ?? 1);
  };

  const dates = computePastRenewalDates(
    /* renewalDay (fallback, overridden per-month by fn) */ renewalDayFn(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth() + 1,
    ),
    sub.intervalMonths ?? 1,
    sub.startingMonth ?? null,
    startDate,
    skippedMonths,
    fallback.renewalMonthOffset,
    renewalDayFn,
  );

  if (dates.length === 0) return;

  // Upsert all past renewal dates — skip_duplicates handles idempotency
  await prisma.$transaction(
    dates.map((d) =>
      prisma.userSubscriptionRenewal.upsert({
        where: { entryId_renewalDate: { entryId, renewalDate: d } },
        create: { userId: entry.userId, entryId, renewalDate: d, source: 'backfill' },
        update: {}, // no-op if already exists
      }),
    ),
  );
}
