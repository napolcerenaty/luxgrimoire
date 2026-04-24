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
  SubscriptionQueryDto,
} from './subscriptions.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';

type CurrentUserType = { id: string; username: string; role: string; managedCompanyId: string | null };

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly auditService: AuditService,
  ) {}

  @Public()
  @Get()
  findAll(@Query() query: SubscriptionQueryDto) {
    return this.subscriptionsService.findAll(query);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.subscriptionsService.findBySlug(slug);
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
  getMonths(@Param('slug') slug: string) {
    return this.subscriptionsService.getMonths(slug);
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
  @Get(':slug/my-entry')
  getMyEntry(@CurrentUser() user: CurrentUserType, @Param('slug') slug: string) {
    return this.subscriptionsService.getMySubscriptionEntry(user.id, slug);
  }

  @ApiBearerAuth()
  @Patch(':slug/my-entry/cancel')
  cancelMyEntry(@CurrentUser() user: CurrentUserType, @Param('slug') slug: string) {
    return this.subscriptionsService.cancelMySubscription(user.id, slug);
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
  joinWaitlist(
    @CurrentUser() user: CurrentUserType,
    @Param('slug') slug: string,
    @Body() body: { joinedAt?: string },
  ) {
    return this.subscriptionsService.joinWaitlist(user.id, slug, body?.joinedAt);
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
  leaveWaitlist(@CurrentUser() user: CurrentUserType, @Param('slug') slug: string) {
    return this.subscriptionsService.leaveWaitlist(user.id, slug);
  }
}
