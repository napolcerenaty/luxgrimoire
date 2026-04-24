import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddTransactionDto, UpdateTransactionDto } from './spending.dto';
import { FeesService } from '../fees/fees.service';
import { CurrencyService } from '../currency/currency.service';

@Injectable()
export class SpendingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feesService: FeesService,
    private readonly currencyService: CurrencyService,
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

  /** Comprehensive stats built from book collection data (UserBookEntry + fees) */
  async getComprehensiveStats(userId: string, targetCurrency: string) {
    const tgt = targetCurrency.toUpperCase();
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth() + 1;

    // Load all book entries with fees, purchase group and subscription info
    const entries = await this.prisma.userBookEntry.findMany({
      where: { userId },
      include: {
        purchaseFees: true,
        purchaseDiscounts: true,
        purchaseRefunds: true,
        purchaseGroup: { select: { id: true, currency: true, purchasedAt: true } },
        subscriptionEntry: {
          include: { subscription: { select: { name: true, slug: true } } },
        },
        edition: { include: { book: { select: { title: true, slug: true, authors: { include: { author: { select: { name: true } } } } } } } },
      },
    });

    // Helper: convert amount on date to target currency (best-effort, returns 0 on failure)
    const convert = async (amount: number, fromCurrency: string, date: Date): Promise<number> => {
      if (!fromCurrency || amount === 0) return 0;
      if (fromCurrency.toUpperCase() === tgt) return amount;
      try {
        return await this.currencyService.convert(amount, fromCurrency, tgt, date);
      } catch {
        return amount; // fallback: keep original amount if rate unavailable
      }
    };

    // Accumulators
    let totalAllTime = 0;
    let totalThisYear = 0;
    let totalThisMonth = 0;
    let booksWithCost = 0;
    let totalDiscounts = 0;
    let totalRefunds = 0;
    let totalFees = 0;
    let totalBasePrice = 0;
    let totalShipping = 0;
    let totalTax = 0;

    const byYearMap: Record<number, number> = {};
    const byMonthMap: Record<string, number> = {};
    const bySubMap: Record<string, { name: string; slug: string; amount: number; books: number }> = {};
    const topExpensive: Array<{ title: string; author: string; amount: number; currency: string; date: string; editionSlug: string | null }> = [];

    for (const entry of entries) {
      const purchaseCurrency = entry.priceCurrency ?? entry.purchaseGroup?.currency ?? null;
      const dateRaw = entry.purchaseDate ?? entry.purchaseGroup?.purchasedAt ?? entry.acquiredAt ?? now;
      const date = new Date(dateRaw);
      const entryYear = date.getFullYear();
      const entryMonth = date.getMonth() + 1;

      let entryTotal = 0;

      // Base price
      if (entry.allocatedPrice && purchaseCurrency) {
        const base = Number(entry.allocatedPrice);
        const converted = await convert(base, purchaseCurrency, date);
        entryTotal += converted;
        totalBasePrice += converted;
        booksWithCost++;
      }

      // Fees
      for (const fee of entry.purchaseFees) {
        const converted = await convert(Number(fee.amount), fee.currency, new Date(fee.date));
        entryTotal += converted;
        totalFees += converted;
        if (fee.category === 'SHIPPING') totalShipping += converted;
        else if (fee.category === 'VAT' || fee.category === 'CUSTOMS') totalTax += converted;
      }

      // Discounts (subtract)
      for (const disc of entry.purchaseDiscounts) {
        const converted = await convert(Number(disc.amount), disc.currency, new Date(disc.date));
        entryTotal -= converted;
        totalDiscounts += converted;
      }

      // Refunds (subtract)
      for (const ref of entry.purchaseRefunds) {
        const converted = await convert(Number(ref.amount), ref.currency, new Date(ref.date));
        entryTotal -= converted;
        totalRefunds += converted;
      }

      if (entryTotal === 0) continue;

      totalAllTime += entryTotal;
      if (entryYear === thisYear) totalThisYear += entryTotal;
      if (entryYear === thisYear && entryMonth === thisMonth) totalThisMonth += entryTotal;

      // By year
      byYearMap[entryYear] = (byYearMap[entryYear] ?? 0) + entryTotal;

      // By month (last 24 months)
      const monthKey = `${entryYear}-${String(entryMonth).padStart(2, '0')}`;
      const diffMonths = (thisYear - entryYear) * 12 + (thisMonth - entryMonth);
      if (diffMonths >= 0 && diffMonths < 24) {
        byMonthMap[monthKey] = (byMonthMap[monthKey] ?? 0) + entryTotal;
      }

      // By subscription
      if (entry.subscriptionEntry?.subscription) {
        const sub = entry.subscriptionEntry.subscription;
        if (!bySubMap[sub.slug]) bySubMap[sub.slug] = { name: sub.name, slug: sub.slug, amount: 0, books: 0 };
        bySubMap[sub.slug].amount += entryTotal;
        bySubMap[sub.slug].books++;
      }

      // Top expensive
      if (entryTotal > 0 && (entry.allocatedPrice || entry.purchaseFees.length > 0)) {
        const title = entry.edition?.book?.title ?? 'Unknown';
        const author = entry.edition?.book?.authors?.[0]?.author?.name ?? '';
        topExpensive.push({
          title,
          author,
          amount: entryTotal,
          currency: tgt,
          date: date.toISOString().slice(0, 10),
          editionSlug: entry.edition?.slug ?? null,
        });
      }
    }

    // Sort and trim top expensive
    topExpensive.sort((a, b) => b.amount - a.amount);
    const top10 = topExpensive.slice(0, 10);

    // Build byMonth array with all 24 months filled (0 for missing)
    const byMonth: Array<{ month: string; amount: number }> = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(thisYear, now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth.push({ month: key, amount: Math.round((byMonthMap[key] ?? 0) * 100) / 100 });
    }

    return {
      currency: tgt,
      totalAllTime: Math.round(totalAllTime * 100) / 100,
      totalThisYear: Math.round(totalThisYear * 100) / 100,
      totalThisMonth: Math.round(totalThisMonth * 100) / 100,
      avgCostPerBook: booksWithCost > 0 ? Math.round((totalAllTime / booksWithCost) * 100) / 100 : 0,
      booksWithCost,
      totalBasePrice: Math.round(totalBasePrice * 100) / 100,
      totalShipping: Math.round(totalShipping * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalOtherFees: Math.round((totalFees - totalShipping - totalTax) * 100) / 100,
      totalDiscounts: Math.round(totalDiscounts * 100) / 100,
      totalRefunds: Math.round(totalRefunds * 100) / 100,
      byYear: Object.entries(byYearMap)
        .map(([year, amount]) => ({ year: Number(year), amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => a.year - b.year),
      byMonth,
      bySubscription: Object.values(bySubMap)
        .map((s) => ({ ...s, amount: Math.round(s.amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount),
      topExpensive: top10,
    };
  }
}

