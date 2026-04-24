import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SubscriptionSeriesService } from './subscription-series.service';
import {
  CreateSubscriptionSeriesDto,
  UpdateSubscriptionSeriesDto,
  AssignMonthsToSeriesDto,
} from './subscription-series.dto';
import { Roles, Public } from '../../common/decorators/auth.decorators';

@ApiTags('subscription-series')
@Controller('subscription-series')
export class SubscriptionSeriesController {
  constructor(private readonly service: SubscriptionSeriesService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List series for a subscription' })
  findBySubscriptionSlug(@Query('subscriptionSlug') subscriptionSlug: string) {
    return this.service.findBySubscriptionSlug(subscriptionSlug);
  }

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Get series by slug' })
  findOne(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @Post()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a subscription series' })
  create(@Body() dto: CreateSubscriptionSeriesDto) {
    return this.service.create(dto);
  }

  @Patch(':slug')
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a subscription series' })
  update(@Param('slug') slug: string, @Body() dto: UpdateSubscriptionSeriesDto) {
    return this.service.update(slug, dto);
  }

  @Delete(':slug')
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a subscription series (detaches months)' })
  delete(@Param('slug') slug: string) {
    return this.service.delete(slug);
  }

  @Post(':slug/months')
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign months to a series' })
  assignMonths(@Param('slug') slug: string, @Body() dto: AssignMonthsToSeriesDto) {
    return this.service.assignMonths(slug, dto);
  }

  @Delete(':slug/months')
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove months from a series' })
  removeMonths(@Param('slug') slug: string, @Body() dto: AssignMonthsToSeriesDto) {
    return this.service.removeMonths(slug, dto);
  }
}
