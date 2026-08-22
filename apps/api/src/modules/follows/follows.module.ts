import { Module } from '@nestjs/common';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';
import { FollowNotificationsService } from './follow-notifications.service';
import { EditionFollowNotificationsCron } from './edition-follow-notifications.cron';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [FollowsController],
  providers: [FollowsService, FollowNotificationsService, EditionFollowNotificationsCron],
  exports: [FollowNotificationsService],
})
export class FollowsModule {}
