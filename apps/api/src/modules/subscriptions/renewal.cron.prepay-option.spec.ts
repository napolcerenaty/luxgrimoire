/**
 * Tests for ensurePrepayBillingPeriod (private) and the processOneRenewal integration
 * with scheduledPrepayOption.
 *
 * ensurePrepayBillingPeriod:
 *   - Creates a new billing period when none covers [year, month].
 *   - Reuses an existing period when one covers [year, month] AND has available slots.
 *   - Creates a new period when existing one is exhausted (all slots filled).
 *   - Covers the correct month range (currentMonth … currentMonth + N - 1).
 *   - Uses the prepay option's currency, not entry.costCurrency.
 *
 * processOneRenewal integration:
 *   - Calls ensurePrepayBillingPeriod when scheduledPrepayOption is set.
 *   - Does NOT call it when scheduledPrepayOption is null.
 *   - Does NOT call it for bundle subscriptions.
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { RenewalCronService } from './renewal.cron';

jest.mock('../../common/utils/renewal-date.util', () => ({
  refreshNextRenewalDate: jest.fn().mockResolvedValue(undefined),
  computeNextRenewalDate: jest.requireActual('../../common/utils/renewal-date.util').computeNextRenewalDate,
  computePastRenewalDates: jest.requireActual('../../common/utils/renewal-date.util').computePastRenewalDates,
  renewalMonthFromBoxMonth: jest.requireActual('../../common/utils/renewal-date.util').renewalMonthFromBoxMonth,
}));

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const ENTRY_ID = 'entry-1';
const YEAR = 2025;
const MONTH = 4; // April
const RENEWAL_DATE = new Date(Date.UTC(2025, 3, 1)); // Apr 1 2025

const GBP_OPTION = {
  id: 'opt-gbp',
  months: 3,
  price: { toString: () => '87.00' },
  currency: 'GBP',
};

// ─── Suite: ensurePrepayBillingPeriod ────────────────────────────────────────

describe('RenewalCronService — ensurePrepayBillingPeriod', () => {
  let service: RenewalCronService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new RenewalCronService(prisma);
    jest.clearAllMocks();
  });

  /** Call the private method directly. */
  function call(opt = GBP_OPTION) {
    return (service as any).ensurePrepayBillingPeriod(ENTRY_ID, YEAR, MONTH, RENEWAL_DATE, opt);
  }

  it('creates a billing period when no billing periods exist', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [] });
    (prisma.userSubBillingPeriod.create as jest.Mock).mockResolvedValueOnce({ id: 'bp-new' });

    await call();

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
          billedAt: RENEWAL_DATE,
          prepayOptionId: 'opt-gbp',
        }),
      }),
    );
  });

  it('calculates correct coveredToYear/Month when window spans a year boundary', async () => {
    const decOption = { id: 'opt-dec', months: 6, price: { toString: () => '180.00' }, currency: 'EUR' };
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [] });
    (prisma.userSubBillingPeriod.create as jest.Mock).mockResolvedValueOnce({ id: 'bp-new' });

    // December 2025 + 6 months → ends May 2026
    await (service as any).ensurePrepayBillingPeriod(ENTRY_ID, 2025, 12, RENEWAL_DATE, decOption);

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

  it('does NOT create a period when an active period covers the month and has slots', async () => {
    const existingPeriod = {
      id: 'bp-active',
      coveredFromYear: 2025,
      coveredFromMonth: 4,
      coveredToYear: 2025,
      coveredToMonth: 6,
      monthsCovered: 3,
    };
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      billingPeriods: [existingPeriod],
    });
    // 1 slot used out of 3 → active
    (prisma.userPurchaseGroup.count as jest.Mock).mockResolvedValueOnce(1);

    await call();

    expect(prisma.userSubBillingPeriod.create).not.toHaveBeenCalled();
  });

  it('creates a new period when the existing period covering the month has all slots filled', async () => {
    const exhaustedPeriod = {
      id: 'bp-done',
      coveredFromYear: 2025,
      coveredFromMonth: 4,
      coveredToYear: 2025,
      coveredToMonth: 6,
      monthsCovered: 3,
    };
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      billingPeriods: [exhaustedPeriod],
    });
    // All 3 slots filled → NOT active
    (prisma.userPurchaseGroup.count as jest.Mock).mockResolvedValueOnce(3);
    (prisma.userSubBillingPeriod.create as jest.Mock).mockResolvedValueOnce({ id: 'bp-new' });

    await call();

    expect(prisma.userSubBillingPeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          monthsCovered: 3,
          paidCurrency: 'GBP',
          prepayOptionId: 'opt-gbp',
        }),
      }),
    );
  });

  it('uses the prepay option currency, not entry.costCurrency', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [] });
    (prisma.userSubBillingPeriod.create as jest.Mock).mockResolvedValueOnce({ id: 'bp-new' });

    // Entry costCurrency is USD but option is GBP
    await call(GBP_OPTION);

    const createArg = (prisma.userSubBillingPeriod.create as jest.Mock).mock.calls[0][0];
    expect(createArg.data.paidCurrency).toBe('GBP');
  });

  it('sets billedAt to renewalDate', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [] });
    (prisma.userSubBillingPeriod.create as jest.Mock).mockResolvedValueOnce({ id: 'bp-new' });

    await call();

    const createArg = (prisma.userSubBillingPeriod.create as jest.Mock).mock.calls[0][0];
    expect(createArg.data.billedAt).toBe(RENEWAL_DATE);
  });
});

