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

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

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
  @Roles('ADMIN', 'MODERATOR')
  @Post()
  create(@Body() dto: CreateSubscriptionDto) {
    return this.subscriptionsService.create(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() dto: UpdateSubscriptionDto) {
    return this.subscriptionsService.update(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug')
  delete(@Param('slug') slug: string) {
    return this.subscriptionsService.delete(slug);
  }

  @Public()
  @Get(':slug/months')
  getMonths(@Param('slug') slug: string) {
    return this.subscriptionsService.getMonths(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/months')
  addMonth(@Param('slug') slug: string, @Body() dto: CreateMonthDto) {
    return this.subscriptionsService.addMonth(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug/months/:year/:month')
  updateMonth(
    @Param('slug') slug: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Body() dto: UpdateMonthDto,
  ) {
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
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/months/:year/:month/books')
  addBookToMonth(
    @Param('slug') slug: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Body() dto: AddMonthBookDto,
  ) {
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
}
