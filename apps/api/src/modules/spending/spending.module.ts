import { Module } from '@nestjs/common';
import { SpendingController } from './spending.controller';
import { SpendingService } from './spending.service';
import { FeesModule } from '../fees/fees.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [FeesModule, CurrencyModule],
  controllers: [SpendingController],
  providers: [SpendingService],
})
export class SpendingModule {}
