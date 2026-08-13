import { Module } from '@nestjs/common';
import { PurchaseGroupsService } from './purchase-groups.service';
import { PurchaseGroupsController } from './purchase-groups.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { StatsModule } from '../stats/stats.module';
import { UserCostSnapshotsModule } from '../user-cost-snapshots/user-cost-snapshots.module';

@Module({
  imports: [PrismaModule, StatsModule, UserCostSnapshotsModule],
  controllers: [PurchaseGroupsController],
  providers: [PurchaseGroupsService],
  exports: [PurchaseGroupsService],
})
export class PurchaseGroupsModule {}
