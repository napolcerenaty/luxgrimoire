import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EditionsService } from './editions.service';
import {
  CreateEditionDto,
  UpdateEditionDto,
  AddArtistDto,
  EditionQueryDto,
  CreateComponentDto,
  UpdateComponentDto,
  LinkEditionHistoryDto,
} from './editions.dto';
import { SubmitUserEditionImagesDto } from './user-edition-images.dto';
import { UserEditionImagesService } from './user-edition-images.service';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { assertCompanyAccess } from '../../common/utils/assert-company-access.util';

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

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Get(':slug/for-edit')
  findBySlugForEdit(@Param('slug') slug: string) {
    return this.editionsService.findBySlugForAdmin(slug);
  }

  @Public()
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    const edition = await this.editionsService.findBySlug(slug);
    if ((edition as any)?.id) {
      const book = (edition as any).book;
      const name = book?.title
        ? book.title
        : (edition as any).bookBoxCompany?.name ?? slug;
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
    if (user.role === 'COMPANY_MANAGER' && dto.bookBoxCompanyId) {
      assertCompanyAccess(user, dto.bookBoxCompanyId, 'You can only create editions for your own company');
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
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/retag')
  retagEdition(@Param('slug') slug: string) {
    return this.editionsService.retagBySlug(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('retag-all')
  retagAll() {
    return this.editionsService.retagAll();
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Post(':slug/feature-tags')
  addFeatureTag(
    @Param('slug') slug: string,
    @Body() body: { rawValue: string; source: string; categorySlug: string },
  ) {
    return this.editionsService.addFeatureTag(slug, body);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Delete(':slug/feature-tags/:tagId')
  removeFeatureTag(@Param('slug') slug: string, @Param('tagId') tagId: string) {
    return this.editionsService.removeFeatureTag(slug, tagId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':slug/feature-tags/:tagId/categories/:categorySlug')
  removeCategoryFromFeatureTag(
    @Param('slug') slug: string,
    @Param('tagId') tagId: string,
    @Param('categorySlug') categorySlug: string,
  ) {
    return this.editionsService.removeCategoryFromTag(slug, tagId, categorySlug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Patch(':slug')
  async update(@Param('slug') slug: string, @Body() dto: UpdateEditionDto, @CurrentUser() user: CurrentUserType) {
    if (user.role === 'COMPANY_MANAGER') {
      assertCompanyAccess(user, (await this.editionsService.findBySlug(slug)).bookBoxCompanyId, 'You can only manage editions for your own company');
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
      assertCompanyAccess(user, (await this.editionsService.findBySlug(slug)).bookBoxCompanyId, 'You can only manage editions for your own company');
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

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':slug/community-images/:imageId')
  deleteCommunityImage(
    @Param('slug') _slug: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.userImagesService.userDeleteImage(imageId, user.id);
  }

  // Components (omnibus)
  @Public()
  @Get(':slug/components')
  getComponents(@Param('slug') slug: string) {
    return this.editionsService.getComponents(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/components')
  addComponent(@Param('slug') slug: string, @Body() dto: CreateComponentDto) {
    return this.editionsService.addComponent(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug/components/:componentId')
  updateComponent(
    @Param('slug') slug: string,
    @Param('componentId') componentId: string,
    @Body() dto: UpdateComponentDto,
  ) {
    return this.editionsService.updateComponent(slug, componentId, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete(':slug/components/:componentId')
  removeComponent(@Param('slug') slug: string, @Param('componentId') componentId: string) {
    return this.editionsService.removeComponent(slug, componentId);
  }

  // Edition history
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/link-history')
  linkHistory(@Param('slug') slug: string, @Body() dto: LinkEditionHistoryDto) {
    return this.editionsService.linkEditionHistory(slug, dto.relatedEditionSlug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete(':slug/link-history')
  unlinkHistory(@Param('slug') slug: string) {
    return this.editionsService.unlinkEditionHistory(slug);
  }
}
