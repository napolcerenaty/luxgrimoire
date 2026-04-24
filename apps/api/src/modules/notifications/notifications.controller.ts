import {
  Controller, Get, Post, Delete, Param, Query, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/auth.decorators';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── User endpoints ──────────────────────────────────────────────────────────

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: { id: string }) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Get()
  getNotifications(
    @CurrentUser() user: { id: string },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.getNotifications(
      user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      unreadOnly === 'true',
    );
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllAsRead(@CurrentUser() user: { id: string }) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markAsRead(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  @Delete('read')
  deleteAllRead(@CurrentUser() user: { id: string }) {
    return this.notificationsService.deleteAllRead(user.id);
  }

  @Delete(':id')
  deleteOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.notificationsService.deleteNotification(user.id, id);
  }

  // ─── Admin endpoints ─────────────────────────────────────────────────────────

  @Get('admin/settings')
  @Roles('ADMIN', 'MODERATOR')
  getSettings() {
    return this.notificationsService.getSettings();
  }

  @Post('admin/settings')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MODERATOR')
  updateSettings(@Body() body: { ttlDays: number }) {
    return this.notificationsService.setDefaultTtlDays(body.ttlDays);
  }

  @Post('admin/send')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MODERATOR')
  sendNotification(
    @Body()
    body: {
      targetType: 'users' | 'role' | 'all';
      userIds?: string[];
      role?: string;
      title: string;
      bodyText?: string;
      link?: string;
      type?: string;
      expiresInDays?: number;
    },
  ) {
    return this.notificationsService.sendNotification({
      targetType: body.targetType,
      userIds: body.userIds,
      role: body.role,
      title: body.title,
      body: body.bodyText,
      link: body.link,
      type: body.type,
      expiresInDays: body.expiresInDays,
    });
  }

  @Post('admin/cleanup')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MODERATOR')
  cleanup() {
    return this.notificationsService.cleanupExpired();
  }
}
