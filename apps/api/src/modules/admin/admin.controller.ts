import { Controller, Get, Post, Query, Patch, Delete, Param, Body, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { AdminService } from './admin.service';
import { AuditLogQueryDto, RecentEditionsQueryDto, AssignRoleDto, UserQueryDto } from './admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN', 'MODERATOR')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('audit-logs')
  getAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.adminService.getAuditLogs(query);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('recent-editions')
  getRecentEditions(@Query() query: RecentEditionsQueryDto) {
    return this.adminService.getRecentEditions(query);
  }

  @Roles('ADMIN')
  @Get('users')
  getUsers(@Query() query: UserQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Roles('ADMIN')
  @Patch('users/:userId/role')
  assignRole(@Param('userId') userId: string, @Body() dto: AssignRoleDto) {
    return this.adminService.assignRole(userId, dto);
  }

  @Roles('ADMIN')
  @Delete('users/:userId')
  async deleteUser(@Param('userId') userId: string) {
    try {
      return await this.adminService.deleteUser(userId);
    } catch {
      throw new NotFoundException('User not found');
    }
  }

  @Post('backfill-renewal-dates')
  @Roles('ADMIN')
  backfillRenewalDates() {
    return this.adminService.backfillNextRenewalDates();
  }
}
