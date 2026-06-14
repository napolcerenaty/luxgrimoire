import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { CollectionStatsComputer } from './computers/collection-stats.computer';
import { FeaturesStatsComputer } from './computers/features-stats.computer';
import { SpendingStatsComputer } from './computers/spending-stats.computer';
import { StatsComputer } from './stats.computer';
import type { CollectionAndFeaturesEntryData, LightStatsContext, StatsContext } from './stats.context';
import {
  collectionAndFeaturesEntryInclude,
  statsEntryInclude,
  statsSaleGroupInclude,
} from './stats.context';

type SnapshotData = Record<string, unknown>;

interface ModuleMetadata {
  version: number;
  computedAt: string;
}

type ModuleVersionsRecord = Record<string, ModuleMetadata>;

export interface StatsSettings {
  spending: boolean;
  sales: boolean;
  reading: boolean;
  features: boolean;
}

const DEFAULT_STATS_SETTINGS: StatsSettings = {
  spending: true,
  sales: true,
  reading: true,
  features: true,
};

function resolveSettings(raw: unknown): StatsSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_STATS_SETTINGS;
  const s = raw as Record<string, unknown>;
  return {
    spending: s.spending !== false,
    sales: s.sales !== false,
    reading: s.reading !== false,
    features: s.features !== false,
  };
}

interface UserStatsSnapshotRecord {
  year: number;
  currency: string;
  computedAt: Date;
  isStale: boolean;
  moduleVersions: unknown;
  spending: unknown;
  collection: unknown;
  features: unknown;
}

interface UserStatsSnapshotDelegate {
  findUnique(args: {
    where: { userId_currency_year: { userId: string; currency: string; year: number } };
  }): Promise<UserStatsSnapshotRecord | null>;
  findMany(args: {
    where: { userId: string; currency: string; year?: { gt: number } };
  }): Promise<UserStatsSnapshotRecord[]>;
  updateMany(args: { where: { userId: string; year?: { in: number[] } }; data: { isStale: boolean } }): Promise<unknown>;
  upsert(args: {
    where: { userId_currency_year: { userId: string; currency: string; year: number } };
    create: {
      userId: string;
      currency: string;
      year: number;
      isStale: boolean;
      moduleVersions: ModuleVersionsRecord;
      spending: SnapshotData;
      collection: SnapshotData;
      features: SnapshotData;
    };
    update: {
      isStale: boolean;
      computedAt: Date;
      moduleVersions: ModuleVersionsRecord;
      spending: SnapshotData;
      collection: SnapshotData;
      features: SnapshotData;
    };
  }): Promise<UserStatsSnapshotRecord>;
}

