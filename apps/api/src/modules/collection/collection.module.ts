import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CrowdStatsModule } from '../crowd-stats/crowd-stats.module';
import { StatsModule } from '../stats/stats.module';
import { UserCostSnapshotsModule } from '../user-cost-snapshots/user-cost-snapshots.module';

@Module({
  imports: [AnalyticsModule, CrowdStatsModule, StatsModule, UserCostSnapshotsModule],
  controllers: [CollectionController],
  providers: [CollectionService],
})
export class CollectionModule {}
