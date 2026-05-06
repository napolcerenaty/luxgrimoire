import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EditionsService } from './editions.service';
import {
  CreateEditionDto,
  UpdateEditionDto,
  AddArtistDto,
  EditionQueryDto,
} from './editions.dto';
import { SubmitUserEditionImagesDto } from './user-edition-images.dto';
import { UserEditionImagesService } from './user-edition-images.service';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

type CurrentUserType = { id: string; username: string; role: string; managedCompanyId: string | null };

const PRIVILEGED = ['ADMIN', 'MODERATOR', 'COMPANY_MANAGER'];

@ApiTags('editions')
@Controller('editions')
export class EditionsController {
  constructor(
    private readonly editionsService: EditionsService,
    private readonly auditService: AuditService,
    private readonly analyticsService: AnalyticsService,
    private readonly userImagesService: UserEditionImagesService,
  ) {}

  @Public()
  @Get()
  findAll(@Query() query: EditionQueryDto) {
    return this.editionsService.findAll(query);
  }

  @Public()
  @Get('publishers')
  findPublishers(@Query('search') search?: string) {
    return this.editionsService.findPublishers(search);
  }

  @Public()
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    const edition = await this.editionsService.findBySlug(slug);
    if ((edition as any)?.id) {
      const book = (edition as any).book;
      const name = book?.title
        ? `${book.title}${(edition as any).editionName ? ' · ' + (edition as any).editionName : ''}`
        : (edition as any).editionName ?? slug;
      this.analyticsService.track({
        eventType: 'edition_view',
        entityType: 'edition',
        entityId: (edition as any).id,
        entityName: name,
      });
    }
    return edition;
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateEditionDto, @CurrentUser() user: CurrentUserType) {
    if (user.role === 'COMPANY_MANAGER' && dto.bookBoxCompanyId && dto.bookBoxCompanyId !== user.managedCompanyId) {
      throw new ForbiddenException('You can only create editions for your own company');
    }
    // Privileged roles get auto-verified; regular users need verification
    const isPrivileged = PRIVILEGED.includes(user.role);
    const result = await this.editionsService.create(dto, {
      verifiedAt: isPrivileged ? new Date() : null,
      submittedByUserId: user.id,
    });
    void this.auditService.log({ userId: user.id, username: user.username, action: 'CREATE_EDITION', entityType: 'edition', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/verify')
  async verify(@Param('slug') slug: string, @CurrentUser() user: CurrentUserType) {
    const result = await this.editionsService.verify(slug);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'VERIFY_EDITION', entityType: 'edition', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Patch(':slug')
  async update(@Param('slug') slug: string, @Body() dto: UpdateEditionDto, @CurrentUser() user: CurrentUserType) {
    if (user.role === 'COMPANY_MANAGER') {
      const existing = await this.editionsService.findBySlug(slug);
      if (existing.bookBoxCompanyId !== user.managedCompanyId) {
        throw new ForbiddenException('You can only manage editions for your own company');
      }
    }
    const result = await this.editionsService.update(slug, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'UPDATE_EDITION', entityType: 'edition', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug')
  async delete(@Param('slug') slug: string, @CurrentUser() user: CurrentUserType) {
    const result = await this.editionsService.delete(slug, user.role);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'DELETE_EDITION', entityType: 'edition', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':slug/artists')
  async addArtist(@Param('slug') slug: string, @Body() dto: AddArtistDto, @CurrentUser() user: CurrentUserType) {
    if (user.role === 'COMPANY_MANAGER') {
      const existing = await this.editionsService.findBySlug(slug);
      if (existing.bookBoxCompanyId !== user.managedCompanyId) {
        throw new ForbiddenException('You can only manage editions for your own company');
      }
    }
    return this.editionsService.addArtist(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug/artists/:artistId')
  removeArtist(@Param('slug') slug: string, @Param('artistId') artistId: string) {
    return this.editionsService.removeArtist(slug, artistId);
  }

  // Community images
  @Public()
  @Get(':slug/community-images')
  getCommunityImages(@Param('slug') slug: string) {
    return this.userImagesService.getPublicImages(slug);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':slug/community-images')
  submitCommunityImages(
    @Param('slug') slug: string,
    @Body() dto: SubmitUserEditionImagesDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.userImagesService.submitImages(slug, user.id, dto);
  }
}
