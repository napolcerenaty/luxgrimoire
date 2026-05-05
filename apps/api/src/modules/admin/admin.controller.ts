import { Controller, Get, Put, Post, Query, Patch, Delete, Param, Body, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { AuditLogQueryDto, RecentEditionsQueryDto, AssignRoleDto, UserQueryDto, SetMaintenanceDto } from './admin.dto';
import { UserEditionImagesService } from '../editions/user-edition-images.service';
import { UpdateImageStatusDto } from '../editions/user-edition-images.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN', 'MODERATOR')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly userImagesService: UserEditionImagesService,
  ) {}

  @Public()
  @Get('maintenance')
  getMaintenance() {
    return this.adminService.getMaintenance();
  }

  @Roles('ADMIN')
  @Put('maintenance')
  setMaintenance(@Body() dto: SetMaintenanceDto) {
    return this.adminService.setMaintenance(dto);
  }

  @Get('audit-logs')
  getAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.adminService.getAuditLogs(query);
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
  assignRole(
    @Param('userId') userId: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: { id: string; username: string },
  ) {
    return this.adminService.assignRole(userId, dto, actor);
  }

  @Roles('ADMIN')
  @Delete('users/:userId')
  async deleteUser(
    @Param('userId') userId: string,
    @CurrentUser() actor: { id: string; username: string },
  ) {
    try {
      return await this.adminService.deleteUser(userId, actor);
    } catch {
      throw new NotFoundException('User not found');
    }
  }

  @Post('backfill-renewal-dates')
  @Roles('ADMIN')
  backfillRenewalDates() {
    return this.adminService.backfillNextRenewalDates();
  }

  // Community image moderation
  @Get('community-images')
  getCommunityImages(@Query('status') status?: string) {
    return this.userImagesService.adminListImages(status);
  }

  @Patch('community-images/:id/status')
  updateCommunityImageStatus(
    @Param('id') id: string,
    @Body() dto: UpdateImageStatusDto,
  ) {
    return this.userImagesService.adminUpdateStatus(id, dto.status);
  }

  @Delete('community-images/:id')
  deleteCommunityImage(@Param('id') id: string) {
    return this.userImagesService.adminDeleteImage(id);
  }
}
