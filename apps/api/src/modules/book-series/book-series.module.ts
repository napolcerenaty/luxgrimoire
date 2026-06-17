import { Module } from '@nestjs/common';
import { BookSeriesController } from './book-series.controller';
import { BookSeriesService } from './book-series.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [BookSeriesController],
  providers: [BookSeriesService],
  exports: [BookSeriesService],
})
export class BookSeriesModule {}
