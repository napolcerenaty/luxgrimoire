/**
 * Tests for prepaid billing period detection inside createPurchaseGroupAndBooks.
 * We drive the logic through the public addBooksForSubscriptionMonth and inspect
 * what prisma.userPurchaseGroup.create was called with.
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const YEAR = 2025;
const MONTH = 4; // April
const RENEWAL_DATE = new Date(Date.UTC(2025, 3, 1)); // Apr 1 2025

const BASE_ENTRY = {
  id: 'entry-1',
  userId: 'user-1',
  subscriptionId: 'sub-1',
  costCurrency: 'USD' as string | null,
  basePrice: { toString: () => '30' },
  shippingCost: { toString: () => '5' },
};

/** One book in the month */
const MONTH_BOOKS = [{ bookId: 'book-1', editionId: 'edition-1', signatureType: null }];

/** A minimal billing period covering April 2025 */
function makeBillingPeriod(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bp-1',
    billedAt: new Date(Date.UTC(2025, 2, 1)), // March 1 = payment date for a 2-month prepay
    coveredFromYear: 2025,
    coveredFromMonth: 4,
    coveredToYear: 2025,
    coveredToMonth: 5,
    monthsCovered: 2,
    baseAmount: { toString: () => '60' }, // 30 per month
    shipping: { toString: () => '10' },   // 5 per month
    paidCurrency: 'USD',
    ...overrides,
  };
}

// ─── Shared setup helpers ─────────────────────────────────────────────────────

function setupNonComboPeriodlessMocks(prisma: DeepMockProxy<PrismaService>, monthBooks = MONTH_BOOKS) {
  (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
    isCombo: false,
    comboComponents: [],
  });
  (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({
    id: 'month-1',
    signatureType: null,
    books: monthBooks,
  });
  (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);
}

function setupNoBillingPeriods(prisma: DeepMockProxy<PrismaService>) {
  (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
    billingPeriods: [],
  });
  (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);
}

