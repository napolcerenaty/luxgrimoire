import { Module } from '@nestjs/common';
import { SubscriptionSeriesController } from './subscription-series.controller';
import { SubscriptionSeriesService } from './subscription-series.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [PrismaModule, AnalyticsModule],
  controllers: [SubscriptionSeriesController],
  providers: [SubscriptionSeriesService],
  exports: [SubscriptionSeriesService],
})
export class SubscriptionSeriesModule {}
