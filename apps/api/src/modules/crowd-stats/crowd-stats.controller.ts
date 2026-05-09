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

    const stats = await this.crowdStatsService.getSalePriceStats(edition.id);
    return stats;
  }

  @Get('editions/:slug/stats/collection')
  async getEditionCollectionCount(@Param('slug') slug: string) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException('Edition not found');

    const count = await this.crowdStatsService.getCollectionCount(edition.id);
    return { count };
  }

  @Get('subscriptions/:slug/stats/subscribers')
  async getSubscriptionSubscriberCount(@Param('slug') slug: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { slug }, select: { id: true } });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const count = await this.crowdStatsService.getSubscriberCount(subscription.id);
    return { count };
  }
}
