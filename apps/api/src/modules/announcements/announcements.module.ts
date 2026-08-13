import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { UploadModule } from '../upload/upload.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UserCostSnapshotsModule } from '../user-cost-snapshots/user-cost-snapshots.module';

@Module({
  imports: [UploadModule, NotificationsModule, UserCostSnapshotsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
