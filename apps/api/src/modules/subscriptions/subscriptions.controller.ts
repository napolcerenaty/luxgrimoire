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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CreateMonthDto,
  UpdateMonthDto,
  AddMonthBookDto,
  UpdateMonthBookDto,
  SubscriptionQueryDto,
  MonthQueryDto,
  JoinSubscriptionDto,
  BackfillSubscriptionDto,
  CancelMyEntryDto,
  UpdateMyEntryCostsDto,
  RemoveMyEntryDto,
  CreatePriceChangeDto,
} from './subscriptions.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';

type CurrentUserType = { id: string; username: string; role: string; managedCompanyId: string | null };

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly auditService: AuditService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Public()
  @Get()
  findAll(@Query() query: SubscriptionQueryDto) {
    return this.subscriptionsService.findAll(query);
  }

  @Public()
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    const result = await this.subscriptionsService.findBySlug(slug);
    this.analyticsService.track({
      eventType: 'subscription_view',
      entityType: 'subscription',
      entityId: slug,
      entityName: (result as any)?.name ?? undefined,
    });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Post()
  async create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: CurrentUserType) {
    if (user.role === 'COMPANY_MANAGER' && dto.companyId !== user.managedCompanyId) {
      throw new ForbiddenException('You can only create subscriptions for your own company');
    }
    const result = await this.subscriptionsService.create(dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'CREATE_SUBSCRIPTION', entityType: 'subscription', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Patch(':slug')
  async update(@Param('slug') slug: string, @Body() dto: UpdateSubscriptionDto, @CurrentUser() user: CurrentUserType) {
    if (user.role === 'COMPANY_MANAGER') {
      const existing = await this.subscriptionsService.findBySlug(slug);
      if (existing.companyId !== user.managedCompanyId) {
        throw new ForbiddenException('You can only manage subscriptions for your own company');
      }
    }
    const result = await this.subscriptionsService.update(slug, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'UPDATE_SUBSCRIPTION', entityType: 'subscription', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug')
  async delete(@Param('slug') slug: string, @CurrentUser() user: CurrentUserType) {
    const result = await this.subscriptionsService.delete(slug);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'DELETE_SUBSCRIPTION', entityType: 'subscription', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @Public()
  @Get(':slug/months')
  getMonths(@Param('slug') slug: string, @Query() query: MonthQueryDto) {
    return this.subscriptionsService.getMonths(slug, query.page ?? 1, query.pageSize ?? 12, query.all ?? false);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Post(':slug/months')
  async addMonth(@Param('slug') slug: string, @Body() dto: CreateMonthDto, @CurrentUser() user: CurrentUserType) {
    if (user.role === 'COMPANY_MANAGER') {
      const existing = await this.subscriptionsService.findBySlug(slug);
      if (existing.companyId !== user.managedCompanyId) {
        throw new ForbiddenException('You can only manage subscriptions for your own company');
      }
    }
    return this.subscriptionsService.addMonth(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Patch(':slug/months/:year/:month')
  async updateMonth(
    @Param('slug') slug: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Body() dto: UpdateMonthDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    if (user.role === 'COMPANY_MANAGER') {
      const existing = await this.subscriptionsService.findBySlug(slug);
      if (existing.companyId !== user.managedCompanyId) {
        throw new ForbiddenException('You can only manage subscriptions for your own company');
      }
    }
    return this.subscriptionsService.updateMonth(slug, parseInt(year, 10), parseInt(month, 10), dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug/months/:year/:month')
  deleteMonth(
    @Param('slug') slug: string,
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    return this.subscriptionsService.deleteMonth(slug, parseInt(year, 10), parseInt(month, 10));
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Post(':slug/months/:year/:month/books')
  async addBookToMonth(
    @Param('slug') slug: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Body() dto: AddMonthBookDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    if (user.role === 'COMPANY_MANAGER') {
      const existing = await this.subscriptionsService.findBySlug(slug);
      if (existing.companyId !== user.managedCompanyId) {
        throw new ForbiddenException('You can only manage subscriptions for your own company');
      }
    }
    return this.subscriptionsService.addBookToMonth(slug, parseInt(year, 10), parseInt(month, 10), dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug/months/:year/:month/books/:bookId')
  removeBookFromMonth(
    @Param('slug') slug: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('bookId') bookId: string,
  ) {
    return this.subscriptionsService.removeBookFromMonth(slug, parseInt(year, 10), parseInt(month, 10), bookId);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Patch(':slug/months/:year/:month/books/:bookId')
  updateMonthBook(
    @Param('slug') slug: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('bookId') bookId: string,
    @Body() dto: UpdateMonthBookDto,
  ) {
    return this.subscriptionsService.updateMonthBook(slug, parseInt(year, 10), parseInt(month, 10), bookId, dto);
  }

  @ApiBearerAuth()
  @Get('my/subscriptions')
  getMySubscriptions(@CurrentUser() user: CurrentUserType) {
    return this.subscriptionsService.getMySubscriptions(user.id);
  }

  @ApiBearerAuth()
  @Get(':slug/country-fees')
  getCountryFeeHints(
    @Param('slug') slug: string,
    @CurrentUser() user: CurrentUserType,
    @Query('country') country?: string,
  ) {
    if (!country) return [];
    return this.subscriptionsService.getCountryFeeHints(slug, country);
  }

  @ApiBearerAuth()
  @Get(':slug/my-entry')
  getMyEntry(@CurrentUser() user: CurrentUserType, @Param('slug') slug: string) {
    return this.subscriptionsService.getMySubscriptionEntry(user.id, slug);
  }

  @ApiBearerAuth()
  @Patch(':slug/my-entry/cancel')
  async cancelMyEntry(
    @CurrentUser() user: CurrentUserType,
    @Param('slug') slug: string,
    @Body() dto: CancelMyEntryDto,
  ) {
    const result = await this.subscriptionsService.cancelMySubscription(user.id, slug, dto);
    this.analyticsService.track({
      eventType: 'subscription_cancel',
      userId: user.id,
      entityType: 'subscription',
      entityId: slug,
      // cancellationReason intentionally omitted — free text may contain PII (GDPR)
    });
    return result;
  }

  @ApiBearerAuth()
  @Patch(':slug/my-entry/costs')
  updateMyEntryCosts(
    @CurrentUser() user: CurrentUserType,
    @Param('slug') slug: string,
    @Body() dto: UpdateMyEntryCostsDto,
  ) {
    return this.subscriptionsService.updateMyEntryCosts(user.id, slug, dto);
  }

  @ApiBearerAuth()
  @Delete(':slug/my-entry')
  async removeMyEntry(
    @CurrentUser() user: CurrentUserType,
    @Param('slug') slug: string,
    @Body() dto: RemoveMyEntryDto,
  ) {
    const result = await this.subscriptionsService.removeMySubscription(user.id, slug, {
      removeBooks: dto.removeBooks ?? false,
      removeSpending: dto.removeSpending ?? false,
    });
    this.analyticsService.track({
      eventType: 'subscription_delete',
      userId: user.id,
      entityType: 'subscription',
      entityId: slug,
    });
    return result;
  }

  @ApiBearerAuth()
  @Post(':slug/join')
  async joinSubscription(
    @CurrentUser() user: CurrentUserType,
    @Param('slug') slug: string,
    @Body() dto: JoinSubscriptionDto,
  ) {
    const result = await this.subscriptionsService.joinSubscription(user.id, slug, dto);
    this.analyticsService.track({
      eventType: 'subscription_join',
      userId: user.id,
      entityType: 'subscription',
      entityId: slug,
    });
    return result;
  }

  @ApiBearerAuth()
  @Post(':slug/join/backfill')
  async backfillSubscription(
    @CurrentUser() user: CurrentUserType,
    @Param('slug') slug: string,
    @Body() dto: BackfillSubscriptionDto,
  ) {
    const result = await this.subscriptionsService.backfillSubscription(user.id, slug, dto);
    this.analyticsService.track({
      eventType: 'subscription_backfill',
      userId: user.id,
      entityType: 'subscription',
      entityId: slug,
      value: String((dto as any)?.selectedMonthIds?.length ?? 0),
    });
    return result;
  }

  // ── Waitlist ──────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @Get('waitlist/me')
  getMyWaitlist(@CurrentUser() user: CurrentUserType) {
    return this.subscriptionsService.getMyWaitlist(user.id);
  }

  @ApiBearerAuth()
  @Get(':slug/waitlist/me')
  getMyWaitlistStatus(@CurrentUser() user: CurrentUserType, @Param('slug') slug: string) {
    return this.subscriptionsService.getMyWaitlistStatus(user.id, slug);
  }

  @ApiBearerAuth()
  @Post(':slug/waitlist')
  async joinWaitlist(
    @CurrentUser() user: CurrentUserType,
    @Param('slug') slug: string,
    @Body() body: { joinedAt?: string },
  ) {
    const result = await this.subscriptionsService.joinWaitlist(user.id, slug, body?.joinedAt);
    this.analyticsService.track({
      eventType: 'waitlist_join',
      userId: user.id,
      entityType: 'subscription',
      entityId: slug,
    });
    return result;
  }

  @ApiBearerAuth()
  @Patch(':slug/waitlist')
  updateWaitlistDate(
    @CurrentUser() user: CurrentUserType,
    @Param('slug') slug: string,
    @Body() body: { joinedAt: string },
  ) {
    return this.subscriptionsService.updateWaitlistJoinDate(user.id, slug, body.joinedAt);
  }

  @ApiBearerAuth()
  @Delete(':slug/waitlist')
  async leaveWaitlist(@CurrentUser() user: CurrentUserType, @Param('slug') slug: string) {
    const result = await this.subscriptionsService.leaveWaitlist(user.id, slug);
    this.analyticsService.track({
      eventType: 'waitlist_leave',
      userId: user.id,
      entityType: 'subscription',
      entityId: slug,
    });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Get(':slug/price-changes')
  listPriceChanges(@Param('slug') slug: string) {
    return this.subscriptionsService.listPriceChanges(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/price-changes')
  async createPriceChange(
    @Param('slug') slug: string,
    @Body() dto: CreatePriceChangeDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const result = await this.subscriptionsService.createPriceChange(slug, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'CREATE_PRICE_CHANGE', entityType: 'subscription', entityId: slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete(':slug/price-changes/:id')
  async deletePriceChange(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    await this.subscriptionsService.deletePriceChange(slug, id);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'DELETE_PRICE_CHANGE', entityType: 'subscription', entityId: slug });
  }
}
