import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CountryFeeSnapshotCronService } from './country-fee-snapshot.cron';
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
  RemoveOrphanedHistoryDto,
  CreatePriceChangeDto,
  UpdatePriceChangeDto,
  UpdateBillingModeDto,
  CreatePrepayOptionDto,
  UpdatePrepayOptionDto,
  MigrateMonthsDto,
  UpdateSettingsHistoryEffectiveFromDto,
  ManageSkipsDto,
  YearMonthQueryDto,
} from './subscriptions.dto';
import { Public, Roles, OptionalAuth } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { assertCompanyAccess } from '../../common/utils/assert-company-access.util';

type CurrentUserType = { id: string; username: string; role: string; managedCompanyId: string | null };

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly auditService: AuditService,
    private readonly analyticsService: AnalyticsService,
    private readonly countryFeeSnapshotCron: CountryFeeSnapshotCronService,
  ) {}

  @Public()
  @Get()
  findAll(@Query() query: SubscriptionQueryDto) {
    return this.subscriptionsService.findAll(query);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Get('genres')
  findGenres(@Query('search') search?: string) {
    return this.subscriptionsService.findGenres(search);
  }

  /** Catalog-wide scan (cross-company) — deliberately ADMIN/MODERATOR only, not COMPANY_MANAGER. */
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Get('admin/month-gaps')
  getMonthGaps(@Query() query: YearMonthQueryDto) {
    return this.subscriptionsService.getMonthGaps(query.year, query.month);
  }

  /** Public "Books by Month" catalog — works for guests too; personalization (mine/skipped
   *  highlight) only applies when a valid session is present. @Public() would skip the JWT
   *  guard entirely and never populate req.user even for logged-in visitors — @OptionalAuth()
   *  alone is correct here (never throws, but still attempts to resolve the user). */
  @OptionalAuth()
  @Get('books-by-month')
  getBooksByMonth(@Query() query: YearMonthQueryDto, @Request() req: any) {
    return this.subscriptionsService.getBooksByMonth(req.user?.id ?? null, query.year, query.month);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Get(':slug/for-edit')
  findBySlugForEdit(@Param('slug') slug: string) {
    return this.subscriptionsService.findBySlugForAdmin(slug);
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
    assertCompanyAccess(user, dto.companyId, 'You can only create subscriptions for your own company');
    const result = await this.subscriptionsService.create(dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'CREATE_SUBSCRIPTION', entityType: 'subscription', entityId: result.id, entityTitle: result.slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Patch(':slug')
  async update(@Param('slug') slug: string, @Body() dto: UpdateSubscriptionDto, @CurrentUser() user: CurrentUserType) {
    if (user.role === 'COMPANY_MANAGER') { assertCompanyAccess(user, (await this.subscriptionsService.findBySlug(slug)).companyId, 'You can only manage subscriptions for your own company'); }
    const result = await this.subscriptionsService.update(slug, dto, user.id);
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
    return this.subscriptionsService.getMonths(slug, query.page ?? 1, query.pageSize ?? 12, query.all ?? false, query.ownOnly ?? false, query.fromYear, query.fromMonth, query.untilYear, query.untilMonth);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Post(':slug/months')
  async addMonth(@Param('slug') slug: string, @Body() dto: CreateMonthDto, @CurrentUser() user: CurrentUserType) {
    if (user.role === 'COMPANY_MANAGER') { assertCompanyAccess(user, (await this.subscriptionsService.findBySlug(slug)).companyId, 'You can only manage subscriptions for your own company'); }
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
    if (user.role === 'COMPANY_MANAGER') { assertCompanyAccess(user, (await this.subscriptionsService.findBySlug(slug)).companyId, 'You can only manage subscriptions for your own company'); }
    return this.subscriptionsService.updateMonth(slug, parseInt(year, 10), parseInt(month, 10), dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
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
    if (user.role === 'COMPANY_MANAGER') { assertCompanyAccess(user, (await this.subscriptionsService.findBySlug(slug)).companyId, 'You can only manage subscriptions for your own company'); }
    return this.subscriptionsService.addBookToMonth(slug, parseInt(year, 10), parseInt(month, 10), dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
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
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
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
  getMySubscriptions(
    @CurrentUser() user: CurrentUserType,
    @Query('active') active?: string,
  ) {
    const activeFilter = active === 'true' ? true : active === 'false' ? false : undefined;
    return this.subscriptionsService.getMySubscriptions(user.id, activeFilter);
  }

  @ApiBearerAuth()
  @Get('my/calendar')
  getMyCalendarSubscriptions(@CurrentUser() user: CurrentUserType) {
    return this.subscriptionsService.getMySubscriptionsForCalendar(user.id);
  }

  @ApiBearerAuth()
  @Get('my/orphaned-history')
  getOrphanedHistory(@CurrentUser() user: CurrentUserType) {
    return this.subscriptionsService.getOrphanedMembershipHistory(user.id);
  }

  @ApiBearerAuth()
  @Delete('my/orphaned-history/:historyId')
  removeOrphanedHistory(
    @CurrentUser() user: CurrentUserType,
    @Param('historyId') historyId: string,
    @Body() dto: RemoveOrphanedHistoryDto,
  ) {
    return this.subscriptionsService.removeOrphanedHistoryRecord(user.id, historyId, {
      removeBooks: dto.removeBooks,
      removeSpending: dto.removeSpending,
      removeSoldBooks: dto.removeSoldBooks,
    });
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
  @Roles('ADMIN')
  @Post('admin/refresh-country-fee-snapshots')
  async refreshCountryFeeSnapshots() {
    await this.countryFeeSnapshotCron.recalculateAll();
    return { ok: true };
  }

  @ApiBearerAuth()
  @Get(':slug/my-history')
  getMyHistory(@CurrentUser() user: CurrentUserType, @Param('slug') slug: string) {
    return this.subscriptionsService.getMySubscriptionHistory(user.id, slug);
  }

  @ApiBearerAuth()
  @Get(':slug/my-entry')
  getMyEntry(@CurrentUser() user: CurrentUserType, @Param('slug') slug: string) {
    return this.subscriptionsService.getMySubscriptionEntry(user.id, slug);
  }

  @ApiBearerAuth()
  @Get(':slug/managed-months')
  getManagedMonths(@CurrentUser() user: CurrentUserType, @Param('slug') slug: string) {
    return this.subscriptionsService.getManagedMonths(user.id, slug);
  }

  @ApiBearerAuth()
  @Post(':slug/manage-skips')
  async manageSkips(
    @CurrentUser() user: CurrentUserType,
    @Param('slug') slug: string,
    @Body() dto: ManageSkipsDto,
  ) {
    const result = await this.subscriptionsService.manageSkips(user.id, slug, dto);
    const eventType = (dto.addBooksForUnskipped || dto.removeBooksForSkipped)
      ? 'manage_skips_saved_collection'
      : 'manage_skips_saved';
    this.analyticsService.track({ eventType, entityType: 'subscription', entityId: slug });
    return result;
  }

  @ApiBearerAuth()
  @Get(':slug/next-box-preview/:year/:month')
  getNextBoxPreview(
    @CurrentUser() user: CurrentUserType,
    @Param('slug') slug: string,
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    return this.subscriptionsService.getNextBoxPreview(user.id, slug, parseInt(year, 10), parseInt(month, 10));
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
      removeSoldBooks: dto.removeSoldBooks ?? true,
      historyId: dto.historyId,
      historyIds: dto.historyIds,
      removeAllPeriods: dto.removeAllPeriods ?? false,
      removeCurrentOnly: dto.removeCurrentOnly ?? false,
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

  @ApiBearerAuth()
  @Patch(':slug/my-entry/billing-mode')
  updateMyBillingMode(
    @CurrentUser() user: CurrentUserType,
    @Param('slug') slug: string,
    @Body() dto: UpdateBillingModeDto,
  ) {
    return this.subscriptionsService.updateMyBillingMode(user.id, slug, dto);
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
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/import-months-from/:variantSlug')
  async importMonthsFromVariant(
    @Param('slug') slug: string,
    @Param('variantSlug') variantSlug: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    const result = await this.subscriptionsService.importMonthsFromVariant(slug, variantSlug);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'IMPORT_MONTHS_FROM_VARIANT', entityType: 'subscription', entityId: slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Get(':slug/settings-history')
  listSettingsHistory(@Param('slug') slug: string) {
    return this.subscriptionsService.listSettingsHistory(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug/settings-history/:id')
  async updateSettingsHistoryEffectiveFrom(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: UpdateSettingsHistoryEffectiveFromDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const result = await this.subscriptionsService.updateSettingsHistoryEffectiveFrom(slug, id, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'UPDATE_SETTINGS_HISTORY_EFFECTIVE_FROM', entityType: 'subscription', entityId: slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete(':slug/settings-history/:id')
  async deleteSettingsHistory(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    const result = await this.subscriptionsService.deleteSettingsHistory(slug, id);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'DELETE_SETTINGS_HISTORY', entityType: 'subscription', entityId: slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Get(':slug/price-changes/admin')
  listPriceChangesAdmin(@Param('slug') slug: string) {
    return this.subscriptionsService.listPriceChangesAdmin(slug);
  }

  @Public()
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
  @Patch(':slug/price-changes/:id')
  async updatePriceChange(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: UpdatePriceChangeDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const result = await this.subscriptionsService.updatePriceChange(slug, id, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'UPDATE_PRICE_CHANGE', entityType: 'subscription', entityId: slug });
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

  // ── Prepay Options ───────────────────────────────────────────────────────────

  @Public()
  @Get(':slug/prepay-options')
  getPrepayOptions(@Param('slug') slug: string) {
    return this.subscriptionsService.getPrepayOptions(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/prepay-options')
  async createPrepayOption(
    @Param('slug') slug: string,
    @Body() dto: CreatePrepayOptionDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const result = await this.subscriptionsService.createPrepayOption(slug, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'CREATE_PREPAY_OPTION', entityType: 'subscription', entityId: slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug/prepay-options/:id')
  async updatePrepayOption(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: UpdatePrepayOptionDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const result = await this.subscriptionsService.updatePrepayOption(slug, id, dto);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'UPDATE_PREPAY_OPTION', entityType: 'subscription', entityId: slug });
    return result;
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete(':slug/prepay-options/:id')
  async deletePrepayOption(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    await this.subscriptionsService.deletePrepayOption(slug, id);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'DELETE_PREPAY_OPTION', entityType: 'subscription', entityId: slug });
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/migrate-months')
  async migrateMonths(
    @Param('slug') slug: string,
    @Body() dto: MigrateMonthsDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const result = await this.subscriptionsService.migrateMonths(slug, dto.targetSubscriptionId);
    void this.auditService.log({ userId: user.id, username: user.username, action: 'MIGRATE_MONTHS', entityType: 'subscription', entityId: slug, metadata: { migratedCount: result.migratedCount, targetId: dto.targetSubscriptionId } });
    return result;
  }
}
