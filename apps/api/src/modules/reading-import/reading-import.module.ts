import { Module } from '@nestjs/common';
import { ReadingImportController } from './reading-import.controller';
import { ReadingImportService } from './reading-import.service';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  controllers: [ReadingImportController],
  providers: [ReadingImportService],
})
export class ReadingImportModule {}
