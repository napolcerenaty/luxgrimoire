/**
 * Unit tests for UserCostSnapshotCronService.
 *
 * Covers:
 * - refreshSnapshot: tiered time window selection (6mo -> 12mo -> 24mo), currency-mixing
 *   suppression, purchase-record shaping (bookCount, shipping fallback, fee category exclusion)
 * - predict: min sample gate, currency suppression, nearest-bookCount matching + averaging
 * - predictBatch: exactly one snapshot query regardless of request count/duplicates
 * - refreshSnapshotForSale / refreshSnapshotForPurchaseGroup: internal resolution + no-ops
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { UserCostSnapshotCronService } from './user-cost-snapshot.cron';

const FIXED_NOW = new Date('2026-08-13T12:00:00Z');
const USER_ID = 'user-1';
const COMPANY_ID = 'company-1';

function monthsAgo(months: number): Date {
  const d = new Date(FIXED_NOW);
  d.setMonth(d.getMonth() - months);
  return d;
}

function makeGroup(overrides: Record<string, unknown> = {}) {
  return {
    shippingAmount: '10.00',
    currency: 'USD',
    purchasedAt: monthsAgo(1),
    bookEntries: [{ id: 'be-1' }],
    fees: [] as Array<{ category: string; amount: string }>,
    ...overrides,
  };
}

describe('UserCostSnapshotCronService', () => {
  let service: UserCostSnapshotCronService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    prisma = mockDeep<PrismaService>();
    service = new UserCostSnapshotCronService(prisma);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── refreshSnapshot — tiered time window ──────────────────────────────────

  describe('refreshSnapshot — tiered window selection', () => {
    it('uses the 6-month tier when it already has >= 2 qualifying purchases', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makeGroup({ purchasedAt: monthsAgo(1) }),
        makeGroup({ purchasedAt: monthsAgo(2) }),
      ]);
      (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(USER_ID, COMPANY_ID);

      const call = (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mock.calls[0][0];
      expect(call.create.sampleWindow).toBe(6);
      expect(call.create.purchases).toHaveLength(2);
    });

    it('widens to the 12-month tier when the 6-month tier is under-sampled', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makeGroup({ purchasedAt: monthsAgo(2) }), // within 6mo
        makeGroup({ purchasedAt: monthsAgo(10) }), // within 12mo only
        makeGroup({ purchasedAt: monthsAgo(11) }), // within 12mo only
      ]);
      (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(USER_ID, COMPANY_ID);

      const call = (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mock.calls[0][0];
      expect(call.create.sampleWindow).toBe(12);
      expect(call.create.purchases).toHaveLength(3); // all three fall within 12mo
    });

    it('falls through to the widest (24-month) window even when still under-sampled', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makeGroup({ purchasedAt: monthsAgo(20) }),
      ]);
      (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(USER_ID, COMPANY_ID);

      const call = (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mock.calls[0][0];
      expect(call.create.sampleWindow).toBe(24);
      expect(call.create.purchases).toHaveLength(1);
    });

    it('issues exactly one purchase-group query regardless of which tier is ultimately used', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makeGroup({ purchasedAt: monthsAgo(20) }),
      ]);
      (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(USER_ID, COMPANY_ID);

      expect(prisma.userPurchaseGroup.findMany).toHaveBeenCalledTimes(1);
    });

    it('upserts even when there are zero qualifying purchases (clears a stale snapshot)', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(USER_ID, COMPANY_ID);

      const call = (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mock.calls[0][0];
      expect(call.create.purchases).toEqual([]);
      expect(call.create.currency).toBeNull();
    });
  });

  // ── refreshSnapshot — currency mixing ─────────────────────────────────────

  describe('refreshSnapshot — currency handling', () => {
    it('sets currency to null when qualifying purchases mix currencies', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makeGroup({ currency: 'USD' }),
        makeGroup({ currency: 'EUR' }),
      ]);
      (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(USER_ID, COMPANY_ID);

      const call = (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mock.calls[0][0];
      expect(call.create.currency).toBeNull();
    });

    it('keeps the shared currency when all qualifying purchases agree', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makeGroup({ currency: 'USD' }),
        makeGroup({ currency: 'USD' }),
      ]);
      (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(USER_ID, COMPANY_ID);

      const call = (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mock.calls[0][0];
      expect(call.create.currency).toBe('USD');
    });
  });

  // ── refreshSnapshot — purchase record shaping ─────────────────────────────

  describe('refreshSnapshot — purchase record shaping', () => {
    it('falls back to summed SHIPPING-category fees when shippingAmount is null', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makeGroup({ shippingAmount: null, fees: [{ category: 'SHIPPING', amount: '7.50' }] }),
        makeGroup({ shippingAmount: null, fees: [{ category: 'SHIPPING', amount: '4.50' }] }),
      ]);
      (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(USER_ID, COMPANY_ID);

      const call = (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mock.calls[0][0];
      expect(call.create.purchases[0].shippingAmount).toBeCloseTo(7.5);
      expect(call.create.purchases[1].shippingAmount).toBeCloseTo(4.5);
    });

    it('excludes SHIPPING and PRICE_ADJUSTMENT categories from the fees list', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makeGroup({
          fees: [
            { category: 'SHIPPING', amount: '5.00' },
            { category: 'PRICE_ADJUSTMENT', amount: '3.00' },
            { category: 'CUSTOMS', amount: '7.00' },
          ],
        }),
        makeGroup(),
      ]);
      (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(USER_ID, COMPANY_ID);

      const call = (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mock.calls[0][0];
      const categories = call.create.purchases[0].fees.map((f: { category: string }) => f.category);
      expect(categories).toEqual(['CUSTOMS']);
    });

    it('sets bookCount from the number of linked book entries', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makeGroup({ bookEntries: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
        makeGroup(),
      ]);
      (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(USER_ID, COMPANY_ID);

      const call = (prisma.userCompanyCostSnapshot.upsert as jest.Mock).mock.calls[0][0];
      expect(call.create.purchases[0].bookCount).toBe(3);
    });
  });

  // ── predict ────────────────────────────────────────────────────────────────

  describe('predict', () => {
    it('returns null when no snapshot exists', async () => {
      (prisma.userCompanyCostSnapshot.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.predict(USER_ID, COMPANY_ID, 3);

      expect(result).toBeNull();
    });

    it('returns null when the snapshot currency is suppressed (mixed)', async () => {
      (prisma.userCompanyCostSnapshot.findUnique as jest.Mock).mockResolvedValueOnce({
        currency: null,
        purchases: [
          { bookCount: 1, shippingAmount: 10, fees: [], currency: 'USD', purchasedAt: '2026-01-01' },
          { bookCount: 2, shippingAmount: 12, fees: [], currency: 'EUR', purchasedAt: '2026-01-01' },
        ],
      });

      const result = await service.predict(USER_ID, COMPANY_ID, 2);

      expect(result).toBeNull();
    });

    it('returns null when fewer than 2 purchases are stored (min sample gate)', async () => {
      (prisma.userCompanyCostSnapshot.findUnique as jest.Mock).mockResolvedValueOnce({
        currency: 'USD',
        purchases: [{ bookCount: 1, shippingAmount: 10, fees: [], currency: 'USD', purchasedAt: '2026-01-01' }],
      });

      const result = await service.predict(USER_ID, COMPANY_ID, 1);

      expect(result).toBeNull();
    });

    it('matches the nearest bookCount and averages shipping across ties', async () => {
      (prisma.userCompanyCostSnapshot.findUnique as jest.Mock).mockResolvedValueOnce({
        currency: 'USD',
        purchases: [
          { bookCount: 1, shippingAmount: 10, fees: [{ category: 'CUSTOMS', amount: 5 }], currency: 'USD', purchasedAt: '2026-01-01' },
          { bookCount: 3, shippingAmount: 20, fees: [], currency: 'USD', purchasedAt: '2026-01-01' },
          { bookCount: 5, shippingAmount: 30, fees: [], currency: 'USD', purchasedAt: '2026-01-01' },
        ],
      });

      const result = await service.predict(USER_ID, COMPANY_ID, 4);

      // |1-4|=3, |3-4|=1, |5-4|=1 -> nearest tie is bookCount 3 and 5
      expect(result).not.toBeNull();
      expect(result!.shipping).toEqual({ amount: 25, currency: 'USD' });
      expect(result!.fees).toEqual([]); // CUSTOMS only lived on the unmatched bookCount-1 entry
      expect(result!.sampleSize).toBe(2);
    });

    it('prefers an exact bookCount match over nearby ones', async () => {
      (prisma.userCompanyCostSnapshot.findUnique as jest.Mock).mockResolvedValueOnce({
        currency: 'USD',
        purchases: [
          { bookCount: 2, shippingAmount: 10, fees: [], currency: 'USD', purchasedAt: '2026-01-01' },
          { bookCount: 3, shippingAmount: 99, fees: [], currency: 'USD', purchasedAt: '2026-01-01' },
          { bookCount: 4, shippingAmount: 10, fees: [], currency: 'USD', purchasedAt: '2026-01-01' },
        ],
      });

      const result = await service.predict(USER_ID, COMPANY_ID, 3);

      expect(result!.sampleSize).toBe(1);
      expect(result!.shipping).toEqual({ amount: 99, currency: 'USD' });
    });

    it('averages a fee category only across matched entries that actually have it', async () => {
      (prisma.userCompanyCostSnapshot.findUnique as jest.Mock).mockResolvedValueOnce({
        currency: 'USD',
        purchases: [
          { bookCount: 2, shippingAmount: 10, fees: [{ category: 'CUSTOMS', amount: 10 }], currency: 'USD', purchasedAt: '2026-01-01' },
          { bookCount: 2, shippingAmount: 10, fees: [], currency: 'USD', purchasedAt: '2026-01-01' },
        ],
      });

      const result = await service.predict(USER_ID, COMPANY_ID, 2);

      expect(result!.fees).toEqual([{ category: 'CUSTOMS', amount: 10, currency: 'USD' }]);
    });
  });

  // ── predictBatch ───────────────────────────────────────────────────────────

  describe('predictBatch', () => {
    it('issues exactly one snapshot query for multiple requests across distinct companies', async () => {
      (prisma.userCompanyCostSnapshot.findMany as jest.Mock).mockResolvedValueOnce([
        { companyId: 'c1', currency: 'USD', purchases: [
          { bookCount: 2, shippingAmount: 10, fees: [], currency: 'USD', purchasedAt: '2026-01-01' },
          { bookCount: 2, shippingAmount: 12, fees: [], currency: 'USD', purchasedAt: '2026-01-01' },
        ] },
        { companyId: 'c2', currency: 'EUR', purchases: [
          { bookCount: 3, shippingAmount: 5, fees: [], currency: 'EUR', purchasedAt: '2026-01-01' },
          { bookCount: 3, shippingAmount: 7, fees: [], currency: 'EUR', purchasedAt: '2026-01-01' },
        ] },
      ]);

      const result = await service.predictBatch(USER_ID, [
        { companyId: 'c1', bookCount: 2 },
        { companyId: 'c2', bookCount: 3 },
        { companyId: 'c1', bookCount: 2 }, // duplicate — must not trigger a second query
      ]);

      expect(prisma.userCompanyCostSnapshot.findMany).toHaveBeenCalledTimes(1);
      const call = (prisma.userCompanyCostSnapshot.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.companyId.in).toEqual(['c1', 'c2']);

      expect(result.get('c1:2')).not.toBeNull();
      expect(result.get('c2:3')).not.toBeNull();
    });

    it('does not query at all for an empty request list', async () => {
      const result = await service.predictBatch(USER_ID, []);

      expect(prisma.userCompanyCostSnapshot.findMany).not.toHaveBeenCalled();
      expect(result.size).toBe(0);
    });
  });

  // ── refreshSnapshotForSale ────────────────────────────────────────────────

  describe('refreshSnapshotForSale', () => {
    it('does nothing when saleAnnouncementId is null', async () => {
      const spy = jest.spyOn(service, 'refreshSnapshot').mockResolvedValueOnce(undefined);

      await service.refreshSnapshotForSale(USER_ID, null);

      expect(prisma.saleAnnouncement.findUnique).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
    });

    it('does nothing when the sale has no companyId', async () => {
      (prisma.saleAnnouncement.findUnique as jest.Mock).mockResolvedValueOnce({ companyId: null });
      const spy = jest.spyOn(service, 'refreshSnapshot').mockResolvedValueOnce(undefined);

      await service.refreshSnapshotForSale(USER_ID, 'sale-1');

      expect(spy).not.toHaveBeenCalled();
    });

    it('resolves the company and delegates to refreshSnapshot', async () => {
      (prisma.saleAnnouncement.findUnique as jest.Mock).mockResolvedValueOnce({ companyId: COMPANY_ID });
      const spy = jest.spyOn(service, 'refreshSnapshot').mockResolvedValueOnce(undefined);

      await service.refreshSnapshotForSale(USER_ID, 'sale-1');

      expect(spy).toHaveBeenCalledWith(USER_ID, COMPANY_ID);
    });
  });

  // ── refreshSnapshotForPurchaseGroup ───────────────────────────────────────

  describe('refreshSnapshotForPurchaseGroup', () => {
    it('does nothing when purchaseGroupId is null', async () => {
      const spy = jest.spyOn(service, 'refreshSnapshotForSale').mockResolvedValueOnce(undefined);

      await service.refreshSnapshotForPurchaseGroup(USER_ID, null);

      expect(prisma.userPurchaseGroup.findUnique).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
    });

    it('resolves the group and delegates to refreshSnapshotForSale', async () => {
      (prisma.userPurchaseGroup.findUnique as jest.Mock).mockResolvedValueOnce({ saleAnnouncementId: 'sale-1' });
      const spy = jest.spyOn(service, 'refreshSnapshotForSale').mockResolvedValueOnce(undefined);

      await service.refreshSnapshotForPurchaseGroup(USER_ID, 'pg-1');

      expect(spy).toHaveBeenCalledWith(USER_ID, 'sale-1');
    });
  });
});
