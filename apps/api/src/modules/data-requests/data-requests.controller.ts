import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DataRequestsService } from './data-requests.service';
import { Roles, OptionalAuth } from '../../common/decorators/auth.decorators';

@ApiTags('data-requests')
@Controller('data-requests')
export class DataRequestsController {
  constructor(private readonly service: DataRequestsService) {}

  @Post()
  @OptionalAuth()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: { type: string; name: string; description?: string; referenceUrl?: string },
    @Request() req: any,
  ) {
    return this.service.create({
      userId: req.user?.id ?? undefined,
      type: body.type,
      name: body.name,
      description: body.description,
      referenceUrl: body.referenceUrl,
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