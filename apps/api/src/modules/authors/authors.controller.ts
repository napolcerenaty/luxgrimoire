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
import { AuthorsService } from './authors.service';
import { CreateAuthorDto, UpdateAuthorDto, AuthorQueryDto } from './authors.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';

@ApiTags('authors')
@Controller('authors')
export class AuthorsController {
  constructor(
    private readonly authorsService: AuthorsService,
    private readonly auditService: AuditService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Public()
  @Get()
  findAll(@Query() query: AuthorQueryDto) {
    return this.authorsService.findAll(query);
  }

  @Public()
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    const result = await this.authorsService.findBySlug(slug);
    this.analyticsService.track({
      eventType: 'author_view',
      entityType: 'author',
      entityId: slug,
      entityName: (result as any)?.name ?? undefined,
    });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER', 'USER')
  @Post()
  async create(@Body() dto: CreateAuthorDto, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.authorsService.create(dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'CREATE_AUTHOR', entityType: 'author', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug')
  async update(@Param('slug') slug: string, @Body() dto: UpdateAuthorDto, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.authorsService.update(slug, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'UPDATE_AUTHOR', entityType: 'author', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug')
  async delete(@Param('slug') slug: string, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.authorsService.delete(slug);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'DELETE_AUTHOR', entityType: 'author', entityId: result.id, entityTitle: result.slug });
    return result;
  }
}