/** Simple semaphore to cap concurrent recompute operations. */
class Semaphore {
  private running = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.running--;
    }
  }
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);
  private readonly computers: StatsComputer[];

  /** Prevents duplicate concurrent recomputes for the same user+currency+year key. */
  private readonly inFlight = new Map<string, Promise<UserStatsSnapshotRecord>>();

  /** Debounce handles: batches rapid markStatsStale calls into a single DB write per user. */
  private readonly staleDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Accumulates changed years during debounce window; undefined means "invalidate all". */
  private readonly staleAccumulatedYears = new Map<string, Set<number> | 'all'>();

  /** Caps concurrent DB-heavy recomputes to protect the connection pool. */
  private readonly recomputeSemaphore = new Semaphore(10);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
    private readonly spendingComputer: SpendingStatsComputer,
    private readonly collectionComputer: CollectionStatsComputer,
    private readonly featuresComputer: FeaturesStatsComputer,
  ) {
    this.computers = [spendingComputer, collectionComputer, featuresComputer];
  }

  private get snapshots(): UserStatsSnapshotDelegate {
    return (this.prisma as PrismaService & { userStatsSnapshot: UserStatsSnapshotDelegate }).userStatsSnapshot;
  }

  private asRecord(value: unknown): SnapshotData {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as SnapshotData) : {};
  }

  private asModuleVersions(value: unknown): ModuleVersionsRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const raw = value as Record<string, unknown>;
    const result: ModuleVersionsRecord = {};
    for (const [key, val] of Object.entries(raw)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const v = val as Record<string, unknown>;
        if (typeof v.version === 'number') {
          result[key] = {
            version: v.version,
            computedAt: typeof v.computedAt === 'string' ? v.computedAt : new Date(0).toISOString(),
          };
        }
      } else if (typeof val === 'number') {
        result[key] = { version: val, computedAt: new Date(0).toISOString() };
      }
    }
    return result;
  }

  private async getEnabledModules(userId: string): Promise<Set<string>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { statsSettings: true } });
    const settings = resolveSettings(user?.statsSettings);
    const enabled = new Set<string>(['collection']);
    if (settings.spending || settings.sales) enabled.add('spending');
    if (settings.features) enabled.add('features');
    return enabled;
  }

  async getSettings(userId: string): Promise<StatsSettings> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { statsSettings: true } });
    return resolveSettings(user?.statsSettings);
  }

  async updateSettings(
    userId: string,
    dto: { spending?: boolean; sales?: boolean; reading?: boolean; features?: boolean },
  ): Promise<StatsSettings> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { statsSettings: true } });
    const current = resolveSettings(user?.statsSettings);
    const newSettings: StatsSettings = {
      spending: dto.spending ?? current.spending,
      sales: dto.sales ?? current.sales,
      reading: dto.reading ?? current.reading,
      features: dto.features ?? current.features,
    };
    const spendingReenabled = !(current.spending || current.sales) && (newSettings.spending || newSettings.sales);
    const featuresReenabled = !current.features && newSettings.features;
    await (this.prisma as PrismaService & {
      user: {
        update(args: { where: { id: string }; data: { statsSettings: StatsSettings } }): Promise<unknown>;
      };
    }).user.update({
      where: { id: userId },
      data: { statsSettings: newSettings },
    });
    if (spendingReenabled || featuresReenabled) {
      this.markStatsStale(userId);
    }
    return newSettings;
  }

  private hasCurrentVersions(
    snapshot: Pick<UserStatsSnapshotRecord, 'moduleVersions'>,
    enabledModules: Set<string>,
  ): boolean {
    const versions = this.asModuleVersions(snapshot.moduleVersions);
    return this.computers
      .filter((computer) => enabledModules.has(computer.key))
      .every((computer) => versions[computer.key]?.version === computer.version);
  }

  private getModuleComputedAt(
    snapshot: Pick<UserStatsSnapshotRecord, 'computedAt' | 'moduleVersions'>,
    module?: string,
  ): Date {
    const computeKey =
      module === 'sales' || module === 'pl'
        ? 'spending'
        : module === 'reading'
          ? 'collection'
          : (module ?? 'collection');
    const versions = this.asModuleVersions(snapshot.moduleVersions);
    return versions[computeKey]?.computedAt ? new Date(versions[computeKey].computedAt) : snapshot.computedAt;
  }

  /**
   * Mark stats stale for a user. If changedYears are provided, only those year snapshots
   * and the all-time (year=0) snapshot are marked stale. Otherwise all snapshots are marked stale.
   * Uses a 2-second debounce to coalesce rapid calls (e.g. bulk import, cron adding N books).
   */
  markStatsStale(userId: string, changedYears?: number[]): void {
    const existing = this.staleDebounceTimers.get(userId);
    if (existing) clearTimeout(existing);

    const current = this.staleAccumulatedYears.get(userId);
    if (changedYears && current !== 'all') {
      const set = current ?? new Set<number>();
      for (const y of changedYears) set.add(y);
      set.add(0); // always include all-time
      this.staleAccumulatedYears.set(userId, set);
    } else {
      // No years specified = invalidate everything
      this.staleAccumulatedYears.set(userId, 'all');
    }

    const timer = setTimeout(() => {
      this.staleDebounceTimers.delete(userId);
      const accumulated = this.staleAccumulatedYears.get(userId);
      this.staleAccumulatedYears.delete(userId);

      if (accumulated instanceof Set) {
        const yearList = Array.from(accumulated);
        this.snapshots
          .updateMany({ where: { userId, year: { in: yearList } }, data: { isStale: true } })
          .catch((err: unknown) => this.logger.warn(`Failed to mark stats stale for ${userId}: ${String(err)}`));
      } else {
        this.snapshots
          .updateMany({ where: { userId }, data: { isStale: true } })
          .catch((err: unknown) => this.logger.warn(`Failed to mark stats stale for ${userId}: ${String(err)}`));
      }
    }, 2000);
    this.staleDebounceTimers.set(userId, timer);
  }

  async getStats(
    userId: string,
    currency: string,
    year?: number,
    module?: string,
  ): Promise<{
    data: Record<string, unknown>;
    currency: string;
    computedAt: Date;
    isStale: boolean;
  }> {
    const normalizedCurrency = currency.toUpperCase();
    const requestedYear = year && year > 0 ? year : undefined;

    // Fetch all-time snapshot and (optionally) year-specific snapshot in parallel
    const [allTimeSnap, yearSnap] = await Promise.all([
      this.snapshots.findUnique({ where: { userId_currency_year: { userId, currency: normalizedCurrency, year: 0 } } }),
      requestedYear
        ? this.snapshots.findUnique({
            where: { userId_currency_year: { userId, currency: normalizedCurrency, year: requestedYear } },
          })
        : Promise.resolve(null),
    ]);
    const enabledModules = await this.getEnabledModules(userId);
    const yearEnabledModules = enabledModules.has('spending') ? new Set<string>(['spending']) : new Set<string>();

    // Cold start: no all-time snapshot at all
    if (!allTimeSnap) {
      await this.coldStartRecompute(userId, normalizedCurrency);
      const [freshAllTime, freshYear] = await Promise.all([
        this.snapshots.findUnique({ where: { userId_currency_year: { userId, currency: normalizedCurrency, year: 0 } } }),
        requestedYear
          ? this.snapshots.findUnique({
              where: { userId_currency_year: { userId, currency: normalizedCurrency, year: requestedYear } },
            })
          : Promise.resolve(null),
      ]);
      return {
        data: this.buildResponseFromSnapshots(freshAllTime!, freshYear, requestedYear, module),
        currency: normalizedCurrency,
        computedAt: this.getModuleComputedAt(freshAllTime!, module),
        isStale: false,
      };
    }

    // Year snapshot needed but doesn't exist yet: compute it synchronously (first time for this year)
    let resolvedYearSnap = yearSnap;
    if (requestedYear && !yearSnap) {
      resolvedYearSnap = await this.triggerRecompute(userId, normalizedCurrency, requestedYear);
    }

    // Trigger background recomputes for stale snapshots
    if (allTimeSnap.isStale || !this.hasCurrentVersions(allTimeSnap, enabledModules)) {
      setImmediate(() => {
        this.triggerRecompute(userId, normalizedCurrency, 0).catch((err: unknown) =>
          this.logger.error(`Background all-time recompute failed for ${userId}: ${String(err)}`),
        );
      });
    }
    if (
      resolvedYearSnap &&
      requestedYear &&
      (resolvedYearSnap.isStale || !this.hasCurrentVersions(resolvedYearSnap, yearEnabledModules))
    ) {
      setImmediate(() => {
        this.triggerRecompute(userId, normalizedCurrency, requestedYear).catch((err: unknown) =>
          this.logger.error(`Background year recompute failed for ${userId}/${requestedYear}: ${String(err)}`),
        );
      });
    }

    return {
      data: this.buildResponseFromSnapshots(allTimeSnap, resolvedYearSnap, requestedYear, module),
      currency: normalizedCurrency,
      computedAt: this.getModuleComputedAt(allTimeSnap, module),
      isStale: allTimeSnap.isStale || !!resolvedYearSnap?.isStale,
    };
  }

  private buildResponseFromSnapshots(
    allTimeSnap: UserStatsSnapshotRecord,
    yearSnap: UserStatsSnapshotRecord | null | undefined,
    year?: number,
    module?: string,
  ): Record<string, unknown> {
    const spending = this.asRecord(allTimeSnap.spending);
    const collection = this.asRecord(allTimeSnap.collection);
    const features = this.asRecord(allTimeSnap.features);

    if (module === 'collection') {
      return { collection };
    }

    if (module === 'features') {
      return { features };
    }

    // Year-specific monthly breakdown: use yearSnap if available, else filter all-time
    const yearlySpending = yearSnap ? this.asRecord(yearSnap.spending) : null;

    const byMonth = yearlySpending
      ? ((yearlySpending.byMonth as unknown[]) ?? [])
      : this.filterByYear(spending.byMonth as Array<{ month: string }> | undefined, year);
    const byMonthBooks = yearlySpending
      ? ((yearlySpending.byMonthBooks as unknown[]) ?? [])
      : this.filterByYear(spending.byMonthBooks as Array<{ month: string }> | undefined, year);
    const salesByMonth = yearlySpending
      ? ((yearlySpending.salesByMonth as unknown[]) ?? [])
      : this.filterByYear(spending.salesByMonth as Array<{ month: string }> | undefined, year);
    const salesByMonthCount = yearlySpending
      ? ((yearlySpending.salesByMonthCount as unknown[]) ?? [])
      : this.filterByYear(spending.salesByMonthCount as Array<{ month: string }> | undefined, year);
    const plByMonth = yearlySpending
      ? ((yearlySpending.plByMonth as unknown[]) ?? [])
      : this.filterByYear(spending.plByMonth as Array<{ month: string }> | undefined, year);

    if (module === 'sales') {
      return {
        totalSalesRevenue: spending.totalSalesRevenue ?? 0,
        totalSalesProfit: spending.totalSalesProfit ?? null,
        totalBooksSold: spending.totalBooksSold ?? 0,
        byYear: spending.byYear ?? [],
        salesByYear: spending.salesByYear ?? [],
        salesByMonth,
        salesByMonthCount,
        salesByYearCount: spending.salesByYearCount ?? [],
        salesByPlatform: spending.salesByPlatform ?? [],
        salesByCompany: spending.salesByCompany ?? [],
        topSalePrice: spending.topSalePrice ?? [],
        topProfit: spending.topProfit ?? [],
        topLoss: spending.topLoss ?? [],
        plByMonth,
        plByCompany: spending.plByCompany ?? [],
        salesWithROI: spending.salesWithROI ?? [],
      };
    }

    const filteredSpending: SnapshotData = {
      ...spending,
      byMonth,
      byMonthBooks,
      salesByMonth,
      salesByMonthCount,
      plByMonth,
      salesByYear: spending.salesByYear ?? [],
    };

    if (module === 'spending') {
      return filteredSpending;
    }

    return {
      ...filteredSpending,
      collection,
      features,
    };
  }

  private filterByYear<T extends { month: string }>(arr: T[] | undefined, year?: number): T[] {
    if (!arr) return [];
    if (!year) return arr;
    const yearStr = String(year);
    return arr.filter((item) => String(item.month).startsWith(yearStr));
  }

  /** Deduplicates concurrent recomputes + applies semaphore. */
  private triggerRecompute(userId: string, currency: string, year: number): Promise<UserStatsSnapshotRecord> {
    const key = `${userId}:${currency}:${year}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = this.recomputeSemaphore
      .acquire()
      .then(() =>
        year === 0
          ? this.recomputeAllTimeSnapshot(userId, currency)
          : this.recomputeYearSnapshot(userId, currency, year),
      )
      .catch((err: unknown) => {
        this.logger.error(`Recompute failed for ${key}: ${String(err)}`);
        throw err;
      })
      .finally(() => {
        this.recomputeSemaphore.release();
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Per-year recompute: loads only entries purchased in the given year with full JOINs.
   * Only computes spending stats. Collection and features are NOT in year snapshots.
   */
  private async recomputeYearSnapshot(
    userId: string,
    currency: string,
    year: number,
  ): Promise<UserStatsSnapshotRecord> {
    this.logger.debug(`Recomputing year=${year} snapshot for user ${userId} in ${currency}`);
    const enabledModules = await this.getEnabledModules(userId);
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);
    const existing = await this.snapshots.findUnique({
      where: { userId_currency_year: { userId, currency, year } },
    });
    const existingVersions = this.asModuleVersions(existing?.moduleVersions);
    const now = new Date().toISOString();
    const newVersions: ModuleVersionsRecord = { ...existingVersions };
    let spendingResult: SnapshotData = this.asRecord(existing?.spending);

    if (enabledModules.has('spending')) {
      const [entries, saleGroups] = await Promise.all([
        this.prisma.userBookEntry.findMany({
          where: { userId, purchaseGroup: { purchasedAt: { gte: startDate, lt: endDate } } },
          include: statsEntryInclude,
        }),
        this.prisma.userSaleGroup.findMany({
          where: { userId, soldAt: { gte: startDate, lt: endDate } },
          include: statsSaleGroupInclude,
        }),
      ]);

      const ctx = await this.buildSpendingContext(userId, currency, year, entries, saleGroups);
      try {
        spendingResult = this.asRecord(await this.spendingComputer.compute(ctx));
        newVersions.spending = { version: this.spendingComputer.version, computedAt: now };
      } catch (err: unknown) {
        this.logger.error(`SpendingStatsComputer failed for year=${year}: ${String(err)}`);
      }
    }

    return this.snapshots.upsert({
      where: { userId_currency_year: { userId, currency, year } },
      create: {
        userId,
        currency,
        year,
        isStale: false,
        moduleVersions: newVersions,
        spending: spendingResult,
        collection: this.asRecord(existing?.collection),
        features: this.asRecord(existing?.features),
      },
      update: {
        isStale: false,
        computedAt: new Date(),
        moduleVersions: newVersions,
        spending: spendingResult,
        collection: this.asRecord(existing?.collection),
        features: this.asRecord(existing?.features),
      },
    });
  }

  /**
   * All-time recompute: loads all entries with LIGHT JOINs (no fees/discounts/refunds),
   * runs collection and features computers, then merges spending from year snapshots.
   */
  private async recomputeAllTimeSnapshot(userId: string, currency: string): Promise<UserStatsSnapshotRecord> {
    this.logger.debug(`Recomputing all-time snapshot for user ${userId} in ${currency}`);
    const enabledModules = await this.getEnabledModules(userId);
    const existing = await this.snapshots.findUnique({
      where: { userId_currency_year: { userId, currency, year: 0 } },
    });
    const existingVersions = this.asModuleVersions(existing?.moduleVersions);
    const now = new Date().toISOString();
    const newVersions: ModuleVersionsRecord = { ...existingVersions };
    const needsLightContext = enabledModules.has('collection') || enabledModules.has('features');

    let collectionResult: SnapshotData = this.asRecord(existing?.collection);
    let featuresResult: SnapshotData = this.asRecord(existing?.features);

    if (needsLightContext) {
      const entries = await this.prisma.userBookEntry.findMany({
        where: { userId },
        include: collectionAndFeaturesEntryInclude,
      });

      const lightCtx = await this.buildLightContext(userId, currency, entries);
      const tasks: Array<Promise<void>> = [];

      if (enabledModules.has('collection')) {
        tasks.push(
          this.collectionComputer
            .compute(lightCtx)
            .then((result) => {
              collectionResult = this.asRecord(result);
              newVersions.collection = { version: this.collectionComputer.version, computedAt: now };
            })
            .catch((err: unknown) => {
              this.logger.error(`CollectionStatsComputer failed: ${String(err)}`);
            }),
        );
      }

      if (enabledModules.has('features')) {
        tasks.push(
          this.featuresComputer
            .compute(lightCtx)
            .then((result) => {
              featuresResult = this.asRecord(result);
              newVersions.features = { version: this.featuresComputer.version, computedAt: now };
            })
            .catch((err: unknown) => {
              this.logger.error(`FeaturesStatsComputer failed: ${String(err)}`);
            }),
        );
      }

      await Promise.all(tasks);
    }

    let mergedSpending = this.asRecord(existing?.spending);
    if (enabledModules.has('spending')) {
      const yearSnapshots = await this.snapshots.findMany({
        where: { userId, currency, year: { gt: 0 } },
      });
      mergedSpending = this.mergeYearSpendingSnapshots(yearSnapshots, currency);
      newVersions.spending = { version: this.spendingComputer.version, computedAt: now };
    }

    return this.snapshots.upsert({
      where: { userId_currency_year: { userId, currency, year: 0 } },
      create: {
        userId,
        currency,
        year: 0,
        isStale: false,
        moduleVersions: newVersions,
        spending: mergedSpending,
        collection: collectionResult,
        features: featuresResult,
      },
      update: {
        isStale: false,
        computedAt: new Date(),
        moduleVersions: newVersions,
        spending: mergedSpending,
        collection: collectionResult,
        features: featuresResult,
      },
    });
  }

  /** Merges spending data from all per-year snapshots into a single all-time snapshot. */
  private mergeYearSpendingSnapshots(yearSnapshots: UserStatsSnapshotRecord[], targetCurrency: string): SnapshotData {
    if (yearSnapshots.length === 0) {
      return { currency: targetCurrency, totalAllTime: 0, totalThisYear: 0, totalThisMonth: 0, avgCostPerBook: 0, booksWithCost: 0, booksThisYear: 0, booksThisMonth: 0, totalBasePrice: 0, totalShipping: 0, totalTax: 0, totalOtherFees: 0, totalDiscounts: 0, totalRefunds: 0, byYear: [], byYearBooks: [], byMonth: [], byMonthBooks: [], bySubscription: [], byCompany: [], topExpensive: [], topSalePrice: [], topProfit: [], topLoss: [], totalSalesRevenue: 0, totalSalesProfit: null, totalBooksSold: 0, salesByPlatform: [], salesByCompany: [], salesByMonth: [], salesByMonthCount: [], salesByYear: [], salesByYearCount: [], plByMonth: [], plByCompany: [], salesWithROI: [] };
    }

    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonthKey = `${thisYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const r = (v: number) => Math.round((v ?? 0) * 100) / 100;
    const n = (v: unknown): number => (typeof v === 'number' ? v : 0);

    let totalAllTime = 0, totalBasePrice = 0, totalShipping = 0, totalTax = 0;
    let totalOtherFees = 0, totalDiscounts = 0, totalRefunds = 0;
    let booksWithCost = 0, totalSalesRevenue = 0, totalBooksSold = 0;

    const byYearMap: Record<number, number> = {};
    const byYearBooksMap: Record<number, number> = {};
    const salesByYearMap: Record<number, number> = {};
    const salesByYearCountMap: Record<number, number> = {};

    const bySubMap: Record<string, { name: string; slug: string; amount: number; books: number }> = {};
    const byCompanyMap: Record<string, { name: string; slug: string; amount: number; books: number; primaryColor: string | null }> = {};
    const salesByPlatformMap: Record<string, { platform: string; amount: number; count: number }> = {};
    const salesByCompanyMap: Record<string, { name: string; slug: string; amount: number; count: number; primaryColor: string | null }> = {};
    const plByCompanyMap: Record<string, { name: string; slug: string; pl: number; revenue: number; cost: number; count: number; primaryColor: string | null }> = {};

    const byMonthAll: unknown[] = [];
    const byMonthBooksAll: unknown[] = [];
    const salesByMonthAll: unknown[] = [];
    const salesByMonthCountAll: unknown[] = [];
    const plByMonthAll: unknown[] = [];
    const topExpensiveAll: unknown[] = [];
    const topSalePriceAll: unknown[] = [];
    const topProfitAll: unknown[] = [];
    const topLossAll: unknown[] = [];
    const salesWithROIAll: unknown[] = [];

    for (const snap of yearSnapshots) {
      const s = this.asRecord(snap.spending);
      const snapYear = snap.year;

      const snapTotal = n(s.totalAllTime);
      totalAllTime += snapTotal;
      totalBasePrice += n(s.totalBasePrice);
      totalShipping += n(s.totalShipping);
      totalTax += n(s.totalTax);
      totalOtherFees += n(s.totalOtherFees);
      totalDiscounts += n(s.totalDiscounts);
      totalRefunds += n(s.totalRefunds);
      booksWithCost += n(s.booksWithCost);
      totalSalesRevenue += n(s.totalSalesRevenue);
      totalBooksSold += n(s.totalBooksSold);

      // Build byYear from each year snapshot's byYear array (should have one entry)
      if (Array.isArray(s.byYear)) {
        for (const item of s.byYear as Array<{ year: number; amount: number }>) {
          byYearMap[item.year] = (byYearMap[item.year] ?? 0) + n(item.amount);
        }
      }
      if (Array.isArray(s.byYearBooks)) {
        for (const item of s.byYearBooks as Array<{ year: number; count: number }>) {
          byYearBooksMap[item.year] = (byYearBooksMap[item.year] ?? 0) + n(item.count);
        }
      }

      if (snapYear > 0) {
        salesByYearMap[snapYear] = (salesByYearMap[snapYear] ?? 0) + n(s.totalSalesRevenue);
        salesByYearCountMap[snapYear] = (salesByYearCountMap[snapYear] ?? 0) + n(s.totalBooksSold);
      }

      if (Array.isArray(s.byMonth)) byMonthAll.push(...s.byMonth);
      if (Array.isArray(s.byMonthBooks)) byMonthBooksAll.push(...s.byMonthBooks);
      if (Array.isArray(s.salesByMonth)) salesByMonthAll.push(...s.salesByMonth);
      if (Array.isArray(s.salesByMonthCount)) salesByMonthCountAll.push(...s.salesByMonthCount);
      if (Array.isArray(s.plByMonth)) plByMonthAll.push(...s.plByMonth);
      if (Array.isArray(s.topExpensive)) topExpensiveAll.push(...s.topExpensive);
      if (Array.isArray(s.topSalePrice)) topSalePriceAll.push(...s.topSalePrice);
      if (Array.isArray(s.topProfit)) topProfitAll.push(...s.topProfit);
      if (Array.isArray(s.topLoss)) topLossAll.push(...s.topLoss);
      if (Array.isArray(s.salesWithROI)) salesWithROIAll.push(...s.salesWithROI);

      if (Array.isArray(s.bySubscription)) {
        for (const sub of s.bySubscription as Array<{ name: string; slug: string; amount: number; books: number }>) {
          if (!bySubMap[sub.slug]) bySubMap[sub.slug] = { name: sub.name, slug: sub.slug, amount: 0, books: 0 };
          bySubMap[sub.slug].amount += n(sub.amount);
          bySubMap[sub.slug].books += n(sub.books);
        }
      }
      if (Array.isArray(s.byCompany)) {
        for (const c of s.byCompany as Array<{ name: string; slug: string; amount: number; books: number; primaryColor: string | null }>) {
          const k = c.slug;
          if (!byCompanyMap[k]) byCompanyMap[k] = { name: c.name, slug: c.slug, amount: 0, books: 0, primaryColor: c.primaryColor ?? null };
          byCompanyMap[k].amount += n(c.amount);
          byCompanyMap[k].books += n(c.books);
        }
      }
      if (Array.isArray(s.salesByPlatform)) {
        for (const p of s.salesByPlatform as Array<{ platform: string; amount: number; count: number }>) {
          if (!salesByPlatformMap[p.platform]) salesByPlatformMap[p.platform] = { platform: p.platform, amount: 0, count: 0 };
          salesByPlatformMap[p.platform].amount += n(p.amount);
          salesByPlatformMap[p.platform].count += n(p.count);
        }
      }
      if (Array.isArray(s.salesByCompany)) {
        for (const c of s.salesByCompany as Array<{ name: string; slug: string; amount: number; count: number; primaryColor: string | null }>) {
          const k = c.slug;
          if (!salesByCompanyMap[k]) salesByCompanyMap[k] = { name: c.name, slug: c.slug, amount: 0, count: 0, primaryColor: c.primaryColor ?? null };
          salesByCompanyMap[k].amount += n(c.amount);
          salesByCompanyMap[k].count += n(c.count);
        }
      }
      if (Array.isArray(s.plByCompany)) {
        for (const c of s.plByCompany as Array<{ name: string; slug: string; pl: number; revenue: number; cost: number; count: number; primaryColor: string | null }>) {
          const k = c.slug;
          if (!plByCompanyMap[k]) plByCompanyMap[k] = { name: c.name, slug: c.slug, pl: 0, revenue: 0, cost: 0, count: 0, primaryColor: c.primaryColor ?? null };
          plByCompanyMap[k].pl += n(c.pl);
          plByCompanyMap[k].revenue += n(c.revenue);
          plByCompanyMap[k].cost += n(c.cost);
          plByCompanyMap[k].count += n(c.count);
        }
      }
    }

    // Derive current year/month totals from current year snapshot
    const currentYearSnap = yearSnapshots.find((s) => s.year === thisYear);
    const cys = currentYearSnap ? this.asRecord(currentYearSnap.spending) : null;
    const totalThisYear = cys ? n(cys.totalAllTime) : 0;
    const booksThisYear = cys ? n(cys.booksWithCost) : 0;
    const currentMonthEntry = cys && Array.isArray(cys.byMonth)
      ? (cys.byMonth as Array<{ month: string; amount: number }>).find((m) => m.month === thisMonthKey)
      : null;
    const totalThisMonth = currentMonthEntry?.amount ?? 0;
    const currentMonthBooksEntry = cys && Array.isArray(cys.byMonthBooks)
      ? (cys.byMonthBooks as Array<{ month: string; count: number }>).find((m) => m.month === thisMonthKey)
      : null;
    const booksThisMonth = currentMonthBooksEntry?.count ?? 0;

    // Sort monthly arrays by month key
    const sortByMonth = (arr: unknown[]) =>
      (arr as Array<{ month: string }>).sort((a, b) => a.month.localeCompare(b.month));

    // Sort and trim top lists
    (topExpensiveAll as Array<{ amount: number }>).sort((a, b) => b.amount - a.amount);
    (topSalePriceAll as Array<{ amount: number }>).sort((a, b) => b.amount - a.amount);
    (topProfitAll as Array<{ amount: number }>).sort((a, b) => b.amount - a.amount);
    (topLossAll as Array<{ amount: number }>).sort((a, b) => a.amount - b.amount);
    (salesWithROIAll as Array<{ roi: number }>).sort((a, b) => b.roi - a.roi);

    return {
      currency: targetCurrency,
      totalAllTime: r(totalAllTime),
      totalThisYear: r(totalThisYear),
      totalThisMonth: r(totalThisMonth),
      avgCostPerBook: booksWithCost > 0 ? r(totalAllTime / booksWithCost) : 0,
      booksWithCost,
      booksThisYear,
      booksThisMonth,
      totalBasePrice: r(totalBasePrice),
      totalShipping: r(totalShipping),
      totalTax: r(totalTax),
      totalOtherFees: r(totalOtherFees),
      totalDiscounts: r(totalDiscounts),
      totalRefunds: r(totalRefunds),
      byYear: Object.entries(byYearMap).map(([yr, amount]) => ({ year: Number(yr), amount: r(amount) })).sort((a, b) => a.year - b.year),
      byYearBooks: Object.entries(byYearBooksMap).map(([yr, count]) => ({ year: Number(yr), count })).sort((a, b) => a.year - b.year),
      byMonth: sortByMonth(byMonthAll),
      byMonthBooks: sortByMonth(byMonthBooksAll),
      bySubscription: Object.values(bySubMap).map((s) => ({ ...s, amount: r(s.amount) })).sort((a, b) => b.amount - a.amount),
      byCompany: Object.values(byCompanyMap).map((c) => ({ ...c, amount: r(c.amount) })).sort((a, b) => b.amount - a.amount),
      topExpensive: topExpensiveAll.slice(0, 10),
      topSalePrice: topSalePriceAll.slice(0, 10),
      topProfit: topProfitAll.slice(0, 10),
      topLoss: topLossAll.slice(0, 10),
      totalSalesRevenue: r(totalSalesRevenue),
      totalSalesProfit: null,
      totalBooksSold,
      salesByPlatform: Object.values(salesByPlatformMap).map((p) => ({ ...p, amount: r(p.amount) })).sort((a, b) => b.amount - a.amount),
      salesByCompany: Object.values(salesByCompanyMap).map((c) => ({ ...c, amount: r(c.amount) })).sort((a, b) => b.amount - a.amount),
      salesByMonth: sortByMonth(salesByMonthAll),
      salesByMonthCount: sortByMonth(salesByMonthCountAll),
      salesByYear: Object.entries(salesByYearMap).map(([yr, amount]) => ({ year: Number(yr), amount: r(amount) })).sort((a, b) => a.year - b.year),
      salesByYearCount: Object.entries(salesByYearCountMap).map(([yr, count]) => ({ year: Number(yr), count })).sort((a, b) => a.year - b.year),
      plByMonth: sortByMonth(plByMonthAll),
      plByCompany: Object.values(plByCompanyMap).map((c) => ({ ...c, pl: r(c.pl), revenue: r(c.revenue), cost: r(c.cost) })).sort((a, b) => b.pl - a.pl),
      salesWithROI: salesWithROIAll.slice(0, 50),
    };
  }

  /** Cold start: compute year snapshots for all years with data, then the all-time snapshot. */
  private async coldStartRecompute(userId: string, currency: string): Promise<void> {
    const [purchaseGroups, saleGroups] = await Promise.all([
      this.prisma.userPurchaseGroup.findMany({ where: { userId }, select: { purchasedAt: true } }),
      this.prisma.userSaleGroup.findMany({ where: { userId }, select: { soldAt: true } }),
    ]);

    const yearSet = new Set<number>();
    for (const g of purchaseGroups) yearSet.add(new Date(g.purchasedAt).getFullYear());
    for (const g of saleGroups) yearSet.add(new Date(g.soldAt).getFullYear());

    // Compute all year snapshots in parallel (semaphore limits concurrency)
    await Promise.all(Array.from(yearSet).map((year) => this.triggerRecompute(userId, currency, year)));

    // Then compute all-time snapshot (merges from year snapshots)
    await this.triggerRecompute(userId, currency, 0);
  }

  /** Full recompute (used by forceRefresh endpoint): recomputes all years + all-time. */
  async recomputeSnapshot(userId: string, currency: string): Promise<UserStatsSnapshotRecord> {
    const normalizedCurrency = currency.toUpperCase();
    await this.coldStartRecompute(userId, normalizedCurrency);
    const result = await this.snapshots.findUnique({
      where: { userId_currency_year: { userId, currency: normalizedCurrency, year: 0 } },
    });
    return result!;
  }

  async getUserCurrencies(userId: string): Promise<{ currencies: string[] }> {
    const [purchaseGroups, saleGroups, saleEntries, user] = await Promise.all([
      this.prisma.userPurchaseGroup.findMany({
        where: { userId },
        select: { currency: true },
        distinct: ['currency'],
      }),
      this.prisma.userSaleGroup.findMany({
        where: { userId },
        select: { currency: true },
        distinct: ['currency'],
      }),
      this.prisma.userBookEntry.findMany({
        where: { userId, saleCurrency: { not: null } },
        select: { saleCurrency: true },
        distinct: ['saleCurrency'],
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { preferredCurrency: true } }),
    ]);

    const seen = new Set<string>();
    if (user?.preferredCurrency) seen.add(user.preferredCurrency.toUpperCase());
    for (const g of purchaseGroups) seen.add(g.currency.toUpperCase());
    for (const g of saleGroups) seen.add(g.currency.toUpperCase());
    for (const e of saleEntries) if (e.saleCurrency) seen.add(e.saleCurrency.toUpperCase());

    return { currencies: Array.from(seen).sort() };
  }

  private async buildSpendingContext(
    userId: string,
    currency: string,
    year: number,
    entries: import('./stats.context').StatsEntryData[],
    saleGroups: import('./stats.context').StatsSaleGroupData[],
  ): Promise<StatsContext> {
    const targetCurrency = currency.toUpperCase();
    const now = new Date();

    const warmEntries: Array<{ from: string; date: Date }> = [];
    for (const entry of entries) {
      const group = entry.purchaseGroup;
      if (!group) continue;
      const purchasedAt = new Date(group.purchasedAt);
      warmEntries.push({ from: group.currency, date: purchasedAt });
      for (const fee of group.fees) warmEntries.push({ from: fee.currency, date: new Date(fee.date) });
      for (const discount of group.discounts) warmEntries.push({ from: discount.currency, date: new Date(discount.date) });
      for (const refund of group.refunds) warmEntries.push({ from: refund.currency, date: new Date(refund.date) });
      if (entry.salePrice) {
        warmEntries.push({
          from: entry.saleCurrency ?? group.currency,
          date: entry.saleDate ? new Date(entry.saleDate) : purchasedAt,
        });
      }
    }
    for (const group of saleGroups) warmEntries.push({ from: group.currency, date: new Date(group.soldAt) });

    await this.currencyService.warmCacheBatch(warmEntries, targetCurrency);

    const convert = async (amount: number, fromCurrency: string, date: Date): Promise<number> => {
      if (!fromCurrency || amount === 0) return 0;
      if (fromCurrency.toUpperCase() === targetCurrency) return amount;
      try {
        const synced = this.currencyService.convertSyncFromCache(amount, fromCurrency, targetCurrency, date);
        if (synced !== null) return synced;
        return await this.currencyService.convert(amount, fromCurrency, targetCurrency, date);
      } catch {
        return amount;
      }
    };

    return { userId, currency: targetCurrency, year, now, entries, saleGroups, convert };
  }

  private async buildLightContext(
    userId: string,
    currency: string,
    entries: CollectionAndFeaturesEntryData[],
  ): Promise<LightStatsContext> {
    const targetCurrency = currency.toUpperCase();
    const now = new Date();

    // Only warm purchase group currencies (no fees/discounts/refunds in light entries)
    const warmEntries: Array<{ from: string; date: Date }> = [];
    for (const entry of entries) {
      const group = entry.purchaseGroup;
      if (group) {
        warmEntries.push({ from: group.currency, date: new Date(group.purchasedAt) });
      }
    }
    await this.currencyService.warmCacheBatch(warmEntries, targetCurrency);

    const convert = async (amount: number, fromCurrency: string, date: Date): Promise<number> => {
      if (!fromCurrency || amount === 0) return 0;
      if (fromCurrency.toUpperCase() === targetCurrency) return amount;
      try {
        const synced = this.currencyService.convertSyncFromCache(amount, fromCurrency, targetCurrency, date);
        if (synced !== null) return synced;
        return await this.currencyService.convert(amount, fromCurrency, targetCurrency, date);
      } catch {
        return amount;
      }
    };

    return { userId, currency: targetCurrency, year: 0, now, entries, saleGroups: [], convert };
  }
}
