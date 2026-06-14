import { StatsService, type StatsSettings } from './stats.service';

type SnapshotRecord = {
  year: number;
  currency: string;
  computedAt: Date;
  isStale: boolean;
  moduleVersions: unknown;
  spending: Record<string, unknown>;
  collection: Record<string, unknown>;
  features: Record<string, unknown>;
};

const DEFAULT_SETTINGS: StatsSettings = {
  spending: true,
  sales: true,
  reading: true,
  features: true,
};

function makeSnapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    year: 0,
    currency: 'EUR',
    computedAt: new Date('2024-01-01T00:00:00.000Z'),
    isStale: false,
    moduleVersions: {
      spending: { version: 4, computedAt: '2024-01-01T00:00:00.000Z' },
      collection: { version: 6, computedAt: '2024-01-01T00:00:00.000Z' },
      features: { version: 1, computedAt: '2024-01-01T00:00:00.000Z' },
    },
    spending: {},
    collection: {},
    features: {},
    ...overrides,
  };
}

function makeSpendingSnapshotData() {
  return {
    totalAllTime: 100,
    totalThisYear: 80,
    totalThisMonth: 10,
    avgCostPerBook: 25,
    booksWithCost: 4,
    booksThisYear: 3,
    booksThisMonth: 1,
    totalBasePrice: 90,
    totalShipping: 10,
    totalTax: 2,
    totalOtherFees: 1,
    totalDiscounts: 0,
    totalRefunds: 0,
    byYear: [{ year: 2024, amount: 100 }],
    byYearBooks: [{ year: 2024, count: 4 }],
    byMonth: [
      { month: '2023-12', amount: 5 },
      { month: '2024-01', amount: 20 },
    ],
    byMonthBooks: [
      { month: '2023-12', count: 1 },
      { month: '2024-01', count: 2 },
    ],
    bySubscription: [],
    byCompany: [],
    topExpensive: [],
    topSalePrice: [{ title: 'Sold book', amount: 15 }],
    topProfit: [{ title: 'Profit book', amount: 4 }],
    topLoss: [{ title: 'Loss book', amount: -2 }],
    totalSalesRevenue: 33,
    totalSalesProfit: null,
    totalBooksSold: 2,
    salesByPlatform: [{ platform: 'vinted', amount: 33, count: 2 }],
    salesByCompany: [{ name: 'FairyLoot', slug: 'fairyloot', amount: 33, count: 2, primaryColor: null }],
    salesByMonth: [
      { month: '2023-12', amount: 3 },
      { month: '2024-01', amount: 30 },
    ],
    salesByMonthCount: [
      { month: '2023-12', count: 1 },
      { month: '2024-01', count: 1 },
    ],
    salesByYear: [{ year: 2024, amount: 33 }],
    salesByYearCount: [{ year: 2024, count: 2 }],
    plByMonth: [
      { month: '2023-12', pl: 1 },
      { month: '2024-01', pl: 7 },
    ],
    plByCompany: [{ name: 'FairyLoot', slug: 'fairyloot', pl: 7, revenue: 33, cost: 26, count: 2, primaryColor: null }],
    salesWithROI: [{ title: 'ROI book', roi: 20, holdDays: 30, pl: 4 }],
  };
}

