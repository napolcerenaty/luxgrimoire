import { Controller, Get, Post, Patch, Delete, Query, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { CreateSaleAnnouncementDto, UpdateSaleAnnouncementDto } from './announcements.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';

@ApiTags('announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Public()
  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.announcementsService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  // Admin routes must come before :id to avoid route conflicts
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Get('admin')
  adminFindAll() {
    return this.announcementsService.adminFindAll();
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post('admin')
  adminCreate(@Body() dto: CreateSaleAnnouncementDto) {
    return this.announcementsService.create(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch('admin/:id')
  adminUpdate(@Param('id') id: string, @Body() dto: UpdateSaleAnnouncementDto) {
    return this.announcementsService.update(id, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete('admin/:id')
  adminDelete(@Param('id') id: string) {
    return this.announcementsService.delete(id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post('admin/:id/editions')
  adminAddEdition(@Param('id') id: string, @Body('editionId') editionId: string) {
    return this.announcementsService.adminAddEdition(id, editionId);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete('admin/:id/editions/:editionId')
  adminRemoveEdition(@Param('id') id: string, @Param('editionId') editionId: string) {
    return this.announcementsService.adminRemoveEdition(id, editionId);
  }

  @Public()
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.announcementsService.findById(id);
  }
}
