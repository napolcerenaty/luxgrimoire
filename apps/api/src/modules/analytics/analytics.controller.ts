import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, SUPPORTED_EVENT_TYPES } from './analytics.dto';
import { Roles } from '../../common/decorators/auth.decorators';

@ApiTags('analytics')
@ApiBearerAuth()
@Roles('ADMIN', 'MODERATOR')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('admin/event-types')
  getEventTypes() {
    return SUPPORTED_EVENT_TYPES;
  }

  @Get('admin/query')
  async adminQuery(@Query() dto: AnalyticsQueryDto) {
    const periodDays = dto.period !== 'all' ? Number(dto.period) : undefined;
    const limit = dto.limit ? Math.min(Number(dto.limit), 100) : 20;

    return this.analyticsService.query({
      eventType: dto.metric,
      groupBy: dto.groupBy,
      periodDays,
      limit,
    });
  }
}
