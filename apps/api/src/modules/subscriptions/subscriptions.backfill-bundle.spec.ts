/**
 * Tests for backfillSubscription() on bundle subscriptions (isBundleSubscription=true,
 * intervalMonths>1) — ships N calendar months as ONE package: one payment, one shipment.
 *
 * Regression coverage for: backfill previously created one UserPurchaseGroup per
 * calendar month even for bundles, splitting a single real-world payment into N
 * fake ones. It must now create exactly ONE purchase group per bundle period,
 * containing every selected month's books, priced as a single purchase.
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const SUB_ID = 'sub-bundle-1';
const SUB_SLUG = 'bundle-test-sub';
const USER_ID = 'user-bundle-1';
const ENTRY_ID = 'entry-bundle-1';

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Quarterly Bundle Test Sub',
    isCombo: false,
    componentIds: [],
    currency: 'USD',
    renewalDay: 1,
    renewalDayUserSet: false,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: false,
    renewalMonthOffset: 0,
    isContentStream: false,
    isBundleSubscription: true,
    intervalMonths: 3,
    startingMonth: 1,
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    startDate: '2026-04-05',
    cancellationDate: null,
    renewalDay: 1,
    basePrice: { toString: () => '45.00' },
    costCurrency: 'USD',
    shippingCost: { toString: () => '12.00' },
    firstSkipDate: null,
    feeTemplates: [],
    ...overrides,
  };
}

function makeMonth(id: string, year: number, month: number, bookId = `bk-${id}`, editionId = `ed-${id}`) {
  return {
    id,
    year,
    month,
    signatureType: null,
    books: [{ editionId, bookId, signatureType: null }],
  };
}

/** Wires up the common mocks for one backfillSubscription() call. */
function setupBundleBackfill(
  prisma: DeepMockProxy<PrismaService>,
  skipMock: { recomputeSkipState: jest.Mock },
  options: {
    entry?: ReturnType<typeof makeEntry>;
    months: ReturnType<typeof makeMonth>[];
    purchaseGroupIds: string[];
  },
) {
  const { entry = makeEntry(), months, purchaseGroupIds } = options;

  (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);
  (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
  (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);
  (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce(months);

  for (const pgId of purchaseGroupIds) {
    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: pgId });
  }
  (prisma.userPurchaseGroup.update as jest.Mock).mockResolvedValue({ id: purchaseGroupIds[0] });

  const totalBooks = months.reduce((n, m) => n + m.books.length, 0);
  for (let i = 0; i < totalBooks; i++) {
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: `be-${i}` });
    (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});
  }

  // Skip-policy lookup + eligible-months-for-auto-skip (empty — not under test here)
  (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ id: SUB_ID, skipPolicies: [] });
  (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]);

  skipMock.recomputeSkipState.mockResolvedValueOnce(undefined);
}

