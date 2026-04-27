import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SkipPolicyModule } from '../skip-policy/skip-policy.module';
import { RenewalCronService } from './renewal.cron';

@Module({
  imports: [SkipPolicyModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, RenewalCronService],
})
export class SubscriptionsModule {}
