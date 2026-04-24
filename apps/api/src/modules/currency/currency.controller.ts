import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { GetRateDto, PrefetchRatesDto } from './currency.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/auth.decorators';

@Controller('currency')
@UseGuards(JwtAuthGuard)
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  /** GET /currency/rate?from=GBP&to=EUR&date=2026-01-15 */
  @Get('rate')
  async getRate(@Query() query: GetRateDto) {
    const date = query.date ? new Date(query.date) : new Date();
    const rate = await this.currencyService.getRateForDate(query.from, query.to, date);
    return { from: query.from.toUpperCase(), to: query.to.toUpperCase(), date: date.toISOString().slice(0, 10), rate };
  }

  /** POST /currency/prefetch — admin only, bulk fetch a date range */
  @Post('prefetch')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async prefetch(@Body() dto: PrefetchRatesDto) {
    const count = await this.currencyService.prefetchRates(
      dto.from,
      dto.to,
      new Date(dto.startDate),
      new Date(dto.endDate),
    );
    return { fetched: count, from: dto.from.toUpperCase(), to: dto.to.toUpperCase() };
  }
}
