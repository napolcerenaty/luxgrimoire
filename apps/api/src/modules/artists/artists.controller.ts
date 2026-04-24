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

@ApiTags('artists')
@Controller('artists')
export class ArtistsController {
  constructor(
    private readonly artistsService: ArtistsService,
    private readonly auditService: AuditService,
  ) {}

  @Public()
  @Get()
  findAll(@Query() query: ArtistQueryDto) {
    return this.artistsService.findAll(query);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.artistsService.findBySlug(slug);
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
  @Roles('ADMIN')
  @Delete(':slug')
  async delete(@Param('slug') slug: string, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.artistsService.delete(slug);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'DELETE_ARTIST', entityType: 'artist', entityId: result.id, entityTitle: result.slug });
    return result;
  }
}
