import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FeesService } from './fees.service';
import {
  CreateFeeTemplateDto,
  UpdateFeeTemplateDto,
  CreatePurchaseFeeDto,
  UpdatePurchaseFeeDto,
  CreatePurchaseDiscountDto,
  UpdatePurchaseDiscountDto,
  CreatePurchaseRefundDto,
} from './fees.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('fees')
@ApiBearerAuth()
@Controller('fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  // ── Templates ─────────────────────────────────────────────────────────────

  @Get('templates')
  getTemplates(
    @CurrentUser() user: { id: string },
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.feesService.getTemplates(user.id, activeOnly === 'true');
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: { id: string }, @Body() dto: CreateFeeTemplateDto) {
    return this.feesService.createTemplate(user.id, dto);
  }

  @Patch('templates/:id')
  updateTemplate(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateFeeTemplateDto,
  ) {
    return this.feesService.updateTemplate(user.id, id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.feesService.deleteTemplate(user.id, id);
  }

  // ── Purchase Fees ─────────────────────────────────────────────────────────

  @Get()
  getPurchaseFees(
    @CurrentUser() user: { id: string },
    @Query('billingPeriodId') billingPeriodId?: string,
    @Query('purchaseGroupId') purchaseGroupId?: string,
  ) {
    return this.feesService.getPurchaseFees(user.id, { billingPeriodId, purchaseGroupId });
  }

  @Post()
  createPurchaseFee(@CurrentUser() user: { id: string }, @Body() dto: CreatePurchaseFeeDto) {
    return this.feesService.createPurchaseFee(user.id, dto);
  }

  @Patch(':id')
  updatePurchaseFee(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseFeeDto,
  ) {
    return this.feesService.updatePurchaseFee(user.id, id, dto);
  }

  @Delete(':id')
  deletePurchaseFee(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.feesService.deletePurchaseFee(user.id, id);
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  @Get('discounts')
  getDiscounts(
    @CurrentUser() user: { id: string },
    @Query('billingPeriodId') billingPeriodId?: string,
    @Query('purchaseGroupId') purchaseGroupId?: string,
  ) {
    return this.feesService.getDiscounts(user.id, { billingPeriodId, purchaseGroupId });
  }

  @Post('discounts')
  createDiscount(@CurrentUser() user: { id: string }, @Body() dto: CreatePurchaseDiscountDto) {
    return this.feesService.createDiscount(user.id, dto);
  }

  @Patch('discounts/:id')
  updateDiscount(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDiscountDto,
  ) {
    return this.feesService.updateDiscount(user.id, id, dto);
  }

  @Delete('discounts/:id')
  deleteDiscount(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.feesService.deleteDiscount(user.id, id);
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  @Get('refunds')
  getRefunds(
    @CurrentUser() user: { id: string },
    @Query('billingPeriodId') billingPeriodId?: string,
    @Query('purchaseGroupId') purchaseGroupId?: string,
  ) {
    return this.feesService.getRefunds(user.id, { billingPeriodId, purchaseGroupId });
  }

  @Post('refunds')
  createRefund(@CurrentUser() user: { id: string }, @Body() dto: CreatePurchaseRefundDto) {
    return this.feesService.createRefund(user.id, dto);
  }

  @Delete('refunds/:id')
  deleteRefund(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.feesService.deleteRefund(user.id, id);
  }
}
