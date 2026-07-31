import { Module } from '@nestjs/common';
import { BookSeriesController } from './book-series.controller';
import { BookSeriesService } from './book-series.service';
import { AuditModule } from '../audit/audit.module';
import { EditionsModule } from '../editions/editions.module';

@Module({
  imports: [AuditModule, EditionsModule],
  controllers: [BookSeriesController],
  providers: [BookSeriesService],
  exports: [BookSeriesService],
})
export class BookSeriesModule {}
