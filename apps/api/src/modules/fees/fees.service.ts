import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateFeeTemplateDto,
  UpdateFeeTemplateDto,
  CreatePurchaseFeeDto,
  UpdatePurchaseFeeDto,
  CreatePurchaseDiscountDto,
  UpdatePurchaseDiscountDto,
  CreatePurchaseRefundDto,
} from './fees.dto';

@Injectable()
export class FeesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Fee Templates ────────────────────────────────────────────────────────

  async getTemplates(userId: string, activeOnly = false) {
    return this.prisma.userFeeTemplate.findMany({
      where: { userId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createTemplate(userId: string, dto: CreateFeeTemplateDto) {
    return this.prisma.userFeeTemplate.create({
      data: {
        userId,
        name: dto.name,
        category: dto.category ?? 'OTHER',
        defaultAmount: dto.defaultAmount ?? null,
        defaultCurrency: dto.defaultCurrency ?? 'PLN',
      },
    });
  }

  async updateTemplate(userId: string, templateId: string, dto: UpdateFeeTemplateDto) {
    const existing = await this.prisma.userFeeTemplate.findUnique({ where: { id: templateId } });
    if (!existing) throw new NotFoundException('Fee template not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    return this.prisma.userFeeTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.defaultAmount !== undefined && { defaultAmount: dto.defaultAmount }),
        ...(dto.defaultCurrency !== undefined && { defaultCurrency: dto.defaultCurrency }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deleteTemplate(userId: string, templateId: string) {
    const existing = await this.prisma.userFeeTemplate.findUnique({ where: { id: templateId } });
    if (!existing) throw new NotFoundException('Fee template not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.prisma.userFeeTemplate.delete({ where: { id: templateId } });
  }

  // ── Purchase Fees ────────────────────────────────────────────────────────

  async getPurchaseFees(
    userId: string,
    opts: { billingPeriodId?: string; purchaseGroupId?: string } = {},
  ) {
    return this.prisma.userPurchaseFee.findMany({
      where: {
        userId,
        ...(opts.billingPeriodId ? { billingPeriodId: opts.billingPeriodId } : {}),
        ...(opts.purchaseGroupId ? { purchaseGroupId: opts.purchaseGroupId } : {}),
      },
      include: { feeTemplate: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });
  }

  async createPurchaseFee(userId: string, dto: CreatePurchaseFeeDto) {
    return this.prisma.userPurchaseFee.create({
      data: {
        userId,
        feeTemplateId: dto.feeTemplateId ?? null,
        name: dto.name,
        amount: dto.amount,
        currency: dto.currency,
        date: new Date(dto.date),
        category: dto.category ?? 'OTHER',
        billingPeriodId: dto.billingPeriodId ?? null,
        notes: dto.notes ?? null,
      },
      include: { feeTemplate: { select: { id: true, name: true } } },
    });
  }

  async updatePurchaseFee(userId: string, feeId: string, dto: UpdatePurchaseFeeDto) {
    const existing = await this.prisma.userPurchaseFee.findUnique({ where: { id: feeId } });
    if (!existing) throw new NotFoundException('Purchase fee not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    return this.prisma.userPurchaseFee.update({
      where: { id: feeId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { feeTemplate: { select: { id: true, name: true } } },
    });
  }

  async deletePurchaseFee(userId: string, feeId: string) {
    const existing = await this.prisma.userPurchaseFee.findUnique({ where: { id: feeId } });
    if (!existing) throw new NotFoundException('Purchase fee not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.prisma.userPurchaseFee.delete({ where: { id: feeId } });
  }

  // ── Stats helper (used by spending module) ───────────────────────────────

  async getFeesForStats(userId: string, currency?: string) {
    return this.prisma.userPurchaseFee.findMany({
      where: { userId, ...(currency ? { currency } : {}) },
      select: { amount: true, currency: true, date: true, category: true },
    });
  }

  async getDiscountsForStats(userId: string, currency?: string) {
    return this.prisma.userPurchaseDiscount.findMany({
      where: { userId, ...(currency ? { currency } : {}) },
      select: { amount: true, currency: true, date: true },
    });
  }

  // ── Purchase Discounts ───────────────────────────────────────────────────

  async getDiscounts(
    userId: string,
    opts: { billingPeriodId?: string; purchaseGroupId?: string } = {},
  ) {
    return this.prisma.userPurchaseDiscount.findMany({
      where: {
        userId,
        ...(opts.billingPeriodId ? { billingPeriodId: opts.billingPeriodId } : {}),
        ...(opts.purchaseGroupId ? { purchaseGroupId: opts.purchaseGroupId } : {}),
      },
      orderBy: { date: 'desc' },
    });
  }

  async createDiscount(userId: string, dto: CreatePurchaseDiscountDto) {
    return this.prisma.userPurchaseDiscount.create({
      data: {
        userId,
        name: dto.name,
        amount: dto.amount,
        currency: dto.currency,
        date: new Date(dto.date),
        billingPeriodId: dto.billingPeriodId ?? null,
        purchaseGroupId: dto.purchaseGroupId ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async updateDiscount(userId: string, discountId: string, dto: UpdatePurchaseDiscountDto) {
    const existing = await this.prisma.userPurchaseDiscount.findUnique({ where: { id: discountId } });
    if (!existing) throw new NotFoundException('Discount not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    return this.prisma.userPurchaseDiscount.update({
      where: { id: discountId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async deleteDiscount(userId: string, discountId: string) {
    const existing = await this.prisma.userPurchaseDiscount.findUnique({ where: { id: discountId } });
    if (!existing) throw new NotFoundException('Discount not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.prisma.userPurchaseDiscount.delete({ where: { id: discountId } });
  }

  async getRefundsForStats(userId: string, currency?: string) {
    return this.prisma.userPurchaseRefund.findMany({
      where: { userId, ...(currency ? { currency } : {}) },
      select: { amount: true, currency: true, date: true },
    });
  }

  // ── Purchase Refunds ─────────────────────────────────────────────────────

  async getRefunds(
    userId: string,
    opts: { billingPeriodId?: string; purchaseGroupId?: string } = {},
  ) {
    return this.prisma.userPurchaseRefund.findMany({
      where: {
        userId,
        ...(opts.billingPeriodId ? { billingPeriodId: opts.billingPeriodId } : {}),
        ...(opts.purchaseGroupId ? { purchaseGroupId: opts.purchaseGroupId } : {}),
      },
      orderBy: { date: 'desc' },
    });
  }

  async createRefund(userId: string, dto: CreatePurchaseRefundDto) {
    return this.prisma.userPurchaseRefund.create({
      data: {
        userId,
        amount: dto.amount,
        currency: dto.currency,
        date: new Date(dto.date),
        billingPeriodId: dto.billingPeriodId ?? null,
        purchaseGroupId: dto.purchaseGroupId ?? null,
        reason: dto.reason ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async deleteRefund(userId: string, refundId: string) {
    const existing = await this.prisma.userPurchaseRefund.findUnique({ where: { id: refundId } });
    if (!existing) throw new NotFoundException('Refund not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.prisma.userPurchaseRefund.delete({ where: { id: refundId } });
  }
}
