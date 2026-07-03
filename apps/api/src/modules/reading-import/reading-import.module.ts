import { Module } from '@nestjs/common';
import { ReadingImportController } from './reading-import.controller';
import { ReadingImportService } from './reading-import.service';

@Module({
  controllers: [ReadingImportController],
  providers: [ReadingImportService],
})
export class ReadingImportModule {}
