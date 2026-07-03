import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EditionsModule } from '../editions/editions.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AnalyticsModule, EditionsModule, NotificationsModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
