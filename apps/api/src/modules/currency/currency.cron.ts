import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CurrencyService } from './currency.service';

/**
 * Common currency pairs used across the platform.
 * EUR is the ECB base — all pairs are available from Frankfurter.
 * Focus on pairs most relevant to book box subscriptions (UK, US, EU, PL, CA).
 */
const COMMON_PAIRS = [
  { from: 'EUR', to: 'GBP' },
  { from: 'EUR', to: 'USD' },
  { from: 'EUR', to: 'PLN' },
  { from: 'EUR', to: 'CAD' },
  { from: 'GBP', to: 'EUR' },
  { from: 'GBP', to: 'USD' },
  { from: 'GBP', to: 'PLN' },
  { from: 'USD', to: 'EUR' },
  { from: 'USD', to: 'GBP' },
  { from: 'USD', to: 'PLN' },
];

@Injectable()
export class CurrencyCronService {
  private readonly logger = new Logger(CurrencyCronService.name);

  constructor(private readonly currencyService: CurrencyService) {}

  /**
   * Runs every weekday at 17:00 UTC.
   * ECB publishes rates at ~16:00 CET (15:00 UTC winter / 14:00 UTC summer).
   * 17:00 UTC is always after publication regardless of DST.
   *
   * Why daily and not weekly/monthly:
   * - ECB publishes new rates every business day
   * - Users viewing spending/calendar today see DB-cached rates immediately
   * - Weekly = 6 cold days per week; monthly = 29 cold days per month
   * - ~10 API calls/day to Frankfurter (free, no rate limit)
   */
  @Cron('0 17 * * 1-5', { name: 'currency-rates-refresh' })
  async refreshDailyRates(): Promise<void> {
    this.logger.log('Starting daily currency rate refresh...');
    await this.currencyService.upsertCurrentRates(COMMON_PAIRS);
  }
}
