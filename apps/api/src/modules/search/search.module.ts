import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EditionsModule } from '../editions/editions.module';

@Module({
  imports: [AnalyticsModule, EditionsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
