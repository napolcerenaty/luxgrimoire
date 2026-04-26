import { Module } from '@nestjs/common';
import { SaleInterestsController } from './sale-interests.controller';
import { SaleInterestsService } from './sale-interests.service';

@Module({
  controllers: [SaleInterestsController],
  providers: [SaleInterestsService],
})
export class SaleInterestsModule {}
