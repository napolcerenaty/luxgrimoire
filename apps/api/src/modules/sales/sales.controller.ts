import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleGroupDto, UpdateSaleGroupDto, SaleGroupsQueryDto } from './sales.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AnalyticsService } from '../analytics/analytics.service';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(
    private readonly service: SalesService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get()
  getSaleGroups(
    @CurrentUser() user: { id: string },
    @Query() query: SaleGroupsQueryDto,
  ) {
    return this.service.getSaleGroups(user.id, query.page, query.pageSize);
  }

  @Get(':id')
  getSaleGroup(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.getSaleGroup(user.id, id);
  }

  @Post()
  async createSaleGroup(@CurrentUser() user: { id: string }, @Body() dto: CreateSaleGroupDto) {
    const result = await this.service.createSaleGroup(user.id, dto);
    this.analyticsService.track({
      eventType: 'mark_as_sold',
      userId: user.id,
      entityType: 'edition',
      value: dto.entryIds?.length === 1 ? 'single' : 'bundle',
    });
    return result;
  }

  @Patch(':id')
  updateSaleGroup(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateSaleGroupDto,
  ) {
    return this.service.updateSaleGroup(user.id, id, dto);
  }

  @Delete(':id')
  deleteSaleGroup(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.deleteSaleGroup(user.id, id);
  }
}
