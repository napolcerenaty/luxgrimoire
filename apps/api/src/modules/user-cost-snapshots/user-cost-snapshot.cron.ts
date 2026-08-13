import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

const WINDOW_TIERS_MONTHS = [6, 12, 24];
const MIN_SAMPLE = 2;
const NON_EXTRA_FEE_CATEGORIES = new Set(['SHIPPING', 'PRICE_ADJUSTMENT']);

interface PurchaseRecord {
  bookCount: number;
  shippingAmount: number | null;
  fees: Array<{ category: string; amount: number }>;
  currency: string | null;
  purchasedAt: string;
}

export interface CostPrediction {
  shipping: { amount: number; currency: string } | null;
  fees: Array<{ category: string; amount: number; currency: string }>;
  currency: string;
  sampleSize: number;
}

interface PurchaseGroupRow {
  shippingAmount: unknown;
  currency: string | null;
  purchasedAt: Date;
  bookEntries: { id: string }[];
  fees: { category: string; amount: unknown }[];
}

function subMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Per-user, per-company snapshot of expected shipping/fee costs on sale announcement
 * purchases — mirrors CountryFeeSnapshotCronService's shape (weekly cron + targeted
 * refresh-on-write), but keyed by userId+companyId and kept per-user (not a cross-user
 * aggregate), since this is the first step toward a future budget feature.
 *
 * Snapshot write time only resolves WHICH purchases qualify (tiered time window — try 6
 * months, widen to 12 then 24 if fewer than MIN_SAMPLE qualify, so an irregular sale cadence
 * doesn't starve the sample). Book-count matching happens at read time in predict/predictBatch
 * against the raw purchases[] list, so matching logic can change without a snapshot rebuild.
 */
@Injectable()
export class UserCostSnapshotCronService {
  private readonly logger = new Logger(UserCostSnapshotCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Runs every Monday at 05:00 UTC — offset from the 04:00 country-fee-snapshot job. */
  @Cron('0 5 * * 1', { name: 'user-cost-snapshot-refresh' })
  async refreshAll(): Promise<void> {
    this.logger.log('[UserCostSnapshot] Starting full refresh');
    try {
      await this.recalculateAll();
      this.logger.log('[UserCostSnapshot] Full refresh complete');
    } catch (err) {
      this.logger.error('[UserCostSnapshot] Refresh failed', err);
    }
  }

  async recalculateAll(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ userId: string; companyId: string }>>`
      SELECT DISTINCT upg."userId", sa."companyId"
      FROM user_purchase_groups upg
      JOIN sale_announcements sa ON upg."saleAnnouncementId" = sa.id
      WHERE upg."saleAnnouncementId" IS NOT NULL AND sa."companyId" IS NOT NULL
    `;
    this.logger.log(`[UserCostSnapshot] Recalculating ${rows.length} user×company pairs`);
    for (const { userId, companyId } of rows) {
      try {
        await this.refreshSnapshot(userId, companyId);
      } catch (err) {
        this.logger.warn(`[UserCostSnapshot] Failed for ${userId}/${companyId}: ${err}`);
      }
    }
  }

  /** Recompute and persist the snapshot for a user+company pair. */
  async refreshSnapshot(userId: string, companyId: string): Promise<void> {
    const { currency, purchases, sampleWindow } = await this.computeSnapshotData(userId, companyId);
    await this.prisma.userCompanyCostSnapshot.upsert({
      where: { userId_companyId: { userId, companyId } },
      create: { userId, companyId, currency, purchases: purchases as unknown as object[], sampleWindow },
      update: { currency, purchases: purchases as unknown as object[], sampleWindow },
    });
  }

  /**
   * Refresh triggered by a write to a UserPurchaseGroup/UserPurchaseFee for a specific sale —
   * resolves the sale's company internally so write-path callers don't need to look it up.
   * No-op when the group isn't linked to a sale announcement (out of scope for this feature).
   */
  async refreshSnapshotForSale(userId: string, saleAnnouncementId: string | null | undefined): Promise<void> {
    if (!saleAnnouncementId) return;
    const sale = await this.prisma.saleAnnouncement.findUnique({
      where: { id: saleAnnouncementId },
      select: { companyId: true },
    });
    if (!sale?.companyId) return;
    await this.refreshSnapshot(userId, sale.companyId);
  }

  /**
   * Same as refreshSnapshotForSale, but for callers (fees, discounts) that only know the
   * UserPurchaseGroup a change belongs to, not its sale announcement directly.
   */
  async refreshSnapshotForPurchaseGroup(userId: string, purchaseGroupId: string | null | undefined): Promise<void> {
    if (!purchaseGroupId) return;
    const group = await this.prisma.userPurchaseGroup.findUnique({
      where: { id: purchaseGroupId },
      select: { saleAnnouncementId: true },
    });
    await this.refreshSnapshotForSale(userId, group?.saleAnnouncementId);
  }

  private async computeSnapshotData(
    userId: string,
    companyId: string,
  ): Promise<{ currency: string | null; purchases: PurchaseRecord[]; sampleWindow: number }> {
    const now = new Date();
    const widestCutoff = subMonths(now, WINDOW_TIERS_MONTHS[WINDOW_TIERS_MONTHS.length - 1]);

    const groups = await this.prisma.userPurchaseGroup.findMany({
      where: {
        userId,
        saleAnnouncementId: { not: null },
        saleAnnouncement: { companyId },
        purchasedAt: { gte: widestCutoff },
      },
      select: {
        shippingAmount: true,
        currency: true,
        purchasedAt: true,
        bookEntries: { select: { id: true } },
        fees: { select: { category: true, amount: true } },
      },
      orderBy: { purchasedAt: 'desc' },
    });

    for (const months of WINDOW_TIERS_MONTHS) {
      const cutoff = subMonths(now, months);
      const within = groups.filter((g) => g.purchasedAt >= cutoff);
      if (within.length >= MIN_SAMPLE) {
        return this.buildSnapshotPayload(within, months);
      }
    }
    // No tier reached MIN_SAMPLE — store whatever fits in the widest window (0 or 1 rows).
    // predict()/matchSnapshot() gate on purchases.length below MIN_SAMPLE, so this stays inert.
    return this.buildSnapshotPayload(groups, WINDOW_TIERS_MONTHS[WINDOW_TIERS_MONTHS.length - 1]);
  }

  private buildSnapshotPayload(
    groups: PurchaseGroupRow[],
    sampleWindow: number,
  ): { currency: string | null; purchases: PurchaseRecord[]; sampleWindow: number } {
    const purchases = groups.map((g) => this.toPurchaseRecord(g));
    const currencies = new Set(purchases.map((p) => p.currency).filter((c): c is string => c != null));
    const currency = currencies.size === 1 ? [...currencies][0] : null;
    return { currency, purchases, sampleWindow };
  }

  private toPurchaseRecord(g: PurchaseGroupRow): PurchaseRecord {
    const bookCount = g.bookEntries.length;
    const num = (v: unknown): number => (typeof v === 'object' && v !== null && 'toNumber' in v ? (v as { toNumber(): number }).toNumber() : Number(v));

    const shippingFeeTotal = g.fees
      .filter((f) => f.category === 'SHIPPING')
      .reduce((sum, f) => sum + num(f.amount), 0);
    const hasShippingFee = g.fees.some((f) => f.category === 'SHIPPING');
    const shippingAmount = g.shippingAmount != null ? num(g.shippingAmount) : hasShippingFee ? shippingFeeTotal : null;

    const feesByCategory = new Map<string, number>();
    for (const f of g.fees) {
      if (NON_EXTRA_FEE_CATEGORIES.has(f.category)) continue;
      feesByCategory.set(f.category, (feesByCategory.get(f.category) ?? 0) + num(f.amount));
    }
    const fees = [...feesByCategory.entries()].map(([category, amount]) => ({ category, amount }));

    return {
      bookCount,
      shippingAmount,
      fees,
      currency: g.currency,
      purchasedAt: g.purchasedAt.toISOString(),
    };
  }

  /** Predict expected shipping/fees for a single company + book count. */
  async predict(userId: string, companyId: string, bookCount: number): Promise<CostPrediction | null> {
    const snapshot = await this.prisma.userCompanyCostSnapshot.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    return this.matchSnapshot(snapshot, bookCount);
  }

  /**
   * Batched version of predict() — one query for all distinct companies requested, matching
   * done in-memory per request. Callers that need predictions for several sales/interests at
   * once (e.g. the personal calendar) MUST use this instead of calling predict() in a loop,
   * to avoid re-introducing the N+1 this snapshot design exists to prevent.
   */
  async predictBatch(
    userId: string,
    requests: Array<{ companyId: string; bookCount: number }>,
  ): Promise<Map<string, CostPrediction | null>> {
    const companyIds = [...new Set(requests.map((r) => r.companyId))];
    const snapshots = companyIds.length
      ? await this.prisma.userCompanyCostSnapshot.findMany({ where: { userId, companyId: { in: companyIds } } })
      : [];
    const byCompany = new Map(snapshots.map((s) => [s.companyId, s]));

    const result = new Map<string, CostPrediction | null>();
    for (const req of requests) {
      result.set(`${req.companyId}:${req.bookCount}`, this.matchSnapshot(byCompany.get(req.companyId) ?? null, req.bookCount));
    }
    return result;
  }

  private matchSnapshot(
    snapshot: { currency: string | null; purchases: unknown } | null | undefined,
    bookCount: number,
  ): CostPrediction | null {
    if (!snapshot || snapshot.currency == null) return null;
    const purchases = snapshot.purchases as PurchaseRecord[];
    if (!Array.isArray(purchases) || purchases.length < MIN_SAMPLE) return null;

    const withDiff = purchases.map((p) => ({ p, diff: Math.abs(p.bookCount - bookCount) }));
    const minDiff = Math.min(...withDiff.map((x) => x.diff));
    const matched = withDiff.filter((x) => x.diff === minDiff).map((x) => x.p);

    const shippingValues = matched.map((p) => p.shippingAmount).filter((v): v is number => v != null);
    const shipping = shippingValues.length > 0 ? { amount: round2(avg(shippingValues)), currency: snapshot.currency } : null;

    const feeTotals = new Map<string, { sum: number; count: number }>();
    for (const p of matched) {
      for (const f of p.fees) {
        const agg = feeTotals.get(f.category) ?? { sum: 0, count: 0 };
        agg.sum += f.amount;
        agg.count += 1;
        feeTotals.set(f.category, agg);
      }
    }
    const fees = [...feeTotals.entries()].map(([category, { sum, count }]) => ({
      category,
      amount: round2(sum / count),
      currency: snapshot.currency as string,
    }));

    if (!shipping && fees.length === 0) return null;
    return { shipping, fees, currency: snapshot.currency, sampleSize: matched.length };
  }
}
