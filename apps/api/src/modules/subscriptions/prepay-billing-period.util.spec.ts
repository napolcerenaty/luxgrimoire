/**
 * Tests for the shared prepay billing-period helpers used by the renewal cron, the join-time
 * first-box preorder, and manual backfill — see prepay-billing-period.util.ts for why these
 * three call sites all need the exact same "create or reuse" semantics.
 *
 * ensurePrepayBillingPeriod:
 *   - Creates a new billing period when none covers [year, month].
 *   - Reuses an existing period when one covers [year, month] AND has available slots.
 *   - Creates a new period when the existing one is exhausted (all slots filled).
 *   - Covers the correct month range (currentMonth … currentMonth + N - 1), including
 *     year-boundary wraparound.
 *   - Returns the resolved periodId and slotsFilled in both the reuse and create cases.
 *
 * findReusableBillingPeriod:
 *   - Returns null when no period covers the month.
 *   - Returns the period id when one covers the month, has a free slot, and monthsCovered matches.
 *   - Returns null when a covering period exists but monthsCovered does NOT match (mismatched
 *     window — treat as "no period" rather than silently reusing the wrong one).
 *   - Returns null when the covering period's slots are all filled.
 *   - Never creates anything.
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { ensurePrepayBillingPeriod, findReusableBillingPeriod } from './prepay-billing-period.util';

const ENTRY_ID = 'entry-1';
const YEAR = 2025;
const MONTH = 4; // April
const BILLED_AT = new Date(Date.UTC(2025, 3, 1));

const GBP_OPTION = {
  id: 'opt-gbp',
  months: 3,
  price: { toString: () => '87.00' },
  currency: 'GBP',
};

describe('ensurePrepayBillingPeriod', () => {
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    jest.clearAllMocks();
  });

  it('creates a billing period when no billing periods exist', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [] });
    (prisma.userSubBillingPeriod.create as jest.Mock).mockResolvedValueOnce({ id: 'bp-new' });

    const result = await ensurePrepayBillingPeriod(prisma, ENTRY_ID, YEAR, MONTH, BILLED_AT, GBP_OPTION);

    expect(prisma.userSubBillingPeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryId: ENTRY_ID,
          baseAmount: '87.00',
          monthsCovered: 3,
          paidCurrency: 'GBP',
          coveredFromYear: 2025,
          coveredFromMonth: 4,
          coveredToYear: 2025,
          coveredToMonth: 6,
          billedAt: BILLED_AT,
          prepayOptionId: 'opt-gbp',
        }),
      }),
    );
    expect(result).toEqual({ periodId: 'bp-new', slotsFilled: 0 });
  });

  it('wraps coveredTo across a year boundary', async () => {
    const decOption = { id: 'opt-dec', months: 6, price: { toString: () => '180.00' }, currency: 'EUR' };
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [] });
    (prisma.userSubBillingPeriod.create as jest.Mock).mockResolvedValueOnce({ id: 'bp-new' });

    await ensurePrepayBillingPeriod(prisma, ENTRY_ID, 2025, 12, BILLED_AT, decOption);

    expect(prisma.userSubBillingPeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coveredFromYear: 2025,
          coveredFromMonth: 12,
          coveredToYear: 2026,
          coveredToMonth: 5,
        }),
      }),
    );
  });

  it('reuses an existing period covering the month with a free slot', async () => {
    const existingPeriod = {
      id: 'bp-active',
      coveredFromYear: 2025,
      coveredFromMonth: 4,
      coveredToYear: 2025,
      coveredToMonth: 6,
      monthsCovered: 3,
    };
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [existingPeriod] });
    (prisma.userPurchaseGroup.count as jest.Mock).mockResolvedValueOnce(1);

    const result = await ensurePrepayBillingPeriod(prisma, ENTRY_ID, YEAR, MONTH, BILLED_AT, GBP_OPTION);

    expect(prisma.userSubBillingPeriod.create).not.toHaveBeenCalled();
    expect(result).toEqual({ periodId: 'bp-active', slotsFilled: 1 });
  });

  it('creates a new period when the existing one covering the month has all slots filled', async () => {
    const exhaustedPeriod = {
      id: 'bp-done',
      coveredFromYear: 2025,
      coveredFromMonth: 4,
      coveredToYear: 2025,
      coveredToMonth: 6,
      monthsCovered: 3,
    };
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [exhaustedPeriod] });
    (prisma.userPurchaseGroup.count as jest.Mock).mockResolvedValueOnce(3);
    (prisma.userSubBillingPeriod.create as jest.Mock).mockResolvedValueOnce({ id: 'bp-new' });

    const result = await ensurePrepayBillingPeriod(prisma, ENTRY_ID, YEAR, MONTH, BILLED_AT, GBP_OPTION);

    expect(prisma.userSubBillingPeriod.create).toHaveBeenCalled();
    expect(result).toEqual({ periodId: 'bp-new', slotsFilled: 0 });
  });
});

describe('findReusableBillingPeriod', () => {
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    jest.clearAllMocks();
  });

  it('returns null when no period covers the month', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [] });

    const result = await findReusableBillingPeriod(prisma, ENTRY_ID, YEAR, MONTH, 3);

    expect(result).toBeNull();
  });

  it('returns the period id when it covers the month, has a free slot, and monthsCovered matches', async () => {
    const period = {
      id: 'bp-join',
      coveredFromYear: 2025,
      coveredFromMonth: 4,
      coveredToYear: 2025,
      coveredToMonth: 6,
      monthsCovered: 3,
    };
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [period] });
    (prisma.userPurchaseGroup.count as jest.Mock).mockResolvedValueOnce(1);

    const result = await findReusableBillingPeriod(prisma, ENTRY_ID, 2025, 5, 3);

    expect(result).toBe('bp-join');
  });

  it('returns null when a covering period exists but monthsCovered does not match', async () => {
    const period = {
      id: 'bp-mismatch',
      coveredFromYear: 2025,
      coveredFromMonth: 4,
      coveredToYear: 2025,
      coveredToMonth: 6,
      monthsCovered: 3,
    };
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [period] });

    // Batch claims 6 months covered — doesn't match the existing 3-month period, so it must
    // not be silently reused (that would misattribute a 6-month payment to a 3-month period).
    const result = await findReusableBillingPeriod(prisma, ENTRY_ID, 2025, 5, 6);

    expect(result).toBeNull();
    expect(prisma.userPurchaseGroup.count).not.toHaveBeenCalled();
  });

  it('returns null when the covering period has no free slots', async () => {
    const period = {
      id: 'bp-full',
      coveredFromYear: 2025,
      coveredFromMonth: 4,
      coveredToYear: 2025,
      coveredToMonth: 6,
      monthsCovered: 3,
    };
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [period] });
    (prisma.userPurchaseGroup.count as jest.Mock).mockResolvedValueOnce(3);

    const result = await findReusableBillingPeriod(prisma, ENTRY_ID, 2025, 5, 3);

    expect(result).toBeNull();
  });

  it('never creates a billing period', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [] });

    await findReusableBillingPeriod(prisma, ENTRY_ID, YEAR, MONTH, 3);

    expect(prisma.userSubBillingPeriod.create).not.toHaveBeenCalled();
  });
});
