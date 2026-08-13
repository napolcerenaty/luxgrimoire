import { Module } from '@nestjs/common';
import { UserCostSnapshotCronService } from './user-cost-snapshot.cron';

@Module({
  providers: [UserCostSnapshotCronService],
  exports: [UserCostSnapshotCronService],
})
export class UserCostSnapshotsModule {}
