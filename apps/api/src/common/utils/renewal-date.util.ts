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

/**
 * Converts a box month to its corresponding renewal month.
 * renewal month = box month - offset  (e.g. May box, offset=1 → April renewal)
 */
export function renewalMonthFromBoxMonth(year: number, month: number, offset: number): [number, number] {
  return shiftMonth(year, month, -offset);
}

/**
 * Computes all past renewal dates for a subscription entry.
 * Used to backfill UserSubscriptionRenewal records for calendar display.
 */
export function computePastRenewalDates(
  renewalDay: number,
  intervalMonths: number,
  startingMonth: number | null,
  startDate: Date,
  skippedMonths: { year: number; month: number }[],
): Date[] {
  const interval = intervalMonths;
  const now = new Date();
  const dates: Date[] = [];

  let year = startDate.getUTCFullYear();
  let month = startDate.getUTCMonth() + 1;

  for (let i = 0; i < 120; i++) {
    // For multi-month intervals, skip months that don't align
    if (interval > 1 && startingMonth != null) {
      const offset = ((month - startingMonth) % 12 + 12) % 12;
      if (offset % interval !== 0) {
        [year, month] = incrementMonth(year, month);
        continue;
      }
    }

    const candDate = new Date(Date.UTC(year, month - 1, renewalDay));

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
): Date | null {
  const interval = intervalMonths;
  const now = new Date();
  let candYear = now.getFullYear();
  let candMonth = now.getMonth() + 1;

  for (let i = 0; i < 24; i++) {
    if (interval > 1 && startingMonth != null) {
      const offset = ((candMonth - startingMonth) % 12 + 12) % 12;
      if (offset % interval !== 0) {
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
  const skippedMonths = (entry.skipRecords as any[]).map((r) => {
    const [ry, rm] = renewalMonthFromBoxMonth(r.month.year, r.month.month, offset);
    return { year: ry, month: rm };
  });

  // For paymentOnStartup: determine which month was already paid at signup
  let paidUpFrontDate: Date | null = null;
  if (effectiveSettings.paymentOnStartup && entry.startDate) {
    const joinDate = new Date(entry.startDate);
    const joinDay = joinDate.getUTCDate();
    const joinYear = joinDate.getUTCFullYear();
    const joinMonth = joinDate.getUTCMonth() + 1;
    // If signupIncludesCurrentMonth: the signup month itself is always the first paid month,
    // regardless of whether the renewalDay has already passed.
    const renewalPassedThisMonth = !effectiveSettings.signupIncludesCurrentMonth && renewalDay < joinDay;
    let firstEligibleYear = joinYear;
    let firstEligibleMonth = joinMonth;
    if (renewalPassedThisMonth) {
      [firstEligibleYear, firstEligibleMonth] = incrementMonth(firstEligibleYear, firstEligibleMonth);
    }
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
        select: { renewalDay: true, intervalMonths: true, startingMonth: true, renewalMonthOffset: true },
      },
    },
  });

  if (!entry?.startDate) return;

  const sub = entry.subscription as any;
  const renewalDay: number = entry.renewalDay ?? sub.renewalDay ?? 1;
  const offset: number = sub.renewalMonthOffset ?? 0;
  // Convert skipped box months → renewal months for computePastRenewalDates
  const skippedMonths = (entry.skipRecords as any[]).map((r) => {
    const [ry, rm] = renewalMonthFromBoxMonth(r.month.year, r.month.month, offset);
    return { year: ry, month: rm };
  });

  // Parse startDate: supports YYYY-MM-DD and YYYY-MM
  const parts = entry.startDate.split('-').map(Number);
  const startDate = new Date(Date.UTC(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1));

  const dates = computePastRenewalDates(
    renewalDay,
    sub.intervalMonths ?? 1,
    sub.startingMonth ?? null,
    startDate,
    skippedMonths,
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
