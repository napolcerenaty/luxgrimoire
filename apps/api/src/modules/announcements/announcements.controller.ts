import { Controller, Get, Post, Patch, Delete, Query, Param, Body, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { CreateSaleAnnouncementDto, UpdateSaleAnnouncementDto } from './announcements.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { CacheControlInterceptor } from '../../common/interceptors/cache-control.interceptor';

@ApiTags('announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Public()
  @UseInterceptors(new CacheControlInterceptor('public, max-age=30, stale-while-revalidate=60'))
  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('upcoming') upcoming?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
  ) {
    return this.announcementsService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      upcoming: upcoming === 'true',
      search,
      sort: sort === 'date' ? 'date' : 'recent',
    });
  }

  // Admin routes must come before :id to avoid route conflicts
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Get('admin')
  adminFindAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.announcementsService.adminFindAll({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      search,
      companyId,
    });
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
  @Patch('admin/:id/editions/:editionId/reprint')
  adminSetReprint(
    @Param('id') id: string,
    @Param('editionId') editionId: string,
    @Body('isReprint') isReprint: boolean,
  ) {
    return this.announcementsService.adminSetReprint(id, editionId, isReprint);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch('admin/:id/editions/reprint-all')
  adminSetAllReprint(
    @Param('id') id: string,
    @Body('isReprint') isReprint: boolean,
  ) {
    return this.announcementsService.adminSetAllReprint(id, isReprint);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete('admin/:id/editions/:editionId')
  adminRemoveEdition(@Param('id') id: string, @Param('editionId') editionId: string) {
    return this.announcementsService.adminRemoveEdition(id, editionId);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post('admin/:id/editions/:editionId/variants')
  adminSetVariant(
    @Param('id') id: string,
    @Param('editionId') editionId: string,
    @Body('signatureType') signatureType: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate',
    @Body('price') price?: number,
    @Body('currency') currency?: string,
  ) {
    return this.announcementsService.adminSetVariant(id, editionId, signatureType, price, currency);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete('admin/:id/editions/:editionId/variants/:signatureType')
  adminRemoveVariant(
    @Param('id') id: string,
    @Param('editionId') editionId: string,
    @Param('signatureType') signatureType: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate',
  ) {
    return this.announcementsService.adminRemoveVariant(id, editionId, signatureType);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post('admin/:id/regions')
  adminUpsertRegion(@Param('id') id: string, @Body() body: any) {
    return this.announcementsService.adminUpsertRegion(id, body);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete('admin/:id/regions/:regionId')
  adminDeleteRegion(@Param('id') id: string, @Param('regionId') regionId: string) {
    return this.announcementsService.adminDeleteRegion(id, regionId);
  }

  @Public()
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.announcementsService.findById(id);
  }
}
