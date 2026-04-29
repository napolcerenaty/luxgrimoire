import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from '../analytics/analytics.service';
import { Public } from '../../common/decorators/auth.decorators';

@ApiTags('tracking')
@ApiBearerAuth()
@Controller('tracking')
export class TrackingController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @Get('click')
  @ApiQuery({ name: 'number', required: true })
  @ApiQuery({ name: 'entryId', required: false })
  async click(
    @Query('number') number: string,
    @Query('entryId') entryId: string | undefined,
    @Req() req: any,
    @Res() res: any,
  ) {
    const safe = /^[A-Za-z0-9\-\s]{3,50}$/.test(number ?? '');
    const trackingUrl = safe
      ? `https://parcelsapp.com/en/tracking/${encodeURIComponent(number.trim())}`
      : 'https://parcelsapp.com';

    const userId: string | undefined =
      (req as any).user?.sub ?? (req as any).user?.id ?? undefined;

    this.analytics.track({
      eventType: 'tracking_click',
      userId: userId ?? null,
      entityType: entryId ? 'subscription_entry' : undefined,
      entityId: entryId,
      value: safe ? number.trim().toUpperCase() : '(invalid)',
    });

    return res.redirect(trackingUrl, 302);
  }
}
