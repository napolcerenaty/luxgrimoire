import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { CollectionStatsComputer } from './computers/collection-stats.computer';
import { FeaturesStatsComputer } from './computers/features-stats.computer';
import { SpendingStatsComputer } from './computers/spending-stats.computer';
import { StatsComputer } from './stats.computer';
import type { StatsContext } from './stats.context';
import { statsEntryInclude, statsSaleGroupInclude } from './stats.context';

type SnapshotData = Record<string, unknown>;

interface UserStatsSnapshotRecord {
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
    where: { userId_currency: { userId: string; currency: string } };
  }): Promise<UserStatsSnapshotRecord | null>;
  updateMany(args: { where: { userId: string }; data: { isStale: boolean } }): Promise<unknown>;
  upsert(args: {
    where: { userId_currency: { userId: string; currency: string } };
    create: {
      userId: string;
      currency: string;
      isStale: boolean;
      moduleVersions: Record<string, number>;
      spending: SnapshotData;
      collection: SnapshotData;
      features: SnapshotData;
    };
    update: {
      isStale: boolean;
      computedAt: Date;
      moduleVersions: Record<string, number>;
      spending: SnapshotData;
      collection: SnapshotData;
      features: SnapshotData;
    };
  }): Promise<UserStatsSnapshotRecord>;
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);
  private readonly computers: StatsComputer[];

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

  private getCurrentVersions(): Record<string, number> {
    return Object.fromEntries(this.computers.map((computer) => [computer.key, computer.version]));
  }

  private hasCurrentVersions(snapshot: Pick<UserStatsSnapshotRecord, 'moduleVersions'>): boolean {
    const versions = this.asRecord(snapshot.moduleVersions);
    return this.computers.every((computer) => versions[computer.key] === computer.version);
  }

  private asRecord(value: unknown): SnapshotData {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as SnapshotData) : {};
  }

  markStatsStale(userId: string): void {
    this.snapshots
      .updateMany({ where: { userId }, data: { isStale: true } })
      .catch((err: unknown) => this.logger.warn(`Failed to mark stats stale: ${String(err)}`));
  }

  async getStats(
    userId: string,
    currency: string,
    year?: number,
  ): Promise<{
    data: Record<string, unknown>;
    currency: string;
    computedAt: Date;
    isStale: boolean;
  }> {
    const normalizedCurrency = currency.toUpperCase();
    const snapshot = await this.snapshots.findUnique({
      where: { userId_currency: { userId, currency: normalizedCurrency } },
    });

    if (snapshot && !snapshot.isStale && this.hasCurrentVersions(snapshot)) {
      return {
        data: this.buildResponseFromSnapshot(snapshot, year),
        currency: normalizedCurrency,
        computedAt: snapshot.computedAt,
        isStale: false,
      };
    }

    if (snapshot) {
      setImmediate(() => {
        this.recomputeSnapshot(userId, normalizedCurrency).catch((err: unknown) =>
          this.logger.error(`Background recompute failed: ${String(err)}`),
        );
      });
      return {
        data: this.buildResponseFromSnapshot(snapshot, year),
        currency: normalizedCurrency,
        computedAt: snapshot.computedAt,
        isStale: true,
      };
    }

    const fresh = await this.recomputeSnapshot(userId, normalizedCurrency);
    return {
      data: this.buildResponseFromSnapshot(fresh, year),
      currency: normalizedCurrency,
      computedAt: fresh.computedAt,
      isStale: false,
    };
  }

  private buildResponseFromSnapshot(
    snapshot: Pick<UserStatsSnapshotRecord, 'spending' | 'collection' | 'features'>,
    year?: number,
  ): Record<string, unknown> {
    const spending = this.asRecord(snapshot.spending);
    const collection = this.asRecord(snapshot.collection);
    const features = this.asRecord(snapshot.features);

    let filteredSpending: SnapshotData = spending;
    if (year) {
      const yearStr = String(year);
      const byMonth = Array.isArray(spending.byMonth) ? spending.byMonth : [];
      const byMonthBooks = Array.isArray(spending.byMonthBooks) ? spending.byMonthBooks : [];

      filteredSpending = {
        ...spending,
        byMonth: byMonth.filter(
          (item): item is { month: string; amount: number } =>
            typeof item === 'object' && item !== null && 'month' in item && String(item.month).startsWith(yearStr),
        ),
        byMonthBooks: byMonthBooks.filter(
          (item): item is { month: string; count: number } =>
            typeof item === 'object' && item !== null && 'month' in item && String(item.month).startsWith(yearStr),
        ),
      };
    }

    return {
      ...filteredSpending,
      collection,
      features,
    };
  }

  async recomputeSnapshot(userId: string, currency: string): Promise<UserStatsSnapshotRecord> {
    this.logger.debug(`Recomputing stats snapshot for user ${userId} in ${currency}`);
    const ctx = await this.buildContext(userId, currency);

    const moduleVersions = this.getCurrentVersions();
    const results: Record<string, SnapshotData> = {};

    for (const computer of this.computers) {
      try {
        results[computer.key] = this.asRecord(await computer.compute(ctx));
      } catch (err: unknown) {
        this.logger.error(`Stats computer '${computer.key}' failed: ${String(err)}`);
        results[computer.key] = {};
      }
    }

    return this.snapshots.upsert({
      where: { userId_currency: { userId, currency } },
      create: {
        userId,
        currency,
        isStale: false,
        moduleVersions,
        spending: results.spending ?? {},
        collection: results.collection ?? {},
        features: results.features ?? {},
      },
      update: {
        isStale: false,
        computedAt: new Date(),
        moduleVersions,
        spending: results.spending ?? {},
        collection: results.collection ?? {},
        features: results.features ?? {},
      },
    });
  }

  private async buildContext(userId: string, currency: string): Promise<StatsContext> {
    const targetCurrency = currency.toUpperCase();
    const now = new Date();

    const [entries, saleGroups] = await Promise.all([
      this.prisma.userBookEntry.findMany({
        where: { userId },
        include: statsEntryInclude,
      }),
      this.prisma.userSaleGroup.findMany({
        where: { userId },
        include: statsSaleGroupInclude,
      }),
    ]);

    const warmEntries: Array<{ from: string; date: Date }> = [];
    for (const entry of entries) {
      const group = entry.purchaseGroup;
      if (!group) continue;

      const purchasedAt = new Date(group.purchasedAt);
      warmEntries.push({ from: group.currency, date: purchasedAt });
      for (const fee of group.fees) warmEntries.push({ from: fee.currency, date: new Date(fee.date) });
      for (const discount of group.discounts) {
        warmEntries.push({ from: discount.currency, date: new Date(discount.date) });
      }
      for (const refund of group.refunds) warmEntries.push({ from: refund.currency, date: new Date(refund.date) });
      if (entry.salePrice) {
        warmEntries.push({
          from: entry.saleCurrency ?? group.currency,
          date: entry.saleDate ? new Date(entry.saleDate) : purchasedAt,
        });
      }
    }

    for (const group of saleGroups) {
      warmEntries.push({ from: group.currency, date: new Date(group.soldAt) });
    }

    await this.currencyService.warmCacheBatch(warmEntries, targetCurrency);

    const convert = async (amount: number, fromCurrency: string, date: Date): Promise<number> => {
      if (!fromCurrency || amount === 0) return 0;
      if (fromCurrency.toUpperCase() === targetCurrency) return amount;
      try {
        return await this.currencyService.convert(amount, fromCurrency, targetCurrency, date);
      } catch {
        return amount;
      }
    };

    return {
      userId,
      currency: targetCurrency,
      year: null,
      now,
      entries,
      saleGroups,
      convert,
    };
  }
}
