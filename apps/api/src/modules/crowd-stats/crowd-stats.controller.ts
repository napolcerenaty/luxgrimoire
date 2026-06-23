import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CrowdStatsService } from './crowd-stats.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { Public } from '../../common/decorators/auth.decorators';

const COLLECTION_COUNT_TTL = 6 * 60 * 60 * 1000; // 6 hours in ms
const PLATFORM_STATS_TTL   = 60 * 60 * 1000;      // 1 hour in ms

@Controller()
export class CrowdStatsController {
  constructor(
    private readonly crowdStatsService: CrowdStatsService,
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  @Public()
  @Get('editions/:slug/stats/sale-price')
  async getEditionSalePriceStats(
    @Param('slug') slug: string,
    @Query('currency') currency?: string,
  ) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException('Edition not found');

    const snapshot = await this.crowdStatsService.getSnapshotForEdition(edition.id);
    const raw = (snapshot?.saleStats ?? null) as {
      avg: number | null; median: number | null; min: number | null; max: number | null; count: number;
    } | null;

    if (!raw || raw.count === 0) {
      return { avg: null, median: null, min: null, max: null, count: 0, currency: currency?.toUpperCase() ?? 'EUR' };
    }

    const toCurrency = (currency ?? 'EUR').toUpperCase();
    const now = new Date();

    if (toCurrency === 'EUR') {
      return { ...raw, currency: 'EUR' };
    }

    const [avg, median, min, max] = await Promise.all([
      raw.avg !== null ? this.currencyService.convert(raw.avg, 'EUR', toCurrency, now) : null,
      raw.median !== null ? this.currencyService.convert(raw.median, 'EUR', toCurrency, now) : null,
      raw.min !== null ? this.currencyService.convert(raw.min, 'EUR', toCurrency, now) : null,
      raw.max !== null ? this.currencyService.convert(raw.max, 'EUR', toCurrency, now) : null,
    ]);

    return { avg, median, min, max, count: raw.count, currency: toCurrency };
  }

  @Public()
  @Get('platform/stats')
  async getPlatformStats() {
    const cacheKey = 'platform:stats:v4';
    const cached = await this.cache.get<{
      editionsCount: number;
      companiesCount: number;
      subscriptionsCount: number;
      activeSalesCount: number;
    }>(cacheKey);
    if (cached) return cached;

    const [editionsCount, companiesCount, subscriptionsCount, activeSalesCount] = await this.prisma.$transaction([
      this.prisma.bookEdition.count({ where: { verifiedAt: { not: null } } }),
      this.prisma.bookBoxCompany.count(),
      this.prisma.subscription.count({ where: { isDiscontinued: false, isContentStream: false } }),
      this.prisma.saleAnnouncement.count({ where: { generalSaleDate: { gte: new Date() } } }),
    ]);

    const result = { editionsCount, companiesCount, subscriptionsCount, activeSalesCount };
    await this.cache.set(cacheKey, result, PLATFORM_STATS_TTL);
    return result;
  }

  @Public()
  @Get('editions/:slug/stats/collection')
  async getEditionCollectionCount(@Param('slug') slug: string) {
    const cacheKey = `edition:collection-count:${slug}`;
    const cached = await this.cache.get<{ count: number }>(cacheKey);
    if (cached) return cached;

    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException('Edition not found');

    const count = await this.prisma.userBookEntry.count({
      where: { editionId: edition.id, isWishlist: false, ownershipStatus: { not: 'SOLD' } },
    });
    const result = { count };
    await this.cache.set(cacheKey, result, COLLECTION_COUNT_TTL);
    return result;
  }

  @Public()
  @Get('subscriptions/:slug/stats/subscribers')
  async getSubscriptionSubscriberCount(@Param('slug') slug: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { slug }, select: { id: true } });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const snapshot = await this.crowdStatsService.getSnapshotForSubscription(subscription.id);
    return { count: snapshot?.subscriberCount ?? 0 };
  }
}
