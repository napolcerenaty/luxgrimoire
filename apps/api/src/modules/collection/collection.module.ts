import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CrowdStatsModule } from '../crowd-stats/crowd-stats.module';

@Module({
  imports: [AnalyticsModule, CrowdStatsModule],
  controllers: [CollectionController],
  providers: [CollectionService],
})
export class CollectionModule {}
