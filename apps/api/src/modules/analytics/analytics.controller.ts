import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, SUPPORTED_EVENT_TYPES } from './analytics.dto';
import { Roles, Public } from '../../common/decorators/auth.decorators';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Public()
  @Get('public/blog-view')
  blogView() {
    this.analyticsService.track({ eventType: 'blog_view' });
    return { ok: true };
  }

  @Public()
  @Get('public/blog-post-view')
  blogPostView(@Query('slug') slug: string, @Query('title') title: string) {
    if (!slug) return { ok: false };
    this.analyticsService.track({
      eventType: 'blog_post_view',
      entityType: 'blog_post',
      entityId: slug,
      entityName: title ?? slug,
    });
    return { ok: true };
  }

  @Public()
  @Get('public/blog-post-view-count')
  async blogPostViewCount(@Query('slug') slug: string) {
    if (!slug) return { count: 0 };
    const count = await this.analyticsService.getBlogPostViewCount(slug);
    return { count };
  }

  @Roles('ADMIN', 'MODERATOR')
  @Get('admin/event-types')
  getEventTypes() {
    return SUPPORTED_EVENT_TYPES;
  }

  @Roles('ADMIN', 'MODERATOR')
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
