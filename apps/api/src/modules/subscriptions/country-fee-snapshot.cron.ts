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

    const entries = await this.prisma.userSubscriptionEntry.findMany({
      where: {
        subscriptionId,
        active: true,
        OR: [
          { shippingCountry: countryUpper },
          { shippingCountry: null, user: { shippingCountry: countryUpper } },
        ],
      },
      select: {
        shippingCost: true,
        costCurrency: true,
        feeTemplates: {
          select: {
            customAmount: true,
            customCurrency: true,
            feeTemplate: {
              select: { category: true, defaultAmount: true, defaultCurrency: true },
            },
          },
        },
      },
    });

    if (!entries.length) return [];

    const shippingAmounts: number[] = [];
    let shippingCurrency: string | null = null;
    let shippingMixed = false;

    for (const entry of entries) {
      if (entry.shippingCost != null) {
        const cur = entry.costCurrency ?? null;
        shippingAmounts.push(Number(entry.shippingCost));
        if (shippingCurrency === null) shippingCurrency = cur;
        else if (shippingCurrency !== cur) shippingMixed = true;
      }
    }
    if (shippingMixed) shippingCurrency = null;

    const byCategory = new Map<string, { count: number; amounts: number[]; currency: string | null }>();
    for (const entry of entries) {
      for (const link of entry.feeTemplates) {
        const cat = link.feeTemplate.category as string;
        const amt = link.customAmount ?? link.feeTemplate.defaultAmount;
        const cur = link.customCurrency ?? link.feeTemplate.defaultCurrency;
        if (!byCategory.has(cat)) byCategory.set(cat, { count: 0, amounts: [], currency: cur });
        const agg = byCategory.get(cat)!;
        agg.count++;
        if (amt != null) agg.amounts.push(Number(amt));
        if (agg.currency !== cur) agg.currency = null;
      }
    }

    const totalEntries = entries.length;
    const avgShipping =
      shippingAmounts.length > 0
        ? shippingAmounts.reduce((a, b) => a + b, 0) / shippingAmounts.length
        : null;

    const data: CountryFeeHint[] = Array.from(byCategory.entries()).map(([category, agg]) => ({
      category,
      count: agg.count,
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
