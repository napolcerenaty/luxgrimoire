import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SpendingService } from './spending.service';
import { AddTransactionDto, UpdateTransactionDto } from './spending.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('spending')
@ApiBearerAuth()
@Controller('spending')
export class SpendingController {
  constructor(private readonly spendingService: SpendingService) {}

  @Get('stats/v2')
  getComprehensiveStats(
    @CurrentUser() user: { id: string },
    @Query('currency') currency?: string,
  ) {
    return this.spendingService.getComprehensiveStats(user.id, currency ?? 'EUR');
  }

  @Get('stats')  getStats(
    @CurrentUser() user: { id: string },
    @Query('currency') currency?: string,
  ) {
    return this.spendingService.getSpendingStats(user.id, currency);
  }

  @Get()
  getTransactions(
    @CurrentUser() user: { id: string },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('currency') currency?: string,
  ) {
    return this.spendingService.getTransactions(
      user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      currency,
    );
  }

  @Post()
  addTransaction(@CurrentUser() user: { id: string }, @Body() dto: AddTransactionDto) {
    return this.spendingService.addTransaction(user.id, dto);
  }

  @Patch(':id')
  updateTransaction(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.spendingService.updateTransaction(user.id, id, dto);
  }

  @Delete(':id')
  deleteTransaction(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.spendingService.deleteTransaction(user.id, id);
  }
}
