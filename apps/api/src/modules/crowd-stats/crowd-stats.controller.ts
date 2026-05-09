import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CrowdStatsService } from './crowd-stats.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller()
export class CrowdStatsController {
  constructor(
    private readonly crowdStatsService: CrowdStatsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('editions/:slug/stats/sale-price')
  async getEditionSalePriceStats(@Param('slug') slug: string) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException('Edition not found');
    const snapshot = await this.crowdStatsService.getSnapshotForEdition(edition.id);
    return snapshot?.saleStats ?? { avg: null, median: null, min: null, max: null, count: 0 };
  }

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
