import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  controllers: [TrackingController],
})
export class TrackingModule {}
