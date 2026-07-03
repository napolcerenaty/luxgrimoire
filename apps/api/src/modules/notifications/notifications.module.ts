import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationRemindersCron } from './notification-reminders.cron';
import { ScheduledRemindersService } from './scheduled-reminders.service';
import { ReminderSettingsService } from './reminder-settings.service';
import { ReminderSettingsController } from './reminder-settings.controller';

@Module({
  controllers: [NotificationsController, PushController, NotificationPreferencesController, ReminderSettingsController],
  providers: [NotificationsService, PushService, NotificationRemindersCron, ScheduledRemindersService, ReminderSettingsService],
  exports: [NotificationsService, ScheduledRemindersService],
})
export class NotificationsModule {}
