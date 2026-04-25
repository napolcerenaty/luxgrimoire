import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SaleAnnouncementRequestsService } from './sale-announcement-requests.service';
import { Roles, OptionalAuth } from '../../common/decorators/auth.decorators';

@ApiTags('sale-announcement-requests')
@Controller('sale-announcement-requests')
export class SaleAnnouncementRequestsController {
  constructor(private readonly service: SaleAnnouncementRequestsService) {}

  @Post()
  @OptionalAuth()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: { url: string; notes?: string },
    @Request() req: any,
  ) {
    return this.service.create({
      userId: req.user?.id ?? undefined,
      url: body.url,
      notes: body.notes,
    });
  }

  @Get('mine')
  @ApiBearerAuth()
  findMine(@Request() req: any) {
    return this.service.findMine(req.user.id);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll(page ? Number(page) : 1, pageSize ? Number(pageSize) : 30, status);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  updateStatus(@Param('id') id: string, @Body() body: { status: string; adminNote?: string }) {
    return this.service.updateStatus(id, body.status, body.adminNote);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}