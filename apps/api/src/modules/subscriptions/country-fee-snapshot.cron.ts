import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CountryFeeHint } from './subscriptions.service';

@Injectable()
export class CountryFeeSnapshotCronService {
  private readonly logger = new Logger(CountryFeeSnapshotCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Runs every Monday at 04:00 UTC as a safety net */
  @Cron('0 4 * * 1', { name: 'country-fee-snapshot-refresh' })
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
    const rows = await this.prisma.$queryRaw<Array<{ subscriptionId: string; country: string }>>`
      SELECT DISTINCT
        e."subscriptionId",
        COALESCE(e."shippingCountry", u."shippingCountry") AS country
      FROM user_subscription_entries e
      JOIN users u ON e."userId" = u.id
      WHERE e.active = true
        AND e."isForwarding" = false
        AND COALESCE(e."shippingCountry", u."shippingCountry") IS NOT NULL
    `;

    this.logger.log(`[CountryFeeSnapshot] Recalculating ${rows.length} subscription×country pairs`);

    for (const { subscriptionId, country } of rows) {
      try {
        await this.refreshSnapshot(subscriptionId, country);
      } catch (err) {
        this.logger.warn(`[CountryFeeSnapshot] Failed for ${subscriptionId}/${country}: ${err}`);
      }
    }
  }

  /** Recompute and persist snapshot for a subscription+country pair. */
  async refreshSnapshot(subscriptionId: string, country: string): Promise<void> {
    const data = await this.computeForSubscriptionAndCountry(subscriptionId, country);
    await this.prisma.subscriptionCountryFeeSnapshot.upsert({
      where: { subscriptionId_country: { subscriptionId, country: country.toUpperCase() } },
      create: { subscriptionId, country: country.toUpperCase(), data: data as unknown as object[], calculatedAt: new Date() },
      update: { data: data as unknown as object[], calculatedAt: new Date() },
    });
  }

  /**
   * Refresh snapshot for a specific subscription entry (called when isForwarding changes).
   * Looks up the country from the entry or its user, then refreshes the snapshot.
   */
  async refreshSnapshotForEntry(entryId: string): Promise<void> {
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { id: entryId },
      select: {
        subscriptionId: true,
        shippingCountry: true,
        user: { select: { shippingCountry: true } },
      },
    });
    if (!entry) return;
    const country = entry.shippingCountry ?? entry.user?.shippingCountry;
    if (!country) return;
    await this.refreshSnapshot(entry.subscriptionId, country);
  }

  /**
   * Single source of truth: purchase groups (last 35 days) → fallback to current entry settings.
   */
  async computeForSubscriptionAndCountry(
    subscriptionId: string,
    country: string,
  ): Promise<CountryFeeHint[]> {
    const data = await this.computeFromPurchaseGroups(subscriptionId, country);
    if (data.length > 0) return data;
    return this.computeFromEntrySettings(subscriptionId, country);
  }

  private async computeFromPurchaseGroups(
    subscriptionId: string,
    country: string,
  ): Promise<CountryFeeHint[]> {
    const countryUpper = country.toUpperCase();
    const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

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
        subscriptionEntry: { select: { prepaidMonths: true } },
        fees: { select: { category: true, amount: true, currency: true } },
      },
    });

    if (!groups.length) return [];

    const totalEntries = new Set(groups.map(g => g.subscriptionEntryId)).size;

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

    const avgShipping = shippingAmounts.length > 0
      ? shippingAmounts.reduce((a, b) => a + b, 0) / shippingAmounts.length
      : null;

    const data: CountryFeeHint[] = Array.from(byCategory.entries()).map(([category, agg]) => ({
      category,
      count: agg.entryIds.size,
      totalSubscribers: totalEntries,
      avgAmount: agg.amounts.length > 0 ? agg.amounts.reduce((a, b) => a + b, 0) / agg.amounts.length : null,
      currency: agg.currency,
      avgShipping,
      shippingCurrency,
      shippingCount: shippingAmounts.length,
    }));

    const hasShippingCat = data.some(d => d.category === 'SHIPPING');
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

  /** Fallback: aggregate from current active entry settings (used when no purchase groups yet). */
  private async computeFromEntrySettings(
    subscriptionId: string,
    country: string,
  ): Promise<CountryFeeHint[]> {
    const countryUpper = country.toUpperCase();

    const entries = await this.prisma.userSubscriptionEntry.findMany({
      where: {
        subscriptionId,
        active: true,
        isForwarding: false,
        OR: [
          { shippingCountry: countryUpper },
          { shippingCountry: null, user: { shippingCountry: countryUpper } },
        ],
      },
      select: {
        id: true,
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
    const avgShipping = shippingAmounts.length > 0
      ? shippingAmounts.reduce((a, b) => a + b, 0) / shippingAmounts.length
      : null;

    const data: CountryFeeHint[] = Array.from(byCategory.entries()).map(([category, agg]) => ({
      category,
      count: agg.count,
      totalSubscribers: totalEntries,
      avgAmount: agg.amounts.length > 0 ? agg.amounts.reduce((a, b) => a + b, 0) / agg.amounts.length : null,
      currency: agg.currency,
      avgShipping,
      shippingCurrency,
      shippingCount: shippingAmounts.length,
    }));

    const hasShippingCat = data.some(d => d.category === 'SHIPPING');
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