describe('SubscriptionsService — backfillSubscription bundle subscriptions', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let skipMock: { recomputeSkipState: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    skipMock = { recomputeSkipState: jest.fn() };

    service = new SubscriptionsService(
      prisma,
      {} as any,
      skipMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { markStatsStale: jest.fn() } as any,
      { del: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  it('creates exactly ONE purchase group for a 3-month quarterly bundle, not one per month', async () => {
    const sub = makeSub();
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [
      makeMonth('m-apr', 2026, 4),
      makeMonth('m-may', 2026, 5),
      makeMonth('m-jun', 2026, 6),
    ];
    setupBundleBackfill(prisma, skipMock, { months, purchaseGroupIds: ['pg-bundle-1'] });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-apr', 'm-may', 'm-jun'],
    } as any);

    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledTimes(1);
  });

  it('the single purchase group receives books from all 3 bundle months', async () => {
    const sub = makeSub();
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [
      makeMonth('m-apr', 2026, 4),
      makeMonth('m-may', 2026, 5),
      makeMonth('m-jun', 2026, 6),
    ];
    setupBundleBackfill(prisma, skipMock, { months, purchaseGroupIds: ['pg-bundle-1'] });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-apr', 'm-may', 'm-jun'],
    } as any);

    // 3 books created, all tagged with the same (only) purchase group id
    expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(3);
    const editionIds = (prisma.userBookEntry.create as jest.Mock).mock.calls.map((c) => c[0].data.editionId);
    expect(editionIds.sort()).toEqual(['ed-m-apr', 'ed-m-jun', 'ed-m-may']);
    for (const call of (prisma.userBookEntry.create as jest.Mock).mock.calls) {
      expect(call[0].data.purchaseGroupId).toBe('pg-bundle-1');
    }
  });

  it('does not split totalAmount or shipping across the bundle months (one payment, one shipment)', async () => {
    const sub = makeSub();
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [makeMonth('m-apr', 2026, 4), makeMonth('m-may', 2026, 5), makeMonth('m-jun', 2026, 6)];
    setupBundleBackfill(prisma, skipMock, {
      entry: makeEntry({ basePrice: { toString: () => '45.00' }, shippingCost: { toString: () => '12.00' } }),
      months,
      purchaseGroupIds: ['pg-bundle-1'],
    });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-apr', 'm-may', 'm-jun'],
    } as any);

    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalAmount: 45, shippingAmount: 12 }),
      }),
    );
  });

  it('uses entry.startDate as purchasedAt for the first bundle when paymentOnStartup=true', async () => {
    const sub = makeSub({ paymentOnStartup: true });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [makeMonth('m-apr', 2026, 4), makeMonth('m-may', 2026, 5), makeMonth('m-jun', 2026, 6)];
    setupBundleBackfill(prisma, skipMock, {
      entry: makeEntry({ startDate: '2026-04-05' }),
      months,
      purchaseGroupIds: ['pg-bundle-1'],
    });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-apr', 'm-may', 'm-jun'],
    } as any);

    const call = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
    const purchasedAt = call.data.purchasedAt as Date;
    expect(purchasedAt.toISOString().slice(0, 10)).toBe('2026-04-05');
  });

  it('creates two separate purchase groups for two separate bundle periods', async () => {
    const sub = makeSub();
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    // Q2 (Apr/May/Jun) and Q3 (Jul/Aug/Sep) — two distinct quarterly bundles
    const months = [
      makeMonth('m-apr', 2026, 4), makeMonth('m-may', 2026, 5), makeMonth('m-jun', 2026, 6),
      makeMonth('m-jul', 2026, 7), makeMonth('m-aug', 2026, 8), makeMonth('m-sep', 2026, 9),
    ];
    setupBundleBackfill(prisma, skipMock, { months, purchaseGroupIds: ['pg-q2', 'pg-q3'] });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: months.map((m) => m.id),
    } as any);

    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledTimes(2);
    const titles = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls.map((c) => c[0].data.title);
    expect(titles).toEqual(expect.arrayContaining([
      expect.stringContaining('2026/04'),
      expect.stringContaining('2026/07'),
    ]));
    // Each book still lands in exactly one of the two groups
    expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(6);
  });

  it('a book price override tagged to a non-primary month in the bundle still updates the group total', async () => {
    const sub = makeSub();
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [makeMonth('m-apr', 2026, 4), makeMonth('m-may', 2026, 5), makeMonth('m-jun', 2026, 6)];
    setupBundleBackfill(prisma, skipMock, { months, purchaseGroupIds: ['pg-bundle-1'] });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-apr', 'm-may', 'm-jun'],
      // Override targets the June book specifically, not the bundle's primary (April) month.
      bookPrices: [{ monthId: 'm-jun', editionId: 'ed-m-jun', price: 99.5 }],
    } as any);

    expect(prisma.userPurchaseGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pg-bundle-1' },
        data: { totalAmount: 99.5 },
      }),
    );
  });
});
