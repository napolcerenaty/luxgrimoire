import { Controller, Get, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, SUPPORTED_EVENT_TYPES } from './analytics.dto';
import { Roles, Public, OptionalAuth } from '../../common/decorators/auth.decorators';

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

  // Global (not per-company) sales calendar page opened — @Public() like blog_view, since this
  // is a plain "is this page even used" usage count, not tied to identity.
  @Public()
  @Get('public/sales-calendar-view')
  salesCalendarView() {
    this.analyticsService.track({ eventType: 'sales_calendar_view' });
    return { ok: true };
  }

  // Company-scoped calendar view mode opened (on a company's sale-announcements list).
  @Public()
  @Get('public/company-calendar-view')
  companyCalendarView(@Query('companyId') companyId: string, @Query('companyName') companyName?: string) {
    if (!companyId) return { ok: false };
    this.analyticsService.track({
      eventType: 'company_calendar_view',
      entityType: 'company',
      entityId: companyId,
      entityName: companyName ?? companyId,
    });
    return { ok: true };
  }

  // Private /calendar page's .ics download — always a logged-in-only page, but @OptionalAuth()
  // (not @CurrentUser()) keeps this endpoint itself lightweight/fire-and-forget like its siblings.
  @OptionalAuth()
  @Get('calendar-ics-download')
  calendarIcsDownload(@Request() req: any) {
    this.analyticsService.track({ eventType: 'calendar_ics_download', userId: req.user?.id ?? null });
    return { ok: true };
  }

  // Public sales calendar's .ics download — fired from both /sales-calendar and the company-list
  // calendar embed; companyId is only present for the latter, distinguishing the two in the data.
  @OptionalAuth()
  @Get('sales-calendar-ics-download')
  salesCalendarIcsDownload(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('companyName') companyName?: string,
  ) {
    this.analyticsService.track({
      eventType: 'sales_calendar_ics_download',
      userId: req.user?.id ?? null,
      ...(companyId ? { entityType: 'company', entityId: companyId, entityName: companyName ?? companyId } : {}),
    });
    return { ok: true };
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
