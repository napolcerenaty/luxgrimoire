import { Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { CurrencyController } from './currency.controller';
import { CurrencyCronService } from './currency.cron';

@Module({
  controllers: [CurrencyController],
  providers: [CurrencyService, CurrencyCronService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
