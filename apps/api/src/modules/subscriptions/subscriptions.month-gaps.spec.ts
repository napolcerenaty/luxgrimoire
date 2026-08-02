/**
 * Unit tests for SubscriptionsService.getMonthGaps() and getBooksByMonth() /
 * buildCatalogMonthBooks(), focused on company-wide month skips
 * (SubscriptionMonthSkip) — neither scan had direct unit coverage before this.
 *
 * Both scans restrict their candidate query to parentSubscriptionId: null
 * (content-stream/parent subscriptions only), which is exactly the id level
 * SubscriptionMonthSkip rows are written at, so a skipped subscription must be
 * excluded entirely — not flagged missing_month, not shown as a placeholder.
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

// Fixed "now" well after YEAR/MONTH so getBooksByMonth's "no more than 1 month
// into the future" guard never interferes — these tests aren't about that guard.
const NOW = new Date('2026-07-15T12:00:00Z');
const YEAR = 2026;
const MONTH = 5;

function makeCandidateSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-a',
    slug: 'sub-a',
    name: 'Sub A',
    startDate: null,
    endDate: null,
    isDiscontinued: false,
    isHidden: false,
    isUpcoming: false,
    isContentStream: false,
    intervalMonths: 1,
    startingMonth: null,
    isBundleSubscription: false,
    company: { name: 'Company A', slug: 'company-a', brandColors: [] },
    ...overrides,
  };
}

function makeService(prisma: DeepMockProxy<PrismaService>) {
  return new SubscriptionsService(
    prisma,
    {} as any, // typesense
    {} as any, // skipPolicyEngine
    {} as any, // renewalCron
    {} as any, // countryFeeSnapshotService
    {} as any, // uploadService
    {} as any, // crowdStatsService
    {} as any, // statsService
    { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() } as any, // cache
  );
}

describe('SubscriptionsService — getMonthGaps company-skip exclusion', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
  });

  afterEach(() => jest.useRealTimers());

  it('excludes a company-skipped subscription entirely — not flagged missing_month, not counted', async () => {
    const skippedSub = makeCandidateSub({ id: 'sub-skipped', slug: 'sub-skipped', name: 'Skipped Sub' });
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([skippedSub]);
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([{ subscriptionId: 'sub-skipped' }]);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getMonthGaps(YEAR, MONTH) as any;

    expect(result.gaps).toHaveLength(0);
    expect(result.totalEligible).toBe(0);
    // The skip filter must have run before the missing-month scan even queried SubscriptionMonth
    // for the skipped subscription's id — the scan should have nothing left to check.
    expect(prisma.subscriptionMonth.findMany).not.toHaveBeenCalled();
  });

  it('regression: an unskipped subscription with no month row is still flagged missing_month', async () => {
    const sub = makeCandidateSub();
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([sub]);
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getMonthGaps(YEAR, MONTH) as any;

    expect(result.totalEligible).toBe(1);
    expect(result.gaps).toEqual([
      expect.objectContaining({ subscriptionId: 'sub-a', status: 'missing_month' }),
    ]);
  });

  it('a company-skipped subscription and a normal one due the same month: only the normal one is scanned', async () => {
    const normalSub = makeCandidateSub({ id: 'sub-a' });
    const skippedSub = makeCandidateSub({ id: 'sub-skipped', slug: 'sub-skipped', name: 'Skipped Sub' });
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([normalSub, skippedSub]);
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([{ subscriptionId: 'sub-skipped' }]);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([
      { subscriptionId: 'sub-a', _count: { books: 2 }, books: [{ edition: { featureTags: [{ id: 'tag-1' }] } }] },
    ]);

    const result = await service.getMonthGaps(YEAR, MONTH) as any;

    expect(result.totalEligible).toBe(1);
    expect(result.gaps).toHaveLength(0); // sub-a has books, sub-skipped was never even queried
    expect(prisma.subscriptionMonth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subscriptionId: { in: ['sub-a'] } }) }),
    );
  });
});

describe('SubscriptionsService — getBooksByMonth/buildCatalogMonthBooks company-skip exclusion', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
  });

  afterEach(() => jest.useRealTimers());

  it('a company-skipped subscription produces no item — not even a placeholder', async () => {
    const skippedSub = makeCandidateSub({ id: 'sub-skipped', slug: 'sub-skipped', name: 'Skipped Sub' });
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([skippedSub]);
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([{ subscriptionId: 'sub-skipped' }]);

    const result = await service.getBooksByMonth(null, YEAR, MONTH) as any;

    expect(result.items).toHaveLength(0);
    expect(prisma.subscriptionMonth.findMany).not.toHaveBeenCalled();
  });

  it('regression: an unskipped subscription with no month row still shows a placeholder item', async () => {
    const sub = makeCandidateSub();
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([sub]);
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getBooksByMonth(null, YEAR, MONTH) as any;

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({ subscriptionId: 'sub-a', isPlaceholder: true }));
  });
});
