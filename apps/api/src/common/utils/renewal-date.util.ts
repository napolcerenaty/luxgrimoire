import { PrismaService } from '../../prisma/prisma.service';

function incrementMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1];
}

/**
 * Pure function — computes the next renewal date given subscription parameters.
 * Used both for display (API responses) and for persisting to DB.
 */
export function computeNextRenewalDate(
  renewalDay: number,
  type: string | null,
  startingMonth: number | null,
  userStartDate: string | null,
  skippedMonths: { year: number; month: number }[] = [],
  /**
   * For paymentOnStartup subscriptions: the billing month that was already paid at signup.
   * This month is skipped when searching for the next due date.
   */
  paidUpFrontDate: Date | null = null,
): Date | null {
  const interval = type === 'QUARTERLY' ? 3 : type === 'BIMONTHLY' ? 2 : 1;
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
      skipRecords: {
        where: { undoneAt: null },
        include: { month: { select: { year: true, month: true } } },
      },
      subscription: {
        select: {
          id: true,
          renewalDay: true,
          type: true,
          startingMonth: true,
          paymentOnStartup: true,
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
  const renewalDay = entry.renewalDay ?? sub.renewalDay ?? 1;
  const skippedMonths = (entry.skipRecords as any[]).map((r) => ({
    year: r.month.year,
    month: r.month.month,
  }));

  // For paymentOnStartup: determine which month was already paid at signup
  let paidUpFrontDate: Date | null = null;
  if (sub.paymentOnStartup && entry.startDate) {
    const joinDate = new Date(entry.startDate);
    const joinDay = joinDate.getUTCDate();
    const joinYear = joinDate.getUTCFullYear();
    const joinMonth = joinDate.getUTCMonth() + 1;
    const renewalPassedThisMonth = renewalDay < joinDay;
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
    paidUpFrontDate = new Date(Date.UTC(paidYear, paidMonth - 1, renewalDay));
  }

  const nextDate = computeNextRenewalDate(
    renewalDay,
    sub.type ?? null,
    sub.startingMonth ?? null,
    entry.startDate ?? null,
    skippedMonths,
    paidUpFrontDate,
  );

  await prisma.userSubscriptionEntry.update({
    where: { id: entryId },
    data: { nextRenewalDate: nextDate ?? null },
  });
}
