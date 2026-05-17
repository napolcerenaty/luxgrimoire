import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { CrowdStatsService } from './crowd-stats.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { Public } from '../../common/decorators/auth.decorators';

@Controller()
export class CrowdStatsController {
  constructor(
    private readonly crowdStatsService: CrowdStatsService,
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
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
  @Get('editions/:slug/stats/collection')
  async getEditionCollectionCount(@Param('slug') slug: string) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException('Edition not found');
    const snapshot = await this.crowdStatsService.getSnapshotForEdition(edition.id);
    return { count: snapshot?.collectionCount ?? 0 };
  }

  @Get('subscriptions/:slug/stats/subscribers')
  async getSubscriptionSubscriberCount(@Param('slug') slug: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { slug }, select: { id: true } });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const snapshot = await this.crowdStatsService.getSnapshotForSubscription(subscription.id);
    return { count: snapshot?.subscriberCount ?? 0 };
  }
}
