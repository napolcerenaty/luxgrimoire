import { Module } from '@nestjs/common';
import { SaleInterestsController } from './sale-interests.controller';
import { SaleInterestsService } from './sale-interests.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { UserCostSnapshotsModule } from '../user-cost-snapshots/user-cost-snapshots.module';

@Module({
  imports: [NotificationsModule, UserCostSnapshotsModule],
  controllers: [SaleInterestsController],
  providers: [SaleInterestsService],
})
export class SaleInterestsModule {}
