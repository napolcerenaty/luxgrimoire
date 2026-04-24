import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddTransactionDto, UpdateTransactionDto } from './spending.dto';
import { FeesService } from '../fees/fees.service';

@Injectable()
export class SpendingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feesService: FeesService,
  ) {}

  async getTransactions(userId: string, page = 1, pageSize = 20, currency?: string) {
    const skip = (page - 1) * pageSize;
    const where = { userId, ...(currency ? { currency } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.purchaseTransaction.findMany({
        where,
        orderBy: { purchasedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.purchaseTransaction.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async addTransaction(userId: string, dto: AddTransactionDto) {
    return this.prisma.purchaseTransaction.create({
      data: {
        userId,
        amount: dto.amount,
        currency: dto.currency,
        description: dto.notes,
        purchasedAt: new Date(dto.purchasedAt),
      },
    });
  }

  async updateTransaction(userId: string, transactionId: string, dto: UpdateTransactionDto) {
    const existing = await this.prisma.purchaseTransaction.findUnique({ where: { id: transactionId } });
    if (!existing) throw new NotFoundException('Transaction not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    return this.prisma.purchaseTransaction.update({
      where: { id: transactionId },
      data: {
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.purchasedAt !== undefined && { purchasedAt: new Date(dto.purchasedAt) }),
        ...(dto.notes !== undefined && { description: dto.notes }),
      },
    });
  }

  async deleteTransaction(userId: string, transactionId: string) {
    const existing = await this.prisma.purchaseTransaction.findUnique({ where: { id: transactionId } });
    if (!existing) throw new NotFoundException('Transaction not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.prisma.purchaseTransaction.delete({ where: { id: transactionId } });
  }

  async getSpendingStats(userId: string, currency?: string) {
    const where = { userId, ...(currency ? { currency } : {}) };
    const [transactions, fees, discounts, refunds] = await Promise.all([
      this.prisma.purchaseTransaction.findMany({ where }),
      this.feesService.getFeesForStats(userId, currency),
      this.feesService.getDiscountsForStats(userId, currency),
      this.feesService.getRefundsForStats(userId, currency),
    ]);

    const byYear: Record<number, number> = {};
    const byMonthMap: Record<string, number> = {};
    const now = new Date();

    const processEntry = (amount: number, date: Date) => {
      const year = date.getFullYear();
      byYear[year] = (byYear[year] ?? 0) + amount;

      const diffMonths =
        (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
      if (diffMonths >= 0 && diffMonths < 12) {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        byMonthMap[key] = (byMonthMap[key] ?? 0) + amount;
      }
    };

    let totalAmount = 0;
    for (const t of transactions) {
      const amt = Number(t.amount);
      totalAmount += amt;
      processEntry(amt, t.purchasedAt);
    }
    for (const f of fees) {
      const amt = Number(f.amount);
      totalAmount += amt;
      processEntry(amt, f.date);
    }
    for (const d of discounts) {
      const amt = -Number(d.amount);
      totalAmount += amt;
      processEntry(amt, d.date);
    }
    for (const r of refunds) {
      const amt = -Number(r.amount);
      totalAmount += amt;
      processEntry(amt, r.date);
    }

    const byMonth= Object.entries(byMonthMap)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalAmount,
      byYear: Object.entries(byYear).map(([year, amount]) => ({ year: Number(year), amount })),
      byMonth,
    };
  }
}
