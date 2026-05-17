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

  async createSaleStat(
    editionId: string,
    allocatedAmount: number,
    currency: string,
    soldAt: Date,
  ): Promise<void> {
    const valueEur = Math.round(
      (await this.currencyService.convert(allocatedAmount, currency, 'EUR', soldAt)) * 100,
    ) / 100;
    const soldAtNormalized = normalizeToMidnightUTC(soldAt);

    await this.prisma.editionSaleStat.create({
      data: { editionId, valueEur, soldAt: soldAtNormalized },
    });
  }

  async deleteSaleStat(
    editionId: string,
    allocatedAmount: number,
    currency: string,
    soldAt: Date,
  ): Promise<void> {
    const valueEur = Math.round(
      (await this.currencyService.convert(allocatedAmount, currency, 'EUR', soldAt)) * 100,
    ) / 100;
    const soldAtNormalized = normalizeToMidnightUTC(soldAt);

    await this.prisma.$queryRaw`
      DELETE FROM edition_sale_stats
      WHERE id = (
        SELECT id FROM edition_sale_stats
        WHERE "editionId" = ${editionId}
          AND "valueEur" = ${valueEur}
          AND "soldAt" = ${soldAtNormalized}
        LIMIT 1
      )
    `;
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

  async syncSaleStats(
    editionId: string,
    oldSale: { price: number; currency: string; date: Date } | null,
    newSale: { price: number; currency: string; date: Date } | null,
  ): Promise<void> {
    if (oldSale) {
      await this.deleteSaleStat(editionId, oldSale.price, oldSale.currency, oldSale.date);
    }
    if (newSale) {
      await this.createSaleStat(editionId, newSale.price, newSale.currency, newSale.date);
    }
    await this.refreshEditionSaleStats(editionId);
  }

  async getSnapshotForEdition(editionId: string) {
    return this.prisma.editionStatsSnapshot.findUnique({ where: { editionId } });
  }

  async getSnapshotForSubscription(subscriptionId: string) {
    return this.prisma.subscriptionStatsSnapshot.findUnique({ where: { subscriptionId } });
  }
}
