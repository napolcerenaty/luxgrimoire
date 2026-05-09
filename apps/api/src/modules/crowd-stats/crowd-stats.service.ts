import { Injectable } from '@nestjs/common';
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

  async getCollectionCount(editionId: string): Promise<number> {
    const result = await this.prisma.userBookEntry.count({
      where: { editionId, isWishlist: false },
    });
    return result;
  }

  async getSubscriberCount(subscriptionId: string): Promise<number> {
    const result = await this.prisma.userSubscriptionEntry.count({
      where: { subscriptionId, active: true },
    });
    return result;
  }
}
