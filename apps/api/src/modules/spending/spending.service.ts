import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddTransactionDto, UpdateTransactionDto } from './spending.dto';

@Injectable()
export class SpendingService {
  constructor(private readonly prisma: PrismaService) {}

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
    const transactions = await this.prisma.purchaseTransaction.findMany({ where });
    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

    const byYear: Record<number, number> = {};
    const byMonthMap: Record<string, number> = {};
    const now = new Date();

    for (const t of transactions) {
      const year = t.purchasedAt.getFullYear();
      byYear[year] = (byYear[year] ?? 0) + t.amount;

      const diffMonths =
        (now.getFullYear() - t.purchasedAt.getFullYear()) * 12 +
        (now.getMonth() - t.purchasedAt.getMonth());
      if (diffMonths >= 0 && diffMonths < 12) {
        const key = `${t.purchasedAt.getFullYear()}-${String(t.purchasedAt.getMonth() + 1).padStart(2, '0')}`;
        byMonthMap[key] = (byMonthMap[key] ?? 0) + t.amount;
      }
    }

    const byMonth = Object.entries(byMonthMap)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalAmount,
      byYear: Object.entries(byYear).map(([year, amount]) => ({ year: Number(year), amount })),
      byMonth,
    };
  }
}