describe('StatsService', () => {
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    userStatsSnapshot: { findUnique: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock; upsert: jest.Mock };
    userPurchaseGroup: { findMany: jest.Mock };
    userSaleGroup: { findMany: jest.Mock };
    userBookEntry: { findMany: jest.Mock };
  };
  let currencyService: { warmCacheBatch: jest.Mock; convertSyncFromCache: jest.Mock; convert: jest.Mock };
  let spendingComputer: { key: string; version: number; compute: jest.Mock };
  let collectionComputer: { key: string; version: number; compute: jest.Mock };
  let featuresComputer: { key: string; version: number; compute: jest.Mock };
  let service: StatsService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      userStatsSnapshot: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockImplementation(async ({ create, update }) => ({
          ...create,
          ...update,
        })),
      },
      userPurchaseGroup: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userSaleGroup: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userBookEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    currencyService = {
      warmCacheBatch: jest.fn().mockResolvedValue(undefined),
      convertSyncFromCache: jest.fn().mockReturnValue(null),
      convert: jest.fn().mockImplementation(async (amount: number) => amount),
    };

    spendingComputer = {
      key: 'spending',
      version: 4,
      compute: jest.fn().mockResolvedValue({}),
    };
    collectionComputer = {
      key: 'collection',
      version: 6,
      compute: jest.fn().mockResolvedValue({}),
    };
    featuresComputer = {
      key: 'features',
      version: 1,
      compute: jest.fn().mockResolvedValue({}),
    };

    service = new StatsService(
      prisma as never,
      currencyService as never,
      spendingComputer as never,
      collectionComputer as never,
      featuresComputer as never,
    );
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function mockSettings(settings: Partial<StatsSettings> | null) {
    prisma.user.findUnique.mockImplementation(async () => ({ statsSettings: settings }));
  }

  describe('getSettings / updateSettings', () => {
    it('getSettings returns all-true defaults when statsSettings is null', async () => {
      mockSettings(null);

      await expect(service.getSettings('user-1')).resolves.toEqual(DEFAULT_SETTINGS);
    });

    it('getSettings returns persisted settings from the database', async () => {
      const persisted = { spending: false, sales: true, reading: false, features: false };
      mockSettings(persisted);

      await expect(service.getSettings('user-1')).resolves.toEqual(persisted);
    });

    it('updateSettings merges partial patches and keeps other settings intact', async () => {
      mockSettings({ spending: false, sales: true, reading: false, features: true });

      const result = await service.updateSettings('user-1', { reading: true, features: false });

      expect(result).toEqual({
        spending: false,
        sales: true,
        reading: true,
        features: false,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          statsSettings: {
            spending: false,
            sales: true,
            reading: true,
            features: false,
          },
        },
      });
    });

    it('updateSettings calls markStatsStale when spending was off and is turned on', async () => {
      mockSettings({ spending: false, sales: false, reading: true, features: true });
      const staleSpy = jest.spyOn(service, 'markStatsStale').mockImplementation(() => undefined);

      await service.updateSettings('user-1', { spending: true });

      expect(staleSpy).toHaveBeenCalledWith('user-1');
    });

    it('updateSettings calls markStatsStale when features was off and is turned on', async () => {
      mockSettings({ spending: true, sales: true, reading: true, features: false });
      const staleSpy = jest.spyOn(service, 'markStatsStale').mockImplementation(() => undefined);

      await service.updateSettings('user-1', { features: true });

      expect(staleSpy).toHaveBeenCalledWith('user-1');
    });

    it('updateSettings does not call markStatsStale when turning modules off', async () => {
      mockSettings({ spending: true, sales: true, reading: true, features: true });
      const staleSpy = jest.spyOn(service, 'markStatsStale').mockImplementation(() => undefined);

      await service.updateSettings('user-1', { spending: false, sales: false, features: false });

      expect(staleSpy).not.toHaveBeenCalled();
    });

    it('updateSettings does not call markStatsStale when only sales changes while spending remains enabled', async () => {
      mockSettings({ spending: true, sales: false, reading: true, features: true });
      const staleSpy = jest.spyOn(service, 'markStatsStale').mockImplementation(() => undefined);

      await service.updateSettings('user-1', { sales: true });

      expect(staleSpy).not.toHaveBeenCalled();
    });
  });

  describe('getEnabledModules via recomputeSnapshot', () => {
    function setupRecompute(settings: Partial<StatsSettings>) {
      mockSettings(settings);
      prisma.userPurchaseGroup.findMany.mockResolvedValue([{ purchasedAt: new Date('2024-01-01T00:00:00.000Z') }]);
      prisma.userSaleGroup.findMany.mockResolvedValue([]);
      prisma.userBookEntry.findMany.mockResolvedValue([]);

      const finalSnapshot = makeSnapshot();
      let findUniqueCalls = 0;
      prisma.userStatsSnapshot.findUnique.mockImplementation(async () => {
        findUniqueCalls++;
        return findUniqueCalls < 3 ? null : finalSnapshot;
      });
      prisma.userStatsSnapshot.findMany.mockResolvedValue([
        makeSnapshot({
          year: 2024,
          spending: makeSpendingSnapshotData(),
        }),
      ]);
    }

    it('computes spending, collection, and features when all toggles are enabled', async () => {
      setupRecompute({ spending: true, sales: true, reading: true, features: true });

      await service.recomputeSnapshot('user-1', 'eur');

      expect(spendingComputer.compute).toHaveBeenCalled();
      expect(collectionComputer.compute).toHaveBeenCalled();
      expect(featuresComputer.compute).toHaveBeenCalled();
    });

    it('does not call the spending computer when both spending and sales are disabled', async () => {
      setupRecompute({ spending: false, sales: false, reading: true, features: true });

      await service.recomputeSnapshot('user-1', 'eur');

      expect(spendingComputer.compute).not.toHaveBeenCalled();
      expect(collectionComputer.compute).toHaveBeenCalled();
    });

    it('does not call the features computer when features are disabled', async () => {
      setupRecompute({ spending: true, sales: true, reading: true, features: false });

      await service.recomputeSnapshot('user-1', 'eur');

      expect(featuresComputer.compute).not.toHaveBeenCalled();
      expect(collectionComputer.compute).toHaveBeenCalled();
      expect(spendingComputer.compute).toHaveBeenCalled();
    });

    it('always computes collection even when other modules are disabled', async () => {
      setupRecompute({ spending: false, sales: false, reading: true, features: false });

      await service.recomputeSnapshot('user-1', 'eur');

      expect(collectionComputer.compute).toHaveBeenCalled();
      expect(spendingComputer.compute).not.toHaveBeenCalled();
      expect(featuresComputer.compute).not.toHaveBeenCalled();
    });

    it('still computes spending when spending is enabled but sales is disabled', async () => {
      setupRecompute({ spending: true, sales: false, reading: true, features: true });

      await service.recomputeSnapshot('user-1', 'eur');

      expect(spendingComputer.compute).toHaveBeenCalled();
    });
  });

  describe('hasCurrentVersions', () => {
    it('returns true when all enabled module versions match', () => {
      const result = (service as unknown as {
        hasCurrentVersions: (snapshot: Pick<SnapshotRecord, 'moduleVersions'>, enabledModules: Set<string>) => boolean;
      }).hasCurrentVersions(makeSnapshot(), new Set(['spending', 'collection', 'features']));

      expect(result).toBe(true);
    });

    it('returns false when an enabled module version is outdated', () => {
      const result = (service as unknown as {
        hasCurrentVersions: (snapshot: Pick<SnapshotRecord, 'moduleVersions'>, enabledModules: Set<string>) => boolean;
      }).hasCurrentVersions(
        makeSnapshot({
          moduleVersions: {
            spending: { version: 4, computedAt: '2024-01-01T00:00:00.000Z' },
            collection: { version: 5, computedAt: '2024-01-01T00:00:00.000Z' },
            features: { version: 1, computedAt: '2024-01-01T00:00:00.000Z' },
          },
        }),
        new Set(['collection']),
      );

      expect(result).toBe(false);
    });

    it('ignores outdated versions for disabled modules', () => {
      const result = (service as unknown as {
        hasCurrentVersions: (snapshot: Pick<SnapshotRecord, 'moduleVersions'>, enabledModules: Set<string>) => boolean;
      }).hasCurrentVersions(
        makeSnapshot({
          moduleVersions: {
            collection: { version: 6, computedAt: '2024-01-01T00:00:00.000Z' },
            features: { version: 0, computedAt: '2024-01-01T00:00:00.000Z' },
          },
        }),
        new Set(['collection']),
      );

      expect(result).toBe(true);
    });

    it('handles legacy numeric moduleVersions format', () => {
      const result = (service as unknown as {
        hasCurrentVersions: (snapshot: Pick<SnapshotRecord, 'moduleVersions'>, enabledModules: Set<string>) => boolean;
      }).hasCurrentVersions(
        makeSnapshot({
          moduleVersions: {
            collection: 6,
          },
        }),
        new Set(['collection']),
      );

      expect(result).toBe(true);
    });
  });

  describe('getStats response building', () => {
    beforeEach(() => {
      mockSettings(DEFAULT_SETTINGS);
    });

    function mockSnapshotReads(allTime: SnapshotRecord, yearSnap?: SnapshotRecord | null) {
      prisma.userStatsSnapshot.findUnique
        .mockResolvedValueOnce(allTime)
        .mockResolvedValueOnce(yearSnap ?? null);
    }

    it('returns only the collection key when module=collection', async () => {
      mockSnapshotReads(makeSnapshot({ collection: { totalBooks: 12 } }));

      const result = await service.getStats('user-1', 'eur', undefined, 'collection');

      expect(result.data).toEqual({ collection: { totalBooks: 12 } });
    });

    it('returns only spending fields when module=spending', async () => {
      mockSnapshotReads(makeSnapshot({ spending: makeSpendingSnapshotData() }));

      const result = await service.getStats('user-1', 'eur', undefined, 'spending');

      expect(result.data).toMatchObject({
        totalAllTime: 100,
        salesByMonth: [
          { month: '2023-12', amount: 3 },
          { month: '2024-01', amount: 30 },
        ],
      });
      expect(result.data).not.toHaveProperty('collection');
      expect(result.data).not.toHaveProperty('features');
    });

    it('returns only the features key when module=features', async () => {
      mockSnapshotReads(makeSnapshot({ features: { booksWithAnyFeature: 8 } }));

      const result = await service.getStats('user-1', 'eur', undefined, 'features');

      expect(result.data).toEqual({ features: { booksWithAnyFeature: 8 } });
    });

    it('returns only sales-related fields when module=sales', async () => {
      mockSnapshotReads(makeSnapshot({ spending: makeSpendingSnapshotData() }));

      const result = await service.getStats('user-1', 'eur', undefined, 'sales');

      expect(result.data).toEqual({
        totalSalesRevenue: 33,
        totalSalesProfit: null,
        totalBooksSold: 2,
        byYear: [{ year: 2024, amount: 100 }],
        salesByYear: [{ year: 2024, amount: 33 }],
        salesByMonth: [
          { month: '2023-12', amount: 3 },
          { month: '2024-01', amount: 30 },
        ],
        salesByMonthCount: [
          { month: '2023-12', count: 1 },
          { month: '2024-01', count: 1 },
        ],
        salesByYearCount: [{ year: 2024, count: 2 }],
        salesByPlatform: [{ platform: 'vinted', amount: 33, count: 2 }],
        salesByCompany: [{ name: 'FairyLoot', slug: 'fairyloot', amount: 33, count: 2, primaryColor: null }],
        topSalePrice: [{ title: 'Sold book', amount: 15 }],
        topProfit: [{ title: 'Profit book', amount: 4 }],
        topLoss: [{ title: 'Loss book', amount: -2 }],
        plByMonth: [
          { month: '2023-12', pl: 1 },
          { month: '2024-01', pl: 7 },
        ],
        plByCompany: [{ name: 'FairyLoot', slug: 'fairyloot', pl: 7, revenue: 33, cost: 26, count: 2, primaryColor: null }],
        salesWithROI: [{ title: 'ROI book', roi: 20, holdDays: 30, pl: 4 }],
      });
    });

    it('uses year collection data when a year is requested and year snapshot collection is non-empty', async () => {
      mockSnapshotReads(
        makeSnapshot({ collection: { totalBooks: 99 } }),
        makeSnapshot({ year: 2024, collection: { totalBooks: 5 } }),
      );

      const result = await service.getStats('user-1', 'eur', 2024, 'collection');

      expect(result.data).toEqual({ collection: { totalBooks: 5 } });
    });

    it('falls back to all-time collection when year snapshot collection is empty', async () => {
      mockSnapshotReads(
        makeSnapshot({ collection: { totalBooks: 99 } }),
        makeSnapshot({ year: 2024, collection: {} }),
      );

      const result = await service.getStats('user-1', 'eur', 2024, 'collection');

      expect(result.data).toEqual({ collection: { totalBooks: 99 } });
    });
  });

  describe('markStatsStale', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    async function flushDebounce() {
      jest.runAllTimers();
      await Promise.resolve();
    }

    it('marks only the changed year and all-time snapshot as stale', async () => {
      service.markStatsStale('user-1', [2024]);
      await flushDebounce();

      expect(prisma.userStatsSnapshot.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', year: { in: expect.arrayContaining([2024, 0]) } },
        data: { isStale: true },
      });
    });

    it('marks all user snapshots as stale when no years are provided', async () => {
      service.markStatsStale('user-1');
      await flushDebounce();

      expect(prisma.userStatsSnapshot.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { isStale: true },
      });
    });

    it('accumulates years across rapid calls into one DB write', async () => {
      service.markStatsStale('user-1', [2024]);
      service.markStatsStale('user-1', [2023]);
      await flushDebounce();

      expect(prisma.userStatsSnapshot.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.userStatsSnapshot.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', year: { in: expect.arrayContaining([2024, 2023, 0]) } },
        data: { isStale: true },
      });
    });

    it('escalates to invalidating all snapshots when a later call omits years', async () => {
      service.markStatsStale('user-1', [2024]);
      service.markStatsStale('user-1', [2023]);
      service.markStatsStale('user-1');
      await flushDebounce();

      expect(prisma.userStatsSnapshot.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.userStatsSnapshot.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { isStale: true },
      });
    });
  });
});
