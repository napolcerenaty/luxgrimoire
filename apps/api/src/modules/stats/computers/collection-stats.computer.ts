import { Injectable } from '@nestjs/common';
import { StatsComputer, StatsComputeResult } from '../stats.computer';
import type { LightStatsContext, StatsContext } from '../stats.context';

@Injectable()
export class CollectionStatsComputer extends StatsComputer {
  readonly key = 'collection';
  readonly version = 7;

  async compute(ctx: StatsContext | LightStatsContext): Promise<StatsComputeResult> {
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
    let dnfCount = 0;

    const readingBySubMap: Record<string, { name: string; slug: string; read: number; reading: number; unread: number; dnf: number }> = {};
    const readingByCompanyMap: Record<string, { name: string; slug: string; read: number; reading: number; unread: number; dnf: number; primaryColor: string | null }> = {};

    let unreadShelfValue = 0;
    let preorderValue = 0;
    let shippingValue = 0;

    let acqSubscription = 0;
    let acqDirect = 0;
    let acqUnknown = 0;
    let firstHandCount = 0;
    let secondHandCount = 0;

    const bySubAllMap: Record<string, { name: string; slug: string; books: number }> = {};
    const byCompanyAllMap: Record<string, { name: string; slug: string; books: number; primaryColor: string | null }> = {};

    for (const entry of entries) {
      const status = entry.ownershipStatus;

      // Exclude sold/gifted from collection and reading stats
      if (status === 'SOLD' || status === 'GIFTED_AWAY') {
        if (status === 'SOLD') soldCount++;
        continue;
      }

      totalBooks++;

      if (status === 'OWNED') ownedCount++;
      else if (status === 'PREORDER') preorderCount++;
      else if (status === 'SHIPPING') shippingCount++;
      else if (status === 'TO_SELL') toSellCount++;
      if (entry.isWishlist) wishlistCount++;

      if (entry.signatureType) signedCount++;

      const readingStatus = entry.readingStatus;
      if (status === 'OWNED' && readingStatus === 'UNREAD') unreadCount++;
      else if (readingStatus === 'READ') readCount++;
      else if (readingStatus === 'READING') readingCount++;
      else if (readingStatus === 'DNF') dnfCount++;

      const sub = entry.subscriptionEntry?.subscription ?? null;
      const company = entry.edition?.bookBoxCompany ?? sub?.company ?? null;

      if (sub) {
        if (!readingBySubMap[sub.slug]) readingBySubMap[sub.slug] = { name: sub.name, slug: sub.slug, read: 0, reading: 0, unread: 0, dnf: 0 };
        if (readingStatus === 'READ') readingBySubMap[sub.slug].read++;
        else if (readingStatus === 'READING') readingBySubMap[sub.slug].reading++;
        else if (readingStatus === 'DNF') readingBySubMap[sub.slug].dnf++;
        else readingBySubMap[sub.slug].unread++;

        acqSubscription++;
        if (!bySubAllMap[sub.slug]) bySubAllMap[sub.slug] = { name: sub.name, slug: sub.slug, books: 0 };
        bySubAllMap[sub.slug].books++;
      } else if (entry.purchaseGroup) {
        acqDirect++;
      } else {
        acqUnknown++;
      }
      if (company) {
        if (!readingByCompanyMap[company.id]) readingByCompanyMap[company.id] = { name: company.name, slug: company.slug, read: 0, reading: 0, unread: 0, dnf: 0, primaryColor: company.brandColors?.[0] ?? null };
        if (readingStatus === 'READ') readingByCompanyMap[company.id].read++;
        else if (readingStatus === 'READING') readingByCompanyMap[company.id].reading++;
        else if (readingStatus === 'DNF') readingByCompanyMap[company.id].dnf++;
        else readingByCompanyMap[company.id].unread++;

        if (!byCompanyAllMap[company.id]) byCompanyAllMap[company.id] = { name: company.name, slug: company.slug, books: 0, primaryColor: company.brandColors?.[0] ?? null };
        byCompanyAllMap[company.id].books++;
      }

      const group = entry.purchaseGroup;
      if (group) {
        if (group.isSecondHand) secondHandCount++;
        else firstHandCount++;

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
      dnfCount,
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
      readingBySubscription: Object.values(readingBySubMap).sort((a, b) => (b.read + b.reading) - (a.read + a.reading)),
      readingByCompany: Object.values(readingByCompanyMap).sort((a, b) => (b.read + b.reading) - (a.read + a.reading)),
    };
  }
}
