import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BooksService } from './books.service';
import { CreateBookDto, UpdateBookDto, BookQueryDto, CreateBookComponentDto, UpdateBookComponentDto } from './books.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(
    private readonly booksService: BooksService,
    private readonly auditService: AuditService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Public()
  @Get('series')
  findSeries(@Query('search') search?: string) {
    return this.booksService.findSeriesNames(search);
  }

  @Public()
  @Get('genres')
  findGenres(@Query('search') search?: string) {
    return this.booksService.findGenres(search);
  }

  @Public()
  @Get()
  findAll(@Query() query: BookQueryDto) {
    return this.booksService.findAll(query);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Get(':slug/for-edit')
  findBySlugForEdit(@Param('slug') slug: string) {
    return this.booksService.findBySlugForAdmin(slug);
  }

  @Public()
  @Get(':slug/editions')
  findEditionsBySlug(@Param('slug') slug: string) {
    return this.booksService.findEditionsBySlug(slug);
  }

  @Public()
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    const result = await this.booksService.findBySlug(slug);
    this.analyticsService.track({
      eventType: 'book_view',
      entityType: 'book',
      entityId: slug,
      entityName: (result as any)?.title ?? undefined,
    });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Post()
  async create(@Body() dto: CreateBookDto, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.booksService.create(dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'CREATE_BOOK', entityType: 'book', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Post('suggest')
  async suggest(@Body() dto: CreateBookDto, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.booksService.suggest(dto, user.id);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'SUGGEST_BOOK', entityType: 'book', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Patch(':slug')
  async update(@Param('slug') slug: string, @Body() dto: UpdateBookDto, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.booksService.update(slug, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'UPDATE_BOOK', entityType: 'book', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug')
  async delete(@Param('slug') slug: string, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.booksService.delete(slug);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'DELETE_BOOK', entityType: 'book', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER', 'USER')
  @Post(':slug/authors/:authorId')
  addAuthor(@Param('slug') slug: string, @Param('authorId') authorId: string) {
    return this.booksService.addAuthor(slug, authorId);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete(':slug/authors/:authorId')
  removeAuthor(@Param('slug') slug: string, @Param('authorId') authorId: string) {
    return this.booksService.removeAuthor(slug, authorId);
  }

  // Omnibus components
  @Public()
  @Get(':slug/components')
  getComponents(@Param('slug') slug: string) {
    return this.booksService.getComponents(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/components')
  addComponent(@Param('slug') slug: string, @Body() dto: CreateBookComponentDto) {
    return this.booksService.addComponent(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug/components/:componentId')
  updateComponent(
    @Param('slug') slug: string,
    @Param('componentId') componentId: string,
    @Body() dto: UpdateBookComponentDto,
  ) {
    return this.booksService.updateComponent(slug, componentId, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete(':slug/components/:componentId')
  removeComponent(@Param('slug') slug: string, @Param('componentId') componentId: string) {
    return this.booksService.removeComponent(slug, componentId);
  }
}
