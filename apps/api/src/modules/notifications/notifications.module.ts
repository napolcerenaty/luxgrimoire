import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationRemindersCron } from './notification-reminders.cron';

@Module({
  controllers: [NotificationsController, PushController, NotificationPreferencesController],
  providers: [NotificationsService, PushService, NotificationRemindersCron],
  exports: [NotificationsService],
})
export class NotificationsModule {}
