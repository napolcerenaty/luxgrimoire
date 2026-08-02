import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { UploadModule } from '../upload/upload.module';
import { EditionsModule } from '../editions/editions.module';

@Module({
  imports: [AnalyticsModule, UploadModule, EditionsModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
