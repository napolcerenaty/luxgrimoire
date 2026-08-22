import { PrismaService } from '../../prisma/prisma.service';

export interface PrepayPeriodOption {
  id: string;
  months: number;
  price: { toString(): string } | number | string;
  currency: string;
}

/**
 * Ensures a UserSubBillingPeriod exists covering (year, month) for this prepaid entry —
 * reusing an existing period that still has a free slot, or creating a new one spanning
 * option.months months forward from (year, month) otherwise.
 *
 * This is the one mechanism every prepaid purchase-recording path (renewal cron, join-time
 * first-box preorder, manual backfill) must share: whichever of them runs first for a given
 * window creates the period with the correct monthsCovered, and every later one — regardless
 * of which of those three call sites it is — must find and extend that same period instead of
 * re-deriving monthsCovered from whatever subset of months it happens to know about right now.
 *
 * Returns the period id and how many purchase groups already exist in it (before the caller's
 * own group is created) — the caller creates its own purchase group afterward and links
 * purchaseGroup.billingPeriodId to this id.
 */
export async function ensurePrepayBillingPeriod(
  prisma: PrismaService,
  entryId: string,
  year: number,
  month: number,
  billedAt: Date,
  option: PrepayPeriodOption,
): Promise<{ periodId: string; slotsFilled: number }> {
  const fullEntry = await prisma.userSubscriptionEntry.findUnique({
    where: { id: entryId },
    select: { billingPeriods: { orderBy: { billedAt: 'asc' } } },
  });

  const cur = year * 12 + month;
  for (const period of fullEntry?.billingPeriods ?? []) {
    const fromY = period.coveredFromYear, fromM = period.coveredFromMonth;
    const toY = period.coveredToYear ?? fromY, toM = period.coveredToMonth ?? fromM;
    if (cur >= fromY * 12 + fromM && cur <= toY * 12 + toM) {
      const slotsFilled = await prisma.userPurchaseGroup.count({
        where: { subscriptionEntryId: entryId, billingPeriodId: period.id },
      });
      if (slotsFilled < period.monthsCovered) {
        return { periodId: period.id, slotsFilled };
      }
    }
  }

  // No active period covers this month — create one for the next N months
  const endAbsMonth = month + option.months - 1;
  const coveredToYear = year + Math.floor((endAbsMonth - 1) / 12);
  const coveredToMonth = ((endAbsMonth - 1) % 12) + 1;

  const period = await prisma.userSubBillingPeriod.create({
    data: {
      entryId,
      baseAmount: option.price.toString(),
      monthsCovered: option.months,
      paidCurrency: option.currency,
      coveredFromYear: year,
      coveredFromMonth: month,
      coveredToYear,
      coveredToMonth,
      billedAt,
      prepayOptionId: option.id,
    },
  });
  return { periodId: period.id, slotsFilled: 0 };
}

/**
 * Looks for an existing UserSubBillingPeriod covering (year, month) with a free slot AND
 * whose monthsCovered matches expectedMonthsCovered — used by manual backfill to detect "this
 * batch's months are already covered by a period created elsewhere (e.g. the join-time
 * preorder)" so it can reuse that period instead of creating a duplicate one for the same
 * window. Unlike ensurePrepayBillingPeriod, this never creates anything — a mismatch or absence
 * just means "proceed as if no period exists yet".
 */
export async function findReusableBillingPeriod(
  prisma: PrismaService,
  entryId: string,
  year: number,
  month: number,
  expectedMonthsCovered: number,
): Promise<string | null> {
  const fullEntry = await prisma.userSubscriptionEntry.findUnique({
    where: { id: entryId },
    select: { billingPeriods: { orderBy: { billedAt: 'asc' } } },
  });

  const cur = year * 12 + month;
  for (const period of fullEntry?.billingPeriods ?? []) {
    const fromY = period.coveredFromYear, fromM = period.coveredFromMonth;
    const toY = period.coveredToYear ?? fromY, toM = period.coveredToMonth ?? fromM;
    if (cur >= fromY * 12 + fromM && cur <= toY * 12 + toM && period.monthsCovered === expectedMonthsCovered) {
      const slotsFilled = await prisma.userPurchaseGroup.count({
        where: { subscriptionEntryId: entryId, billingPeriodId: period.id },
      });
      if (slotsFilled < period.monthsCovered) {
        return period.id;
      }
    }
  }
  return null;
}
