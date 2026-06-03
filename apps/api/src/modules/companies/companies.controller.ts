import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto, CompanyQueryDto } from './companies.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { assertCompanyAccess } from '../../common/utils/assert-company-access.util';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly auditService: AuditService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Public()
  @Get()
  findAll(@Query() query: CompanyQueryDto) {
    return this.companiesService.findAll(query);
  }

  @Public()
  @Get('names')
  findNames() {
    return this.companiesService.findNames();
  }

  @Public()
  @Get('brand-colors')
  findAllBrandColors() {
    return this.companiesService.findAllBrandColors();
  }

  @Public()
  @Get(':slug/editions')
  getEditions(
    @Param('slug') slug: string,
    @Query('subscriptionId') subscriptionId?: string,
    @Query('collectionId') collectionId?: string,
    @Query('noCollection') noCollection?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const pagination = {
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 20,
    };
    return this.companiesService.getEditions(slug, { subscriptionId, collectionId, noCollection: noCollection === 'true' }, pagination);
  }

  @Public()
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    const result = await this.companiesService.findBySlug(slug);
    this.analyticsService.track({
      eventType: 'company_view',
      entityType: 'company',
      entityId: slug,
      entityName: (result as any)?.name ?? undefined,
    });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post()
  async create(@Body() dto: CreateCompanyDto, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.companiesService.create(dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'CREATE_COMPANY', entityType: 'company', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Patch(':slug')
  async update(
    @Param('slug') slug: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: { id: string; username: string; role: string; managedCompanyId: string | null },
  ) {
    assertCompanyAccess(user, (await this.companiesService.findBySlug(slug)).id, 'You can only manage your own company');
    const result = await this.companiesService.update(slug, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'UPDATE_COMPANY', entityType: 'company', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug')
  async delete(@Param('slug') slug: string, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.companiesService.delete(slug);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'DELETE_COMPANY', entityType: 'company', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @HttpCode(HttpStatus.OK)
  @Post(':slug/set-brand-colors')
  async setBrandColors(
    @Param('slug') slug: string,
    @Body() body: { colors: string[] },
    @CurrentUser() user: { id: string; username: string; role: string; managedCompanyId: string | null },
  ) {
    assertCompanyAccess(user, (await this.companiesService.findBySlug(slug)).id, 'You can only manage your own company');
    const colors = await this.companiesService.setBrandColors(slug, body.colors ?? []);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'SET_BRAND_COLORS', entityType: 'company', entityId: slug, entityTitle: slug });
    return { brandColors: colors };
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post(':slug/purge-official-images')
  async purgeOfficialImages(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; username: string },
  ) {
    const result = await this.companiesService.purgeOfficialImages(slug);
    void this.auditService.log({
      userId: user.id,
      username: user.username,
      action: 'PURGE_COMPANY_IMAGES',
      entityType: 'company',
      entityId: slug,
      entityTitle: slug,
    });
    return result;
  }
}
