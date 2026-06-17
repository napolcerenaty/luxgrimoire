import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BookSeriesService } from './book-series.service';
import { BookSeriesQueryDto, CreateBookSeriesDto, UpdateBookSeriesDto } from './book-series.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';

@ApiTags('book-series')
@Controller('book-series')
export class BookSeriesController {
  constructor(
    private readonly bookSeriesService: BookSeriesService,
    private readonly auditService: AuditService,
  ) {}

  @Public()
  @Get()
  findAll(@Query() query: BookSeriesQueryDto) {
    return this.bookSeriesService.findAll(query);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.bookSeriesService.findBySlug(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post()
  async create(@Body() dto: CreateBookSeriesDto, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.bookSeriesService.create(dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'CREATE_BOOK_SERIES', entityType: 'book_series', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug')
  async update(@Param('slug') slug: string, @Body() dto: UpdateBookSeriesDto, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.bookSeriesService.update(slug, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'UPDATE_BOOK_SERIES', entityType: 'book_series', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete(':slug')
  async delete(@Param('slug') slug: string, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.bookSeriesService.delete(slug);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'DELETE_BOOK_SERIES', entityType: 'book_series', entityId: result.id, entityTitle: slug });
    return result;
  }
}
