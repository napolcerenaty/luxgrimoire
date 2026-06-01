import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';

function normalizeToMidnightUTC(date: Date): Date {
  return new Date(date.toISOString().split('T')[0] + 'T00:00:00.000Z');
}

@Injectable()
export class CrowdStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Rebuild all sale stats for an edition from scratch:
   * 1. Delete all existing edition_sale_stats rows for the edition.
   * 2. Query every active (SOLD) UserBookEntry for that edition across all users.
   * 3. Re-insert one row per entry with EUR-converted value.
   * 4. Refresh the snapshot.
   *
   * This is always correct — no fuzzy matching, no stale rows.
   */
  async rebuildEditionSaleStats(editionId: string): Promise<void> {
    // Step 1: fetch all active sold entries for this edition
    const soldEntries = await this.prisma.userSaleEntry.findMany({
      where: {
        userBookEntry: { editionId, ownershipStatus: 'SOLD' },
      },
      select: {
        allocatedAmount: true,
        saleGroup: { select: { currency: true, soldAt: true } },
      },
    });

    // Step 2: delete all existing stats for this edition
    await this.prisma.editionSaleStat.deleteMany({ where: { editionId } });

    // Step 3: insert fresh rows
    for (const entry of soldEntries) {
      const amount = typeof entry.allocatedAmount === 'object'
        ? (entry.allocatedAmount as any).toNumber()
        : Number(entry.allocatedAmount);
      const currency = entry.saleGroup.currency;
      const soldAt = entry.saleGroup.soldAt;

      const valueEur = Math.round(
        (await this.currencyService.convert(amount, currency, 'EUR', soldAt)) * 100,
      ) / 100;

      await this.prisma.editionSaleStat.create({
        data: { editionId, valueEur, soldAt: normalizeToMidnightUTC(soldAt) },
      });
    }

    // Step 4: refresh snapshot
    await this.refreshEditionSaleStats(editionId);
  }

  async getSalePriceStats(editionId: string): Promise<{
    avg: number | null;
    median: number | null;
    min: number | null;
    max: number | null;
    count: number;
  }> {
    const result = await this.prisma.$queryRaw<
      Array<{
        avg: number | null;
        median: number | null;
        min: number | null;
        max: number | null;
        count: bigint;
      }>
    >`
      SELECT
        ROUND(AVG("valueEur")::numeric, 2)::float AS avg,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "valueEur") AS median,
        MIN("valueEur") AS min,
        MAX("valueEur") AS max,
        COUNT(*) AS count
      FROM edition_sale_stats
      WHERE "editionId" = ${editionId}
    `;

    const row = result[0];
    if (!row || Number(row.count) === 0) {
      return { avg: null, median: null, min: null, max: null, count: 0 };
    }

    return {
      avg: row.avg,
      median: row.median,
      min: row.min,
      max: row.max,
      count: Number(row.count),
    };
  }

  async refreshEditionSaleStats(editionId: string): Promise<void> {
    const stats = await this.getSalePriceStats(editionId);
    const saleStats = stats.count === 0 ? null : stats;

    await this.prisma.editionStatsSnapshot.upsert({
      where: { editionId },
      create: { editionId, saleStats: saleStats ?? Prisma.JsonNull, collectionCount: 0 },
      update: { saleStats: saleStats ?? Prisma.JsonNull },
    });
  }

  async incrementCollectionCount(_editionId: string): Promise<void> { /* no-op: replaced by live query */ }
  async decrementCollectionCount(_editionId: string): Promise<void> { /* no-op: replaced by live query */ }

  async incrementSubscriberCount(subscriptionId: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO subscription_stats_snapshots ("subscriptionId", "subscriberCount", "updatedAt")
      VALUES (${subscriptionId}, 1, NOW())
      ON CONFLICT ("subscriptionId") DO UPDATE
      SET "subscriberCount" = subscription_stats_snapshots."subscriberCount" + 1,
          "updatedAt" = NOW()
    `;
  }

  async decrementSubscriberCount(subscriptionId: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO subscription_stats_snapshots ("subscriptionId", "subscriberCount", "updatedAt")
      VALUES (${subscriptionId}, 0, NOW())
      ON CONFLICT ("subscriptionId") DO UPDATE
      SET "subscriberCount" = GREATEST(subscription_stats_snapshots."subscriberCount" - 1, 0),
          "updatedAt" = NOW()
    `;
  }

  async getSnapshotForEdition(editionId: string) {
    return this.prisma.editionStatsSnapshot.findUnique({ where: { editionId } });
  }

  async getSnapshotForSubscription(subscriptionId: string) {
    return this.prisma.subscriptionStatsSnapshot.findUnique({ where: { subscriptionId } });
  }
}
