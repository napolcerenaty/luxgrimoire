import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SkipPolicyModule } from '../skip-policy/skip-policy.module';
import { RenewalCronService } from './renewal.cron';
import { AnalyticsModule } from '../analytics/analytics.module';
import { UploadModule } from '../upload/upload.module';
import { CrowdStatsModule } from '../crowd-stats/crowd-stats.module';

@Module({
  imports: [SkipPolicyModule, AnalyticsModule, UploadModule, CrowdStatsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, RenewalCronService],
})
export class SubscriptionsModule {}
