import { Injectable } from '@nestjs/common';
import { StatsComputer, StatsComputeResult } from '../stats.computer';
import type { StatsContext } from '../stats.context';

@Injectable()
export class CollectionStatsComputer extends StatsComputer {
  readonly key = 'collection';
  readonly version = 3;

  async compute(ctx: StatsContext): Promise<StatsComputeResult> {
    const { entries, convert } = ctx;

    const toNum = (v: { toNumber: () => number } | number | null | undefined): number => {
      if (v == null) return 0;
      return typeof v === 'object' ? v.toNumber() : Number(v);
    };

    let totalBooks = 0;
    let ownedCount = 0;
    let preorderCount = 0;
    let shippingCount = 0;
    let soldCount = 0;
    let toSellCount = 0;
    let wishlistCount = 0;
    let signedCount = 0;
    let unreadCount = 0;
    let readCount = 0;
    let readingCount = 0;

    let unreadShelfValue = 0;
    let preorderValue = 0;
    let shippingValue = 0;

    let acqSubscription = 0;
    let acqDirect = 0;
    let acqUnknown = 0;
    let firstHandCount = 0;
    let secondHandCount = 0;

    const bySubAllMap: Record<string, { name: string; slug: string; books: number }> = {};
    const byCompanyAllMap: Record<string, { name: string; slug: string; books: number }> = {};

    for (const entry of entries) {
      totalBooks++;

      const status = entry.ownershipStatus;
      if (status === 'OWNED') ownedCount++;
      else if (status === 'PREORDER') preorderCount++;
      else if (status === 'SHIPPING') shippingCount++;
      else if (status === 'SOLD') soldCount++;
      else if (status === 'TO_SELL') toSellCount++;
      if (entry.isWishlist) wishlistCount++;

      if (entry.signatureType) signedCount++;

      const readingStatus = entry.readingStatus;
      if (status === 'OWNED' && readingStatus === 'UNREAD') unreadCount++;
      else if (readingStatus === 'READ') readCount++;
      else if (readingStatus === 'READING') readingCount++;

      if (entry.subscriptionEntry?.subscription) {
        acqSubscription++;
        const sub = entry.subscriptionEntry.subscription;
        if (!bySubAllMap[sub.slug]) bySubAllMap[sub.slug] = { name: sub.name, slug: sub.slug, books: 0 };
        bySubAllMap[sub.slug].books++;
      } else if (entry.purchaseGroup) {
        acqDirect++;
      } else {
        acqUnknown++;
      }

      if (entry.purchaseGroup) {
        if (entry.purchaseGroup.isSecondHand) secondHandCount++;
        else firstHandCount++;
      }

      const company = entry.edition?.bookBoxCompany ?? entry.subscriptionEntry?.subscription?.company ?? null;
      if (company) {
        if (!byCompanyAllMap[company.id]) {
          byCompanyAllMap[company.id] = { name: company.name, slug: company.slug, books: 0 };
        }
        byCompanyAllMap[company.id].books++;
      }

      const group = entry.purchaseGroup;
      if (group) {
        const date = new Date(group.purchasedAt);
        const entryCount = group.bookEntries.length || 1;
        const basePerEntry = toNum(group.totalAmount) / entryCount;
        const shippingPerEntry = group.shippingAmount ? toNum(group.shippingAmount) / entryCount : 0;
        const entryValue = await convert(basePerEntry + shippingPerEntry, group.currency, date);

        if (status === 'OWNED' && entry.readingStatus === 'UNREAD') {
          unreadShelfValue += entryValue;
        }
        if (status === 'PREORDER') {
          preorderValue += entryValue;
        }
        if (status === 'SHIPPING') {
          shippingValue += entryValue;
        }
      }
    }

    const r = (v: number) => Math.round(v * 100) / 100;

    return {
      totalBooks,
      ownedCount,
      preorderCount,
      shippingCount,
      soldCount,
      toSellCount,
      wishlistCount,
      signedCount,
      signedPercent: totalBooks > 0 ? Math.round((signedCount / totalBooks) * 1000) / 10 : 0,
      unreadCount,
      readCount,
      readingCount,
      unreadPercent: ownedCount > 0 ? Math.round((unreadCount / ownedCount) * 1000) / 10 : 0,
      unreadShelfValue: r(unreadShelfValue),
      preorderValue: r(preorderValue),
      shippingValue: r(shippingValue),
      acquisitionBreakdown: {
        subscription: acqSubscription,
        direct: acqDirect,
        unknown: acqUnknown,
      },
      firstHandCount,
      secondHandCount,
      bySubscriptionAll: Object.values(bySubAllMap).sort((a, b) => b.books - a.books),
      byCompanyAll: Object.values(byCompanyAllMap).sort((a, b) => b.books - a.books),
    };
  }
}
