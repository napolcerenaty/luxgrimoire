import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NewsItemStatus } from '@prisma/client';
import { NewsService } from './news.service';
import { Public, Roles, OptionalAuth } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateNewsDraftDto, UpdateNewsDraftDto } from './news.dto';

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

  @Delete('admin/:id')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  remove(@Param('id') id: string) {
    return this.newsService.remove(id);
  }
}
