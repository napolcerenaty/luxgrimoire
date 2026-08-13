import { Module } from '@nestjs/common';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';
import { StatsModule } from '../stats/stats.module';
import { UserCostSnapshotsModule } from '../user-cost-snapshots/user-cost-snapshots.module';

@Module({
  imports: [StatsModule, UserCostSnapshotsModule],
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