// ─── Suite: processOneRenewal with scheduledPrepayOption ─────────────────────

describe('RenewalCronService — processOneRenewal with scheduledPrepayOption', () => {
  let service: RenewalCronService;
  let prisma: DeepMockProxy<PrismaService>;

  const makeEntry = (overrides: Record<string, unknown> = {}) => ({
    id: ENTRY_ID,
    userId: 'user-1',
    subscriptionId: 'sub-1',
    costCurrency: 'USD' as string | null,
    basePrice: null,
    shippingCost: null,
    nextRenewalDate: RENEWAL_DATE,
    scheduledPrepayOptionId: null as string | null,
    scheduledPrepayOption: null as typeof GBP_OPTION | null,
    subscription: { renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 },
    ...overrides,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new RenewalCronService(prisma);
    jest.clearAllMocks();
  });

  it('calls userSubBillingPeriod.create when scheduledPrepayOption is set and no period exists', async () => {
    (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValueOnce({});
    // ensurePrepayBillingPeriod internals
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ billingPeriods: [] });
    (prisma.userSubBillingPeriod.create as jest.Mock).mockResolvedValueOnce({ id: 'bp-new' });
    // addBooksForSubscriptionMonth — month not found → returns early
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ isCombo: false, comboComponents: [], parentSubscriptionId: null });
    (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await (service as any).processOneRenewal(
      makeEntry({ scheduledPrepayOption: GBP_OPTION, scheduledPrepayOptionId: GBP_OPTION.id }),
    );

    expect(prisma.userSubBillingPeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paidCurrency: 'GBP',
          monthsCovered: 3,
          prepayOptionId: 'opt-gbp',
        }),
      }),
    );
  });

  it('does NOT call userSubBillingPeriod.create when scheduledPrepayOption is null', async () => {
    (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValueOnce({});
    // addBooksForSubscriptionMonth — month not found → returns early
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ isCombo: false, comboComponents: [], parentSubscriptionId: null });
    (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await (service as any).processOneRenewal(makeEntry());

    expect(prisma.userSubBillingPeriod.create).not.toHaveBeenCalled();
  });

  it('does NOT call userSubBillingPeriod.create for bundle subscriptions', async () => {
    (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValueOnce({});
    // addBooksForBundleMonths internals
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ parentSubscriptionId: null });
    (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await (service as any).processOneRenewal(
      makeEntry({
        scheduledPrepayOption: GBP_OPTION,
        scheduledPrepayOptionId: GBP_OPTION.id,
        subscription: { renewalMonthOffset: 0, isBundleSubscription: true, intervalMonths: 3 },
      }),
    );

    expect(prisma.userSubBillingPeriod.create).not.toHaveBeenCalled();
  });

  it('skips ensurePrepayBillingPeriod entirely when renewal is already recorded (idempotency)', async () => {
    (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'existing' });

    await (service as any).processOneRenewal(
      makeEntry({ scheduledPrepayOption: GBP_OPTION, scheduledPrepayOptionId: GBP_OPTION.id }),
    );

    expect(prisma.userSubBillingPeriod.create).not.toHaveBeenCalled();
    expect(prisma.userSubscriptionRenewal.create).not.toHaveBeenCalled();
  });
});
