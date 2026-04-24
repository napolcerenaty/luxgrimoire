import { Module } from '@nestjs/common';
import { BookBoxCollectionsController } from './book-box-collections.controller';
import { BookBoxCollectionsService } from './book-box-collections.service';

@Module({
  controllers: [BookBoxCollectionsController],
  providers: [BookBoxCollectionsService],
  exports: [BookBoxCollectionsService],
})
export class BookBoxCollectionsModule {}
