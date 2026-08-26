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
import { ArtistsService } from './artists.service';
import { CreateArtistDto, UpdateArtistDto, ArtistQueryDto } from './artists.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';

@ApiTags('artists')
@Controller('artists')
export class ArtistsController {
  constructor(
    private readonly artistsService: ArtistsService,
    private readonly auditService: AuditService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Public()
  @Get()
  findAll(@Query() query: ArtistQueryDto) {
    return this.artistsService.findAll(query);
  }

  @Public()
  @Get(':slug/contributions')
  findContributions(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
  ) {
    return this.artistsService.findContributions(
      slug,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 24,
      sort === 'oldest' ? 'oldest' : 'newest',
    );
  }

  @Public()
  @Get(':slug/studio-contributions')
  findStudioContributions(
    @Param('slug') slug: string,
    @Query('artistId') artistId?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.artistsService.findStudioContributions(
      slug,
      artistId || undefined,
      sort === 'oldest' ? 'oldest' : 'newest',
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 24,
    );
  }

  @Public()
  @Get(':slug/studio-months')
  findStudioCardMonths(
    @Param('slug') slug: string,
    @Query('artistId') artistId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.artistsService.findStudioCardMonths(
      slug,
      artistId || undefined,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 24,
    );
  }

  @Public()
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    const result = await this.artistsService.findBySlug(slug);
    this.analyticsService.track({
      eventType: 'artist_view',
      entityType: 'artist',
      entityId: slug,
      entityName: (result as any)?.name ?? undefined,
    });
    return result;
  }

  @Public()
  @Get(':slug/months')
  findMonths(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.artistsService.findCardMonths(slug, page ? Number(page) : 1, pageSize ? Number(pageSize) : 24);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Post()
  async create(@Body() dto: CreateArtistDto, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.artistsService.create(dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'CREATE_ARTIST', entityType: 'artist', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug')
  async update(@Param('slug') slug: string, @Body() dto: UpdateArtistDto, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.artistsService.update(slug, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'UPDATE_ARTIST', entityType: 'artist', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete(':slug')
  async delete(@Param('slug') slug: string, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.artistsService.delete(slug);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'DELETE_ARTIST', entityType: 'artist', entityId: result.id, entityTitle: result.slug });
    return result;
  }
}
