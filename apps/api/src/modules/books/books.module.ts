import { Module } from '@nestjs/common';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BookSeriesModule } from '../book-series/book-series.module';
import { EditionsModule } from '../editions/editions.module';

@Module({
  imports: [AnalyticsModule, BookSeriesModule, EditionsModule],
  controllers: [BooksController],
  providers: [BooksService],
})
export class BooksModule {}
