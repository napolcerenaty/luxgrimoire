import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SkipPolicyModule } from '../skip-policy/skip-policy.module';
import { RenewalCronService } from './renewal.cron';
import { CountryFeeSnapshotCronService } from './country-fee-snapshot.cron';
import { AnalyticsModule } from '../analytics/analytics.module';
import { UploadModule } from '../upload/upload.module';
import { CrowdStatsModule } from '../crowd-stats/crowd-stats.module';
import { StatsModule } from '../stats/stats.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SkipPolicyModule, AnalyticsModule, UploadModule, CrowdStatsModule, StatsModule, NotificationsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, RenewalCronService, CountryFeeSnapshotCronService],
})
export class SubscriptionsModule {}
