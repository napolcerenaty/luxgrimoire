import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EditionsModule } from '../editions/editions.module';

@Module({
  imports: [AnalyticsModule, EditionsModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
