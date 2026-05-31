import { Injectable } from '@nestjs/common';
import { StatsComputer, StatsComputeResult } from '../stats.computer';
import type { StatsContext } from '../stats.context';

@Injectable()
export class SpendingStatsComputer extends StatsComputer {
  readonly key = 'spending';
  readonly version = 4;

  async compute(ctx: StatsContext): Promise<StatsComputeResult> {
    const { entries, saleGroups, convert, now } = ctx;
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth() + 1;

    const toNum = (v: { toNumber: () => number } | number | null | undefined): number => {
      if (v == null) return 0;
      return typeof v === 'object' ? v.toNumber() : Number(v);
    };

    let totalAllTime = 0;
    let totalThisYear = 0;
    let totalThisMonth = 0;
    let booksWithCost = 0;
    let booksThisYear = 0;
    let booksThisMonth = 0;
    let totalDiscounts = 0;
    let totalRefunds = 0;
    let totalFees = 0;
    let totalShippingFees = 0;
    let totalBasePrice = 0;
    let totalShipping = 0;
    let totalTax = 0;

    const r = (v: number) => Math.round(v * 100) / 100;

    const byYearMap: Record<number, number> = {};
    const byYearBooksMap: Record<number, number> = {};
    const byMonthMap: Record<string, number> = {};
    const byMonthBooksMap: Record<string, number> = {};
    const bySubMap: Record<string, { name: string; slug: string; amount: number; books: number }> = {};
    const byCompanyMap: Record<string, { name: string; slug: string; amount: number; books: number; primaryColor: string | null }> = {};
    const topExpensive: Array<{ title: string; author: string; amount: number; currency: string; date: string; editionSlug: string | null }> = [];
    const topSalePrice: Array<{ title: string; author: string; amount: number; currency: string; date: string; editionSlug: string | null }> = [];
    const topProfit: Array<{ title: string; author: string; amount: number; currency: string; cost: number; date: string; editionSlug: string | null }> = [];
    const topLoss: Array<{ title: string; author: string; amount: number; currency: string; cost: number; date: string; editionSlug: string | null }> = [];
    const plByMonthMap: Record<string, number> = {};
    const plByCompanyMap: Record<string, { name: string; slug: string; pl: number; revenue: number; cost: number; count: number; primaryColor: string | null }> = {};
    const salesWithROI: Array<{ title: string; author: string; roi: number; holdDays: number; pl: number; editionSlug: string | null }> = [];

    for (const entry of entries) {
      const group = entry.purchaseGroup;
      if (!group) continue;

      const purchaseCurrency = group.currency;
      const date = new Date(group.purchasedAt);
      const entryYear = date.getFullYear();
      const entryMonth = date.getMonth() + 1;
      const entryCount = group.bookEntries.length || 1;
      const monthKey = `${entryYear}-${String(entryMonth).padStart(2, '0')}`;

      byYearBooksMap[entryYear] = (byYearBooksMap[entryYear] ?? 0) + 1;
      byMonthBooksMap[monthKey] = (byMonthBooksMap[monthKey] ?? 0) + 1;
      if (entryYear === thisYear) booksThisYear++;
      if (entryYear === thisYear && entryMonth === thisMonth) booksThisMonth++;

      const basePerEntry = toNum(group.totalAmount) / entryCount;
      const shippingPerEntry = group.shippingAmount ? toNum(group.shippingAmount) / entryCount : 0;
      const baseConverted = await convert(basePerEntry, purchaseCurrency, date);
      const shippingConverted = await convert(shippingPerEntry, purchaseCurrency, date);

      let feesPerEntry = 0;
      let shippingFeesPerEntry = 0;
      let taxFeesPerEntry = 0;
      for (const fee of group.fees) {
        const amt = (await convert(toNum(fee.amount), fee.currency, new Date(fee.date))) / entryCount;
        feesPerEntry += amt;
        if (fee.category === 'SHIPPING' || fee.category === 'FORWARDING') shippingFeesPerEntry += amt;
        else if (fee.category === 'VAT' || fee.category === 'CUSTOMS') taxFeesPerEntry += amt;
      }

      let discountsPerEntry = 0;
      for (const disc of group.discounts) {
        discountsPerEntry += (await convert(toNum(disc.amount), disc.currency, new Date(disc.date))) / entryCount;
      }

      let refundsPerEntry = 0;
      for (const ref of group.refunds) {
        refundsPerEntry += (await convert(toNum(ref.amount), ref.currency, new Date(ref.date))) / entryCount;
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
      byMonthMap[monthKey] = (byMonthMap[monthKey] ?? 0) + entryTotal;

      if (entry.subscriptionEntry?.subscription) {
        const sub = entry.subscriptionEntry.subscription;
        if (!bySubMap[sub.slug]) {
          bySubMap[sub.slug] = { name: sub.name, slug: sub.slug, amount: 0, books: 0 };
        }
        bySubMap[sub.slug].amount += entryTotal;
        bySubMap[sub.slug].books++;
      }

      const company = entry.edition?.bookBoxCompany ?? entry.subscriptionEntry?.subscription?.company ?? null;
      if (company) {
        if (!byCompanyMap[company.id]) {
          byCompanyMap[company.id] = { name: company.name, slug: company.slug, amount: 0, books: 0, primaryColor: company.brandColors?.[0] ?? null };
        }
        byCompanyMap[company.id].amount += entryTotal;
        byCompanyMap[company.id].books++;
      }

      const bookTitle = entry.edition?.book?.title ?? 'Unknown';
      const bookAuthor = entry.edition?.book?.authors?.[0]?.author?.name ?? '';
      const editionSlug = entry.edition?.slug ?? null;
      const dateStr = date.toISOString().slice(0, 10);

      topExpensive.push({ title: bookTitle, author: bookAuthor, amount: entryTotal, currency: ctx.currency, date: dateStr, editionSlug });

      if (entry.salePrice) {
        const saleDate = entry.saleDate ? new Date(entry.saleDate) : date;
        const salePriceNum = toNum(entry.salePrice);
        const saleCur = entry.saleCurrency ?? purchaseCurrency;
        const salePriceConverted = await convert(salePriceNum, saleCur, saleDate);
        const pl = salePriceConverted - entryTotal;
        const roi = entryTotal > 0 ? (pl / entryTotal) * 100 : 0;
        const holdDays = Math.round((saleDate.getTime() - date.getTime()) / 86_400_000);
        const saleDateStr = saleDate.toISOString().slice(0, 10);
        const saleMonthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;

        topSalePrice.push({ title: bookTitle, author: bookAuthor, amount: salePriceConverted, currency: ctx.currency, date: saleDateStr, editionSlug });
        if (pl >= 0) {
          topProfit.push({ title: bookTitle, author: bookAuthor, amount: pl, currency: ctx.currency, cost: entryTotal, date: saleDateStr, editionSlug });
        } else {
          topLoss.push({ title: bookTitle, author: bookAuthor, amount: pl, currency: ctx.currency, cost: entryTotal, date: saleDateStr, editionSlug });
        }

        plByMonthMap[saleMonthKey] = (plByMonthMap[saleMonthKey] ?? 0) + pl;

        const company = entry.edition?.bookBoxCompany ?? entry.subscriptionEntry?.subscription?.company ?? null;
        if (company) {
          if (!plByCompanyMap[company.id]) {
            plByCompanyMap[company.id] = { name: company.name, slug: company.slug, pl: 0, revenue: 0, cost: 0, count: 0, primaryColor: company.brandColors?.[0] ?? null };
          }
          plByCompanyMap[company.id].pl += pl;
          plByCompanyMap[company.id].revenue += salePriceConverted;
          plByCompanyMap[company.id].cost += entryTotal;
          plByCompanyMap[company.id].count++;
        }

        salesWithROI.push({ title: bookTitle, author: bookAuthor, roi: Math.round(roi * 10) / 10, holdDays: Math.max(holdDays, 0), pl: r(pl), editionSlug });
      }
    }

    let totalSalesRevenue = 0;
    let totalBooksSold = 0;
    const salesByPlatformMap: Record<string, { platform: string; amount: number; count: number }> = {};
    const salesByMonthMap: Record<string, number> = {};
    const salesByMonthCountMap: Record<string, number> = {};
    const salesByYearMap: Record<number, number> = {};
    const salesByYearCountMap: Record<number, number> = {};
    const salesByCompanyMap: Record<string, { name: string; slug: string; amount: number; count: number; primaryColor: string | null }> = {};

    for (const group of saleGroups) {
      const soldDate = new Date(group.soldAt);
      const revenue = await convert(toNum(group.totalAmount), group.currency, soldDate);
      totalSalesRevenue += revenue;
      totalBooksSold += group.entries.length;
      const platform = group.platform || 'other';
      if (!salesByPlatformMap[platform]) salesByPlatformMap[platform] = { platform, amount: 0, count: 0 };
      salesByPlatformMap[platform].amount += revenue;
      salesByPlatformMap[platform].count += group.entries.length;

      for (const saleEntry of group.entries) {
        const entryRevenue = await convert(toNum(saleEntry.allocatedAmount), group.currency, soldDate);
        const userBookEntry = saleEntry.userBookEntry;
        const company = userBookEntry?.edition?.bookBoxCompany ?? userBookEntry?.subscriptionEntry?.subscription?.company ?? null;
        if (company) {
          if (!salesByCompanyMap[company.id]) {
            salesByCompanyMap[company.id] = { name: company.name, slug: company.slug, amount: 0, count: 0, primaryColor: company.brandColors?.[0] ?? null };
          }
          salesByCompanyMap[company.id].amount += entryRevenue;
          salesByCompanyMap[company.id].count++;
        }
      }

      const soldYear = soldDate.getFullYear();
      const soldMonth = soldDate.getMonth() + 1;
      const monthKey = `${soldYear}-${String(soldMonth).padStart(2, '0')}`;
      salesByMonthMap[monthKey] = (salesByMonthMap[monthKey] ?? 0) + revenue;
      salesByMonthCountMap[monthKey] = (salesByMonthCountMap[monthKey] ?? 0) + group.entries.length;
      salesByYearMap[soldYear] = (salesByYearMap[soldYear] ?? 0) + revenue;
      salesByYearCountMap[soldYear] = (salesByYearCountMap[soldYear] ?? 0) + group.entries.length;
    }

    topExpensive.sort((a, b) => b.amount - a.amount);
    topSalePrice.sort((a, b) => b.amount - a.amount);
    topProfit.sort((a, b) => b.amount - a.amount);
    topLoss.sort((a, b) => a.amount - b.amount);

    const allMonthKeys = new Set([...Object.keys(byMonthMap), ...Object.keys(byMonthBooksMap), ...Object.keys(salesByMonthMap)]);
    const sortedMonthKeys = Array.from(allMonthKeys).sort();

    const byMonth = sortedMonthKeys.map((month) => ({ month, amount: r(byMonthMap[month] ?? 0) }));
    const byMonthBooks = sortedMonthKeys.map((month) => ({ month, count: byMonthBooksMap[month] ?? 0 }));
    const salesByMonth = sortedMonthKeys.map((month) => ({ month, amount: r(salesByMonthMap[month] ?? 0) }));
    const salesByMonthCount = sortedMonthKeys.map((month) => ({ month, count: salesByMonthCountMap[month] ?? 0 }));

    return {
      currency: ctx.currency,
      totalAllTime: r(totalAllTime),
      totalThisYear: r(totalThisYear),
      totalThisMonth: r(totalThisMonth),
      avgCostPerBook: booksWithCost > 0 ? r(totalAllTime / booksWithCost) : 0,
      booksWithCost,
      booksThisYear,
      booksThisMonth,
      totalBasePrice: r(totalBasePrice),
      totalShipping: r(totalShipping),
      totalTax: r(totalTax),
      totalOtherFees: r(totalFees - totalShippingFees - totalTax),
      totalDiscounts: r(totalDiscounts),
      totalRefunds: r(totalRefunds),
      byYear: Object.entries(byYearMap)
        .map(([year, amount]) => ({ year: Number(year), amount: r(amount) }))
        .sort((a, b) => a.year - b.year),
      byYearBooks: Object.entries(byYearBooksMap)
        .map(([year, count]) => ({ year: Number(year), count }))
        .sort((a, b) => a.year - b.year),
      byMonth,
      byMonthBooks,
      bySubscription: Object.values(bySubMap)
        .map((sub) => ({ ...sub, amount: r(sub.amount) }))
        .sort((a, b) => b.amount - a.amount),
      byCompany: Object.values(byCompanyMap)
        .map((company) => ({ ...company, amount: r(company.amount) }))
        .sort((a, b) => b.amount - a.amount),
      topExpensive: topExpensive.slice(0, 10),
      topSalePrice: topSalePrice.slice(0, 10),
      topProfit: topProfit.slice(0, 10),
      topLoss: topLoss.slice(0, 10),
      totalSalesRevenue: r(totalSalesRevenue),
      totalSalesProfit: null,
      totalBooksSold,
      salesByPlatform: Object.values(salesByPlatformMap)
        .map((platform) => ({ ...platform, amount: r(platform.amount) }))
        .sort((a, b) => b.amount - a.amount),
      salesByCompany: Object.values(salesByCompanyMap)
        .map((company) => ({ ...company, amount: r(company.amount) }))
        .sort((a, b) => b.amount - a.amount),
      salesByMonth,
      salesByMonthCount,
      salesByYear: Object.entries(salesByYearMap)
        .map(([year, amount]) => ({ year: Number(year), amount: r(amount) }))
        .sort((a, b) => a.year - b.year),
      salesByYearCount: Object.entries(salesByYearCountMap)
        .map(([year, count]) => ({ year: Number(year), count }))
        .sort((a, b) => a.year - b.year),
      plByMonth: Object.entries(plByMonthMap)
        .map(([month, pl]) => ({ month, pl: r(pl) }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      plByCompany: Object.values(plByCompanyMap)
        .map((c) => ({ ...c, pl: r(c.pl), revenue: r(c.revenue), cost: r(c.cost) }))
        .sort((a, b) => b.pl - a.pl),
      salesWithROI,
    };
  }
}
