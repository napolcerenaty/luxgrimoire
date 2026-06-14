import { Module } from '@nestjs/common';
import { SubscriptionSeriesController } from './subscription-series.controller';
import { SubscriptionSeriesService } from './subscription-series.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MediaAssetsModule } from '../media-assets/media-assets.module';

@Module({
  imports: [PrismaModule, AnalyticsModule, MediaAssetsModule],
  controllers: [SubscriptionSeriesController],
  providers: [SubscriptionSeriesService],
  exports: [SubscriptionSeriesService],
})
export class SubscriptionSeriesModule {}
