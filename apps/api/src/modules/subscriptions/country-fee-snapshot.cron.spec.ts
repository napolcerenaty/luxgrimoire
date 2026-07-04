/**
 * Unit tests for CountryFeeSnapshotCronService
 *
 * Covers:
 * - computeFromPurchaseGroups (via computeForSubscriptionAndCountry)
 * - computeFromEntrySettings (fallback when no purchase groups)
 * - computeForSubscriptionAndCountry: purchase groups -> entry-settings fallback
 * - refreshSnapshot: upserts to DB
 * - refreshSnapshotForEntry: resolves country and delegates to refreshSnapshot
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { CountryFeeSnapshotCronService } from './country-fee-snapshot.cron';

const FIXED_NOW = new Date('2026-01-15T12:00:00Z');
const SUB_ID = 'sub-1';
const COUNTRY = 'PL';
const ENTRY_ID = 'entry-1';
const USER_ID = 'user-1';

// ── helpers ──────────────────────────────────────────────────────────────────

function makePurchaseGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pg-1',
    shippingAmount: '9.00',
    currency: 'USD',
    subscriptionEntryId: ENTRY_ID,
    subscriptionEntry: { prepaidMonths: 1 },
    fees: [],
    ...overrides,
  };
}

function makeEntryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    shippingCost: '9.00',
    costCurrency: 'USD',
    feeTemplates: [],
    ...overrides,
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('CountryFeeSnapshotCronService', () => {
  let service: CountryFeeSnapshotCronService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    prisma = mockDeep<PrismaService>();
    service = new CountryFeeSnapshotCronService(prisma);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── computeFromPurchaseGroups (via computeForSubscriptionAndCountry) ──────

  describe('computeForSubscriptionAndCountry — purchase groups path', () => {
    it('returns aggregated shipping from purchase groups', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makePurchaseGroup({ shippingAmount: '10.00', currency: 'USD' }),
        makePurchaseGroup({ id: 'pg-2', shippingAmount: '8.00', currency: 'USD', subscriptionEntryId: 'entry-2' }),
      ]);

      const result = await service.computeForSubscriptionAndCountry(SUB_ID, COUNTRY);

      const shipping = result.find(r => r.category === '__shipping__');
      expect(shipping).toBeDefined();
      expect(shipping!.avgAmount).toBeCloseTo(9.0);
      expect(shipping!.currency).toBe('USD');
      expect(shipping!.totalSubscribers).toBe(2);
    });

    it('excludes isForwarding entries via query filter (verifies filter is passed)', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([]);
      // falls through to entry-settings fallback
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);

      await service.computeForSubscriptionAndCountry(SUB_ID, COUNTRY);

      const pgCall = (prisma.userPurchaseGroup.findMany as jest.Mock).mock.calls[0][0];
      expect(pgCall.where.subscriptionEntry.isForwarding).toBe(false);
    });

    it('divides fee amounts by prepaidMonths for prepaid entries', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makePurchaseGroup({
          shippingAmount: null,
          fees: [{ category: 'CUSTOMS', amount: '30.00', currency: 'PLN' }],
          subscriptionEntry: { prepaidMonths: 3 },
        }),
      ]);

      const result = await service.computeForSubscriptionAndCountry(SUB_ID, COUNTRY);

      const customs = result.find(r => r.category === 'CUSTOMS');
      expect(customs).toBeDefined();
      expect(customs!.avgAmount).toBeCloseTo(10.0); // 30 / 3
    });

    it('aggregates fee counts by unique entryId', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makePurchaseGroup({
          id: 'pg-1', subscriptionEntryId: 'e1',
          shippingAmount: null,
          fees: [{ category: 'CUSTOMS', amount: '5.00', currency: 'PLN' }],
        }),
        makePurchaseGroup({
          id: 'pg-2', subscriptionEntryId: 'e2',
          shippingAmount: null,
          fees: [{ category: 'CUSTOMS', amount: '7.00', currency: 'PLN' }],
        }),
        makePurchaseGroup({
          id: 'pg-3', subscriptionEntryId: 'e1', // same entry as pg-1
          shippingAmount: null,
          fees: [{ category: 'CUSTOMS', amount: '5.00', currency: 'PLN' }],
        }),
      ]);

      const result = await service.computeForSubscriptionAndCountry(SUB_ID, COUNTRY);

      const customs = result.find(r => r.category === 'CUSTOMS');
      expect(customs!.count).toBe(2); // 2 unique entry IDs
      expect(customs!.totalSubscribers).toBe(2); // 2 unique entry IDs total
    });

    it('sets currency to null when mixed currencies across fee groups', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makePurchaseGroup({
          id: 'pg-1', subscriptionEntryId: 'e1',
          shippingAmount: null,
          fees: [{ category: 'CUSTOMS', amount: '5.00', currency: 'PLN' }],
        }),
        makePurchaseGroup({
          id: 'pg-2', subscriptionEntryId: 'e2',
          shippingAmount: null,
          fees: [{ category: 'CUSTOMS', amount: '5.00', currency: 'USD' }],
        }),
      ]);

      const result = await service.computeForSubscriptionAndCountry(SUB_ID, COUNTRY);

      const customs = result.find(r => r.category === 'CUSTOMS');
      expect(customs!.currency).toBeNull();
    });
  });

  // ── entry-settings fallback ───────────────────────────────────────────────

  describe('computeForSubscriptionAndCountry — entry-settings fallback (no purchase groups)', () => {
    beforeEach(() => {
      // No purchase groups → triggers fallback
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([]);
    });

    it('falls back to entry settings when purchase groups are empty', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        makeEntryRow({ shippingCost: '12.00', costCurrency: 'EUR' }),
      ]);

      const result = await service.computeForSubscriptionAndCountry(SUB_ID, COUNTRY);

      const shipping = result.find(r => r.category === '__shipping__');
      expect(shipping).toBeDefined();
      expect(shipping!.avgAmount).toBe(12.0);
      expect(shipping!.currency).toBe('EUR');
    });

    it('excludes isForwarding entries in entry-settings fallback', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);

      await service.computeForSubscriptionAndCountry(SUB_ID, COUNTRY);

      const call = (prisma.userSubscriptionEntry.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.isForwarding).toBe(false);
      expect(call.where.active).toBe(true);
    });

    it('returns [] when no entries in fallback', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.computeForSubscriptionAndCountry(SUB_ID, COUNTRY);

      expect(result).toEqual([]);
    });

    it('aggregates fee templates from entry settings', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        makeEntryRow({
          shippingCost: null,
          feeTemplates: [
            {
              customAmount: '15.00',
              customCurrency: 'PLN',
              feeTemplate: { category: 'CUSTOMS', defaultAmount: '10.00', defaultCurrency: 'PLN' },
            },
          ],
        }),
        makeEntryRow({
          id: 'entry-2',
          shippingCost: null,
          feeTemplates: [
            {
              customAmount: null,
              customCurrency: null,
              feeTemplate: { category: 'CUSTOMS', defaultAmount: '10.00', defaultCurrency: 'PLN' },
            },
          ],
        }),
      ]);

      const result = await service.computeForSubscriptionAndCountry(SUB_ID, COUNTRY);

      const customs = result.find(r => r.category === 'CUSTOMS');
      expect(customs).toBeDefined();
      expect(customs!.count).toBe(2);
      expect(customs!.avgAmount).toBeCloseTo(12.5); // (15 + 10) / 2
    });
  });

  // ── refreshSnapshot ───────────────────────────────────────────────────────

  describe('refreshSnapshot', () => {
    it('upserts computed data to DB', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makePurchaseGroup(),
      ]);
      (prisma.subscriptionCountryFeeSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(SUB_ID, COUNTRY);

      expect(prisma.subscriptionCountryFeeSnapshot.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { subscriptionId_country: { subscriptionId: SUB_ID, country: 'PL' } },
          create: expect.objectContaining({ subscriptionId: SUB_ID, country: 'PL' }),
          update: expect.objectContaining({}),
        }),
      );
    });

    it('upserts even when result is [] (clears stale snapshot)', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.subscriptionCountryFeeSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(SUB_ID, COUNTRY);

      expect(prisma.subscriptionCountryFeeSnapshot.upsert).toHaveBeenCalled();
    });

    it('normalises country to uppercase', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.subscriptionCountryFeeSnapshot.upsert as jest.Mock).mockResolvedValueOnce({});

      await service.refreshSnapshot(SUB_ID, 'pl');

      const call = (prisma.subscriptionCountryFeeSnapshot.upsert as jest.Mock).mock.calls[0][0];
      expect(call.where.subscriptionId_country.country).toBe('PL');
    });
  });

  // ── refreshSnapshotForEntry ───────────────────────────────────────────────

  describe('refreshSnapshotForEntry', () => {
    it('resolves country from entry shippingCountry and calls refreshSnapshot', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
        subscriptionId: SUB_ID,
        shippingCountry: 'PL',
        user: { shippingCountry: null },
      });
      const refreshSpy = jest.spyOn(service, 'refreshSnapshot').mockResolvedValueOnce(undefined);

      await service.refreshSnapshotForEntry(ENTRY_ID);

      expect(refreshSpy).toHaveBeenCalledWith(SUB_ID, 'PL');
    });

    it('falls back to user shippingCountry when entry has none', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
        subscriptionId: SUB_ID,
        shippingCountry: null,
        user: { shippingCountry: 'DE' },
      });
      const refreshSpy = jest.spyOn(service, 'refreshSnapshot').mockResolvedValueOnce(undefined);

      await service.refreshSnapshotForEntry(ENTRY_ID);

      expect(refreshSpy).toHaveBeenCalledWith(SUB_ID, 'DE');
    });

    it('does nothing when entry not found', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);
      const refreshSpy = jest.spyOn(service, 'refreshSnapshot').mockResolvedValueOnce(undefined);

      await service.refreshSnapshotForEntry(ENTRY_ID);

      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('does nothing when neither entry nor user has shippingCountry', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
        subscriptionId: SUB_ID,
        shippingCountry: null,
        user: { shippingCountry: null },
      });
      const refreshSpy = jest.spyOn(service, 'refreshSnapshot').mockResolvedValueOnce(undefined);

      await service.refreshSnapshotForEntry(ENTRY_ID);

      expect(refreshSpy).not.toHaveBeenCalled();
    });
  });

  // ── purchase-groups-first ordering ───────────────────────────────────────

  describe('purchase groups take priority over entry settings', () => {
    it('does NOT call entry-settings query when purchase groups return data', async () => {
      (prisma.userPurchaseGroup.findMany as jest.Mock).mockResolvedValueOnce([
        makePurchaseGroup(),
      ]);

      await service.computeForSubscriptionAndCountry(SUB_ID, COUNTRY);

      expect(prisma.userSubscriptionEntry.findMany).not.toHaveBeenCalled();
    });
  });
});
