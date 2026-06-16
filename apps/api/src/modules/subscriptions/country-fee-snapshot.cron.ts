import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CountryFeeHint } from './subscriptions.service';

@Injectable()
export class CountryFeeSnapshotCronService {
  private readonly logger = new Logger(CountryFeeSnapshotCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Runs every 3 days at 04:00 UTC */
  @Cron('0 4 */3 * *', { name: 'country-fee-snapshot-refresh' })
  async refreshAll(): Promise<void> {
    this.logger.log('[CountryFeeSnapshot] Starting full refresh');
    try {
      await this.recalculateAll();
      this.logger.log('[CountryFeeSnapshot] Full refresh complete');
    } catch (err) {
      this.logger.error('[CountryFeeSnapshot] Refresh failed', err);
    }
  }

  async recalculateAll(): Promise<void> {
    // Find all (subscriptionId, country) combos with at least 1 active subscriber
    const rows = await this.prisma.$queryRaw<Array<{ subscriptionId: string; country: string }>>`
      SELECT DISTINCT
        e."subscriptionId",
        COALESCE(e."shippingCountry", u."shippingCountry") AS country
      FROM user_subscription_entries e
      JOIN users u ON e."userId" = u.id
      WHERE e.active = true
        AND COALESCE(e."shippingCountry", u."shippingCountry") IS NOT NULL
    `;

    this.logger.log(`[CountryFeeSnapshot] Recalculating ${rows.length} subscription×country pairs`);

    for (const { subscriptionId, country } of rows) {
      try {
        const data = await this.computeForSubscriptionAndCountry(subscriptionId, country);
        await this.prisma.subscriptionCountryFeeSnapshot.upsert({
          where: { subscriptionId_country: { subscriptionId, country } },
          create: { subscriptionId, country, data: data as unknown as object[], calculatedAt: new Date() },
          update: { data: data as unknown as object[], calculatedAt: new Date() },
        });
      } catch (err) {
        this.logger.warn(`[CountryFeeSnapshot] Failed for ${subscriptionId}/${country}: ${err}`);
      }
    }
  }

  async computeForSubscriptionAndCountry(
    subscriptionId: string,
    country: string,
  ): Promise<CountryFeeHint[]> {
    const countryUpper = country.toUpperCase();
    const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

    // Query actual purchase groups from the last 35 days instead of current entry settings.
    // This ensures stats reflect what subscribers actually paid, not current (potentially outdated) entry settings.
    const groups = await this.prisma.userPurchaseGroup.findMany({
      where: {
        fromSubscription: true,
        purchasedAt: { gte: cutoff },
        subscriptionEntry: {
          subscriptionId,
          isForwarding: false,
          OR: [
            { shippingCountry: countryUpper },
            { shippingCountry: null, user: { shippingCountry: countryUpper } },
          ],
        },
      },
      select: {
        id: true,
        shippingAmount: true,
        currency: true,
        subscriptionEntryId: true,
        subscriptionEntry: {
          select: { prepaidMonths: true },
        },
        fees: {
          select: { category: true, amount: true, currency: true },
        },
      },
    });

    if (!groups.length) return [];

    // Total unique subscribers who had a renewal in this period
    const totalEntries = new Set(groups.map(g => g.subscriptionEntryId)).size;

    // Aggregate shipping from actual purchase groups
    const shippingAmounts: number[] = [];
    let shippingCurrency: string | null = null;
    let shippingMixed = false;

    for (const g of groups) {
      const prepaidMonths = g.subscriptionEntry?.prepaidMonths ?? 1;
      const amt = g.shippingAmount != null ? Number(g.shippingAmount) : null;
      if (amt != null && amt > 0) {
        shippingAmounts.push(amt / prepaidMonths);
        const cur = g.currency ?? null;
        if (shippingCurrency === null) shippingCurrency = cur;
        else if (shippingCurrency !== cur) shippingMixed = true;
      }
    }
    if (shippingMixed) shippingCurrency = null;

    // Aggregate fees by category from actual purchase fees
    const byCategory = new Map<string, { entryIds: Set<string>; amounts: number[]; currency: string | null }>();
    for (const g of groups) {
      for (const fee of g.fees) {
        const cat = fee.category as string;
        if (!byCategory.has(cat)) byCategory.set(cat, { entryIds: new Set(), amounts: [], currency: fee.currency });
        const agg = byCategory.get(cat)!;
        agg.entryIds.add(g.subscriptionEntryId ?? '');
        const prepaidMonths = g.subscriptionEntry?.prepaidMonths ?? 1;
        if (fee.amount != null) agg.amounts.push(Number(fee.amount) / prepaidMonths);
        if (agg.currency !== fee.currency) agg.currency = null;
      }
    }

    const avgShipping =
      shippingAmounts.length > 0
        ? shippingAmounts.reduce((a, b) => a + b, 0) / shippingAmounts.length
        : null;

    const data: CountryFeeHint[] = Array.from(byCategory.entries()).map(([category, agg]) => ({
      category,
      count: agg.entryIds.size,
      totalSubscribers: totalEntries,
      avgAmount:
        agg.amounts.length > 0 ? agg.amounts.reduce((a, b) => a + b, 0) / agg.amounts.length : null,
      currency: agg.currency,
      avgShipping,
      shippingCurrency,
      shippingCount: shippingAmounts.length,
    }));

    const hasShippingCat = data.some((d) => d.category === 'SHIPPING');
    if (!hasShippingCat && avgShipping !== null) {
      data.push({
        category: '__shipping__',
        count: shippingAmounts.length,
        totalSubscribers: totalEntries,
        avgAmount: avgShipping,
        currency: shippingCurrency,
        avgShipping,
        shippingCurrency,
        shippingCount: shippingAmounts.length,
      });
    }

    data.sort((a, b) => b.count - a.count);
    return data;
  }
}
