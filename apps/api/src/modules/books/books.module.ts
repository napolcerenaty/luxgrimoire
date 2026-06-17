import { Module } from '@nestjs/common';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BookSeriesModule } from '../book-series/book-series.module';

@Module({
  imports: [AnalyticsModule, BookSeriesModule],
  controllers: [BooksController],
  providers: [BooksService],
})
export class BooksModule {}
