import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleGroupDto, UpdateSaleGroupDto } from './sales.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Get()
  getSaleGroups(@CurrentUser() user: { id: string }) {
    return this.service.getSaleGroups(user.id);
  }

  @Get(':id')
  getSaleGroup(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.getSaleGroup(user.id, id);
  }

  @Post()
  createSaleGroup(@CurrentUser() user: { id: string }, @Body() dto: CreateSaleGroupDto) {
    return this.service.createSaleGroup(user.id, dto);
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
