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

  /** Comprehensive stats built from book collection data (UserBookEntry + purchaseGroup) */
  async getComprehensiveStats(userId: string, targetCurrency: string) {
    const tgt = targetCurrency.toUpperCase();
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth() + 1;

    // Load all book entries with their purchase group (fees/discounts/refunds live on the group)
    const [entries, saleGroups] = await Promise.all([
      this.prisma.userBookEntry.findMany({
        where: { userId },
        include: {
          purchaseGroup: {
            include: {
              fees: { select: { amount: true, currency: true, date: true, category: true } },
              discounts: { select: { amount: true, currency: true, date: true } },
              refunds: { select: { amount: true, currency: true, date: true } },
              bookEntries: { select: { id: true } },
            },
          },
          subscriptionEntry: {
            include: { subscription: { select: { name: true, slug: true } } },
          },
          edition: {
            include: {
              book: {
                select: {
                  title: true,
                  slug: true,
                  authors: { include: { author: { select: { name: true } } } },
                },
              },
            },
          },
        },
      }),
      this.prisma.userSaleGroup.findMany({
        where: { userId },
        include: {
          entries: { select: { id: true } },
        },
      }),
    ]);

    // Helper: convert amount on date to target currency (best-effort, returns original on failure)
    const convert = async (amount: number, fromCurrency: string, date: Date): Promise<number> => {
      if (!fromCurrency || amount === 0) return 0;
      if (fromCurrency.toUpperCase() === tgt) return amount;
      try {
        return await this.currencyService.convert(amount, fromCurrency, tgt, date);
      } catch {
        return amount;
      }
    };

    const toNum = (v: { toNumber: () => number } | number | null | undefined): number => {
      if (v == null) return 0;
      return typeof v === 'object' ? v.toNumber() : Number(v);
    };

    // Accumulators
    let totalAllTime = 0;
    let totalThisYear = 0;
    let totalThisMonth = 0;
    let booksWithCost = 0;
    let totalDiscounts = 0;
    let totalRefunds = 0;
    let totalFees = 0;
    let totalShippingFees = 0;
    let totalBasePrice = 0;
    let totalShipping = 0;
    let totalTax = 0;

    const byYearMap: Record<number, number> = {};
    const byMonthMap: Record<string, number> = {};
    const bySubMap: Record<string, { name: string; slug: string; amount: number; books: number }> = {};
    const topExpensive: Array<{ title: string; author: string; amount: number; currency: string; date: string; editionSlug: string | null }> = [];
    const topSalePrice: Array<{ title: string; author: string; amount: number; currency: string; date: string; editionSlug: string | null }> = [];
    const topProfit: Array<{ title: string; author: string; amount: number; currency: string; cost: number; date: string; editionSlug: string | null }> = [];
    const topLoss: Array<{ title: string; author: string; amount: number; currency: string; cost: number; date: string; editionSlug: string | null }> = [];

    for (const entry of entries) {
      const group = entry.purchaseGroup;
      if (!group) continue;

      const purchaseCurrency = group.currency;
      const date = new Date(group.purchasedAt);
      const entryYear = date.getFullYear();
      const entryMonth = date.getMonth() + 1;
      const entryCount = group.bookEntries.length || 1;

      // Base + shipping per entry (in group currency, converted to target)
      const basePerEntry = toNum(group.totalAmount) / entryCount;
      const shippingPerEntry = group.shippingAmount ? toNum(group.shippingAmount) / entryCount : 0;
      const baseConverted = await convert(basePerEntry, purchaseCurrency, date);
      const shippingConverted = await convert(shippingPerEntry, purchaseCurrency, date);

      // Group-level fees/discounts/refunds divided by entry count
      let feesPerEntry = 0;
      let shippingFeesPerEntry = 0;
      let taxFeesPerEntry = 0;
      for (const fee of group.fees) {
        const amt = await convert(toNum(fee.amount), fee.currency, new Date(fee.date)) / entryCount;
        feesPerEntry += amt;
        if (fee.category === 'SHIPPING' || fee.category === 'FORWARDING') shippingFeesPerEntry += amt;
        else if (fee.category === 'VAT' || fee.category === 'CUSTOMS') taxFeesPerEntry += amt;
      }

      let discountsPerEntry = 0;
      for (const disc of group.discounts) {
        discountsPerEntry += await convert(toNum(disc.amount), disc.currency, new Date(disc.date)) / entryCount;
      }

      let refundsPerEntry = 0;
      for (const ref of group.refunds) {
        refundsPerEntry += await convert(toNum(ref.amount), ref.currency, new Date(ref.date)) / entryCount;
      }

      const entryTotal = baseConverted + shippingConverted + feesPerEntry - discountsPerEntry - refundsPerEntry;
      if (entryTotal === 0) continue;

      booksWithCost++;
      totalBasePrice += baseConverted;
      totalShipping += shippingConverted + shippingFeesPerEntry;
      totalShippingFees += shippingFeesPerEntry;
      totalTax += taxFeesPerEntry;
      totalFees += feesPerEntry;
      totalDiscounts += discountsPerEntry;
      totalRefunds += refundsPerEntry;

      totalAllTime += entryTotal;
      if (entryYear === thisYear) totalThisYear += entryTotal;
      if (entryYear === thisYear && entryMonth === thisMonth) totalThisMonth += entryTotal;

      byYearMap[entryYear] = (byYearMap[entryYear] ?? 0) + entryTotal;

      const monthKey = `${entryYear}-${String(entryMonth).padStart(2, '0')}`;
      const diffMonths = (thisYear - entryYear) * 12 + (thisMonth - entryMonth);
      if (diffMonths >= 0 && diffMonths < 24) {
        byMonthMap[monthKey] = (byMonthMap[monthKey] ?? 0) + entryTotal;
      }

      if (entry.subscriptionEntry?.subscription) {
        const sub = entry.subscriptionEntry.subscription;
        if (!bySubMap[sub.slug]) bySubMap[sub.slug] = { name: sub.name, slug: sub.slug, amount: 0, books: 0 };
        bySubMap[sub.slug].amount += entryTotal;
        bySubMap[sub.slug].books++;
      }

      const bookTitle = entry.edition?.book?.title ?? 'Unknown';
      const bookAuthor = entry.edition?.book?.authors?.[0]?.author?.name ?? '';
      const editionSlug = entry.edition?.slug ?? null;
      const dateStr = date.toISOString().slice(0, 10);

      if (entryTotal > 0) {
        topExpensive.push({
          title: bookTitle,
          author: bookAuthor,
          amount: entryTotal,
          currency: tgt,
          date: dateStr,
          editionSlug,
        });
      }

      if (entry.salePrice) {
        const saleDate = entry.saleDate ? new Date(entry.saleDate) : date;
        const salePriceNum = toNum(entry.salePrice);
        const saleCur = entry.saleCurrency ?? purchaseCurrency;
        const salePriceConverted = await convert(salePriceNum, saleCur, saleDate);
        const pl = salePriceConverted - entryTotal;

        topSalePrice.push({ title: bookTitle, author: bookAuthor, amount: salePriceConverted, currency: tgt, date: dateStr, editionSlug });
        if (pl >= 0) {
          topProfit.push({ title: bookTitle, author: bookAuthor, amount: pl, currency: tgt, cost: entryTotal, date: dateStr, editionSlug });
        } else {
          topLoss.push({ title: bookTitle, author: bookAuthor, amount: pl, currency: tgt, cost: entryTotal, date: dateStr, editionSlug });
        }
      }
    }

    topExpensive.sort((a, b) => b.amount - a.amount);
    const top10 = topExpensive.slice(0, 10);

    topSalePrice.sort((a, b) => b.amount - a.amount);
    topProfit.sort((a, b) => b.amount - a.amount);
    topLoss.sort((a, b) => a.amount - b.amount);
    const top10SalePrice = topSalePrice.slice(0, 10);
    const top10Profit = topProfit.slice(0, 10);
    const top10Loss = topLoss.slice(0, 10);

    const byMonth: Array<{ month: string; amount: number }> = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(thisYear, now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth.push({ month: key, amount: Math.round((byMonthMap[key] ?? 0) * 100) / 100 });
    }

    // ── Sales stats ──────────────────────────────────────────────────────────
    let totalSalesRevenue = 0;
    let totalBooksSold = 0;

    const salesByPlatformMap: Record<string, { platform: string; amount: number; count: number }> = {};
    const salesByMonthMap: Record<string, number> = {};

    for (const group of saleGroups) {
      const soldDate = new Date(group.soldAt);
      const revenue = await convert(Number(group.totalAmount), group.currency, soldDate);
      totalSalesRevenue += revenue;
      totalBooksSold += group.entries.length;

      const platform = (group.platform as string | null) || 'other';
      if (!salesByPlatformMap[platform]) salesByPlatformMap[platform] = { platform, amount: 0, count: 0 };
      salesByPlatformMap[platform].amount += revenue;
      salesByPlatformMap[platform].count += group.entries.length;

      const soldYear = soldDate.getFullYear();
      const soldMonth = soldDate.getMonth() + 1;
      const diffM = (thisYear - soldYear) * 12 + (thisMonth - soldMonth);
      if (diffM >= 0 && diffM < 24) {
        const key = `${soldYear}-${String(soldMonth).padStart(2, '0')}`;
        salesByMonthMap[key] = (salesByMonthMap[key] ?? 0) + revenue;
      }
    }

    const salesByMonth = byMonth.map((m) => ({
      month: m.month,
      amount: Math.round((salesByMonthMap[m.month] ?? 0) * 100) / 100,
    }));

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
      totalOtherFees: Math.round((totalFees - totalShippingFees - totalTax) * 100) / 100,
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
      topSalePrice: top10SalePrice,
      topProfit: top10Profit,
      topLoss: top10Loss,
      totalSalesRevenue: Math.round(totalSalesRevenue * 100) / 100,
      totalSalesProfit: null,
      totalBooksSold,
      salesByPlatform: Object.values(salesByPlatformMap)
        .map((p) => ({ ...p, amount: Math.round(p.amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount),
      salesByMonth,
    };
  }
}