function setupGroupCreation(prisma: DeepMockProxy<PrismaService>, groupData = { id: 'group-new' }) {
  (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce(null);
  (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce(groupData);
  (prisma.userSubscriptionEntryFeeTemplate.findMany as jest.Mock).mockResolvedValueOnce([]);
  (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
  (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({});
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('RenewalCronService — prepaid billing period', () => {
  let service: RenewalCronService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new RenewalCronService(prisma);
    jest.clearAllMocks();
  });

  // ── Active period found ───────────────────────────────────────────────────

  it('uses period.baseAmount/n and period.shipping/n when an active billing period covers the month', async () => {
    const period = makeBillingPeriod(); // covers April–May 2025, 2 months

    setupNonComboPeriodlessMocks(prisma);

    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      billingPeriods: [period],
    });
    // slots filled = 0 < monthsCovered=2 → active
    (prisma.userPurchaseGroup.count as jest.Mock).mockResolvedValueOnce(0);

    setupGroupCreation(prisma);

    await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 30,      // 60 / 2
          shippingAmount: 5,    // 10 / 2
          purchasedAt: period.billedAt,
          billingPeriodId: 'bp-1',
        }),
      }),
    );
  });

  it('uses period.billedAt as purchasedAt when period is active', async () => {
    const period = makeBillingPeriod();

    setupNonComboPeriodlessMocks(prisma);
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      billingPeriods: [period],
    });
    (prisma.userPurchaseGroup.count as jest.Mock).mockResolvedValueOnce(0);
    setupGroupCreation(prisma);

    await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

    const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.purchasedAt).toBe(period.billedAt);
  });

  // ── Slots filled ─────────────────────────────────────────────────────────

  it('falls back to regular pricing when all billing period slots are filled', async () => {
    const period = makeBillingPeriod(); // monthsCovered=2

    setupNonComboPeriodlessMocks(prisma);
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      billingPeriods: [period],
    });
    // slots filled = 2 >= monthsCovered=2 → NOT active
    (prisma.userPurchaseGroup.count as jest.Mock).mockResolvedValueOnce(2);
    // fallback path fetches price changes
    (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);
    setupGroupCreation(prisma);

    await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

    const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
    // fallback: use entry.basePrice = 30
    expect(createCall.data.totalAmount).toBe(30);
    expect(createCall.data.purchasedAt).toEqual(RENEWAL_DATE);
    expect(createCall.data.billingPeriodId).toBeUndefined();
  });

  // ── No billing period ─────────────────────────────────────────────────────

  it('uses entry.basePrice when no billing period exists', async () => {
    setupNonComboPeriodlessMocks(prisma);
    setupNoBillingPeriods(prisma);
    setupGroupCreation(prisma);

    await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

    const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.totalAmount).toBe(30); // parsed from '30'
    expect(createCall.data.billingPeriodId).toBeUndefined();
  });

  // ── Period doesn't cover current month ────────────────────────────────────

  it("uses entry.basePrice when billing period doesn't cover current year/month", async () => {
    // Period covers January–February 2025, not April
    const period = makeBillingPeriod({
      coveredFromYear: 2025,
      coveredFromMonth: 1,
      coveredToYear: 2025,
      coveredToMonth: 2,
    });

    setupNonComboPeriodlessMocks(prisma);
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      billingPeriods: [period],
    });
    // count not called since the period doesn't cover the month
    (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);
    setupGroupCreation(prisma);

    await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

    const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.totalAmount).toBe(30);
    expect(createCall.data.billingPeriodId).toBeUndefined();
  });

  // ── Multiple periods — picks the covering one ─────────────────────────────

  it('picks the period that covers the current month when multiple periods exist', async () => {
    const oldPeriod = makeBillingPeriod({
      id: 'bp-old',
      coveredFromYear: 2025,
      coveredFromMonth: 1,
      coveredToYear: 2025,
      coveredToMonth: 2,
    });
    const activePeriod = makeBillingPeriod({
      id: 'bp-active',
      coveredFromYear: 2025,
      coveredFromMonth: 4,
      coveredToYear: 2025,
      coveredToMonth: 5,
      billedAt: new Date(Date.UTC(2025, 2, 15)),
    });

    setupNonComboPeriodlessMocks(prisma);
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      billingPeriods: [oldPeriod, activePeriod],
    });
    // old period covers months 1–2 → count not called for it (doesn't cover month 4)
    // active period covers months 4–5 → count called once
    (prisma.userPurchaseGroup.count as jest.Mock).mockResolvedValueOnce(0); // slots filled for active
    setupGroupCreation(prisma);

    await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

    const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.billingPeriodId).toBe('bp-active');
  });

  // ── Skip + prepaid ────────────────────────────────────────────────────────

  it('returns early (books not added) when user has an active skip for the month', async () => {
    const period = makeBillingPeriod();

    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
      isCombo: false,
      comboComponents: [],
    });
    (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'month-1',
      signatureType: null,
      books: MONTH_BOOKS,
    });
    // User has an active skip (undoneAt = null)
    (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce({ undoneAt: null });

    await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

    // Neither billing period lookup nor group creation should happen
    expect(prisma.userSubscriptionEntry.findUnique).not.toHaveBeenCalled();
    expect(prisma.userPurchaseGroup.create).not.toHaveBeenCalled();
  });

  // ── Idempotency: reuses existing group ────────────────────────────────────

  it('does not call create when a purchase group already exists for the month', async () => {
    const period = makeBillingPeriod();

    setupNonComboPeriodlessMocks(prisma);
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      billingPeriods: [period],
    });
    (prisma.userPurchaseGroup.count as jest.Mock).mockResolvedValueOnce(0);
    // Existing group found → skip create
    (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'group-existing' });
    (prisma.userSubscriptionEntryFeeTemplate.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({});

    await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

    expect(prisma.userPurchaseGroup.create).not.toHaveBeenCalled();
  });
});
