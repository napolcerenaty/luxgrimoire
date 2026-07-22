import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, Headers, Request, HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NewsItemStatus } from '@prisma/client';
import { NewsService } from './news.service';
import { Public, Roles, OptionalAuth } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateNewsDraftDto, UpdateNewsDraftDto, IngestScreenshotDto, IngestEmailDto } from './news.dto';

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  // ─── Public ─────────────────────────────────────────────────────────────────

  @Public()
  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('date') date?: string,
  ) {
    return this.newsService.listPublished(
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      date,
    );
  }

  // Logged-in users get their unread count from their own `newsLastSeenAt` cursor;
  // anonymous visitors pass `since` (the value of their `news_last_seen_at` cookie, spec 8.2).
  @OptionalAuth()
  @Get('unread-count')
  getUnreadCount(@Request() req: any, @Query('since') since?: string) {
    if (req.user?.id) {
      return this.newsService.getUnreadCountForUser(req.user.id);
    }
    return this.newsService.getUnreadCountSince(since);
  }

  // Only meaningful for logged-in users — anonymous "seen" state lives entirely
  // in the frontend's cookie, the API doesn't need to know about it.
  @Post('mark-seen')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER', 'USER')
  markSeen(@CurrentUser() user: { id: string }) {
    return this.newsService.markSeenForUser(user.id);
  }

  // Cloudflare Worker webhook (spec 2.2) — not a logged-in caller, so it's gated
  // by a shared secret header instead of JWT/roles. Actual Cloudflare Email
  // Routing + Worker deployment is a separate, later step (not built here).
  @Public()
  @Post('ingest-email')
  @HttpCode(HttpStatus.OK)
  ingestEmail(@Body() dto: IngestEmailDto, @Headers('x-news-webhook-secret') secret?: string) {
    const expected = process.env.NEWS_EMAIL_WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid or missing webhook secret');
    }
    return this.newsService.ingestEmail(dto);
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────

  @Get('admin/drafts')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  listDrafts(
    @Query('status') status?: NewsItemStatus,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.newsService.listDrafts(status, page ? Number(page) : 1, pageSize ? Number(pageSize) : 20);
  }

  // Dedup review queue (spec 5a/5b) — must stay ahead of admin/:id below.
  @Get('admin/possible-duplicates')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  listPossibleDuplicates() {
    return this.newsService.listPossibleDuplicates();
  }

  // Subscription-confirmation emails awaiting a manual click (spec 2.2.1).
  @Get('admin/action-required')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  listActionRequired() {
    return this.newsService.listActionRequired();
  }

  @Post('admin/action-required/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  resolveActionRequired(@Param('id') id: string) {
    return this.newsService.resolveActionRequired(id);
  }

  // Silent ESP drop-off monitor (spec 2.2).
  @Get('admin/stale-newsletters')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  staleNewsletters(@Query('days') days?: string) {
    return this.newsService.findStaleNewsletterCompanies(days ? Number(days) : undefined);
  }

  @Get('admin/:id')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  getOne(@Param('id') id: string) {
    return this.newsService.getOne(id);
  }

  @Post('admin')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  create(@Body() dto: CreateNewsDraftDto) {
    return this.newsService.createDraft(dto);
  }

  // Screenshot -> AI classification (OpenAI Vision, paid) -> stored image -> draft.
  // Keep the limit tight, same reasoning as ai.controller.ts's vision endpoints.
  @Post('admin/ingest-screenshot')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  ingestScreenshot(@Body() dto: IngestScreenshotDto) {
    return this.newsService.ingestScreenshot(dto.imageBase64, dto.caption);
  }

  @Patch('admin/:id')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  update(@Param('id') id: string, @Body() dto: UpdateNewsDraftDto) {
    return this.newsService.updateDraft(id, dto);
  }

  @Post('admin/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  approve(@Param('id') id: string) {
    return this.newsService.approve(id);
  }

  @Post('admin/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  reject(@Param('id') id: string) {
    return this.newsService.reject(id);
  }

  @Post('admin/:id/retract')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  retract(@Param('id') id: string) {
    return this.newsService.retract(id);
  }

  @Post('admin/:id/confirm-duplicate')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  confirmDuplicate(@Param('id') id: string) {
    return this.newsService.confirmDuplicate(id);
  }

  @Post('admin/:id/decline-duplicate')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  declineDuplicate(@Param('id') id: string) {
    return this.newsService.declineDuplicate(id);
  }

  @Delete('admin/:id')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  remove(@Param('id') id: string) {
    return this.newsService.remove(id);
  }
}
