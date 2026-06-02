import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StatsService } from './stats.service';

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('currencies')
  getUserCurrencies(@CurrentUser() user: { id: string }) {
    return this.statsService.getUserCurrencies(user.id);
  }

  @Get('refresh')
  async forceRefresh(
    @CurrentUser() user: { id: string },
    @Query('currency') currency?: string,
  ) {
    const fresh = await this.statsService.recomputeSnapshot(user.id, currency?.toUpperCase() ?? 'EUR');
    return { computedAt: fresh.computedAt, currency: fresh.currency };
  }

  @Get()
  getStats(
    @CurrentUser() user: { id: string },
    @Query('currency') currency?: string,
    @Query('year') year?: string,
    @Query('module') module?: string,
  ) {
    return this.statsService.getStats(user.id, currency ?? 'EUR', year ? Number(year) : undefined, module);
  }
}
