/**
 * Full-path integration tests for backfillSubscription().
 *
 * Covers all major join subscription variants:
 *  - Monthly, no billing batches (no path): full shipping & fees per month
 *  - Monthly, multiple months: each month independent (no division)
 *  - Monthly with fee templates: full fee per month (not divided by month count)
 *  - Prepaid with billing batches (auto/no path): shipping & fees split by monthsCovered
 *  - Prepaid billing batches, yes path: manual batch with custom date
 *  - Prepaid partial batch (fewer months than period): shipping split correctly
 *  - Batch fees divided by monthsCovered; different-currency fees not divided
 *  - Batch billing period (UserSubBillingPeriod) created once per batch
 *  - Book price overrides applied to purchase group totalAmount
 *  - Skip records auto-derived from eligible-minus-selected
 *  - No-batch path: base price from entry (price history lookup fallback)
 *  - Billing date: earliest selected month uses entry.startDate when paymentOnStartup=true
 *  - Batch billing date: purchasedAt comes from batch.billedAt, not renewalDate
 */

import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const SUB_ID = 'sub-fp-1';
const SUB_SLUG = 'fp-test-sub';
const USER_ID = 'user-fp-1';
const ENTRY_ID = 'entry-fp-1';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Full Path Test Sub',
    isCombo: false,
    componentIds: [],
    currency: 'USD',
    renewalDay: 1,
    renewalDayUserSet: false,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: false,
    renewalMonthOffset: 0,
    isContentStream: false,
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    startDate: '2026-01-22',
    cancellationDate: null,
    renewalDay: 1,
    basePrice: { toString: () => '29.99' },
    costCurrency: 'USD',
    shippingCost: null,
    firstSkipDate: null,
    feeTemplates: [],
    ...overrides,
  };
}

function makeMonth(id: string, year: number, month: number, bookId = `bk-${id}`, editionId = `ed-${id}`) {
  return {
    id,
    year,
    month,
    signatureType: null,
    books: [{ editionId, bookId, signatureType: null }],
  };
}

/** Minimal mocks required for one non-combo backfill call (configurable months). */
function setupBackfill(
  prisma: DeepMockProxy<PrismaService>,
  skipMock: { recomputeSkipState: jest.Mock },
  options: {
    entry?: ReturnType<typeof makeEntry>;
    months?: ReturnType<typeof makeMonth>[];
    /** Extra purchase group create mocks — one per selected month, plus (n-1) for multiple months */
    purchaseGroupIds?: string[];
    purchaseGroupUpdateResult?: { id: string };
    billingPeriodId?: string;
    /** whether to mock updateMany for bookEntries */
    withUpdate?: boolean;
  } = {},
) {
  const {
    entry = makeEntry(),
    months = [makeMonth('m-1', 2026, 1)],
    purchaseGroupIds,
    billingPeriodId,
    purchaseGroupUpdateResult,
  } = options;

  (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);
  (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
  (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);
  (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce(months);

  // Purchase group create — one per month
  const ids = purchaseGroupIds ?? months.map((_, i) => `pg-${i + 1}`);
  for (const pgId of ids) {
    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: pgId });
  }

  // Purchase group update (for batch period link or book price overrides)
  if (purchaseGroupUpdateResult) {
    (prisma.userPurchaseGroup.update as jest.Mock).mockResolvedValue(purchaseGroupUpdateResult);
  } else {
    (prisma.userPurchaseGroup.update as jest.Mock).mockResolvedValue({ id: 'pg-1' });
  }

  // UserSubBillingPeriod (for batch path)
  if (billingPeriodId) {
    (prisma.userSubBillingPeriod.create as jest.Mock).mockResolvedValueOnce({ id: billingPeriodId });
  }

  // Book entries: upsertSubscriptionBookEntry uses findFirst (returns null) + create
  for (let i = 0; i < months.length; i++) {
    const bookCount = months[i].books.length;
    for (let b = 0; b < bookCount; b++) {
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: `be-${i}-${b}` });
      // ownershipStatusHistory.create is chained via .catch(() => {}) — must return a Promise
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});
    }
  }

  // Skip policy lookup
  (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ id: SUB_ID, skipPolicies: [] });
  // Eligible months for auto-skip derivation (empty — avoids complex skip mocks)
  (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]);

  skipMock.recomputeSkipState.mockResolvedValueOnce(undefined);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('SubscriptionsService — backfillSubscription full paths', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let skipMock: { recomputeSkipState: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    skipMock = { recomputeSkipState: jest.fn() };

    service = new SubscriptionsService(
      prisma,
      {} as any,        // TypesenseService
      skipMock as any,  // SkipPolicyEngine
      {} as any,        // RenewalCronService
      {} as any,        // CountryFeeSnapshotCronService
      {} as any,        // UploadService
      {} as any,        // CrowdStatsService
      { markStatsStale: jest.fn() } as any, // StatsService
      { del: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  // ── Monthly / no-batch path ───────────────────────────────────────────────

  describe('monthly — no billing batches (no path)', () => {
    it('creates one purchase group per month with entry base price', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2)];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ basePrice: { toString: () => '29.99' } }),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledTimes(2);
      expect(prisma.userPurchaseGroup.create).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ data: expect.objectContaining({ totalAmount: 29.99 }) }),
      );
      expect(prisma.userPurchaseGroup.create).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ data: expect.objectContaining({ totalAmount: 29.99 }) }),
      );
    });

    it('assigns full shipping per month — not divided by month count', async () => {
      // Bug regression: previously shipping was divided by total selected months
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2), makeMonth('m-3', 2026, 3)];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ shippingCost: { toString: () => '9.99' }, basePrice: { toString: () => '29.99' } }),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2', 'pg-3'],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2', 'm-3'],
      } as any);

      // All 3 purchase groups should have full shipping (not 9.99/3 = 3.33)
      const calls = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls;
      expect(calls).toHaveLength(3);
      for (const call of calls) {
        expect(call[0].data.shippingAmount).toBeCloseTo(9.99);
      }
    });

    it('assigns null shipping when entry has no shippingCost', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ shippingCost: null }),
        months: [makeMonth('m-1', 2026, 1)],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ shippingAmount: null }) }),
      );
    });

    it('creates purchase group with entry costCurrency', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ costCurrency: 'PLN', basePrice: { toString: () => '599' } }),
        months: [makeMonth('m-1', 2026, 4)],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currency: 'PLN', totalAmount: 599 }),
        }),
      );
    });
  });

  // ── Monthly with fee templates ────────────────────────────────────────────

  describe('monthly — fee templates (no path)', () => {
    it('applies full fee amount per month — not divided by month count', async () => {
      // Bug regression: previously fee was divided by noBatchMonthCount
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const feeTemplate = {
        feeTemplate: {
          id: 'ft-1',
          name: 'IOSS VAT USD',
          category: 'VAT',
          defaultAmount: '12.00',
          defaultCurrency: 'USD',
        },
        customAmount: '12.00',
        customCurrency: 'USD',
      };

      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2)];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ feeTemplates: [feeTemplate], basePrice: { toString: () => '29.99' } }),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
      });
      (prisma.userPurchaseFee.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2'],
      } as any);

      const feeCalls = (prisma.userPurchaseFee.createMany as jest.Mock).mock.calls;
      expect(feeCalls).toHaveLength(1);
      const feeData = feeCalls[0][0].data as Array<{ amount: number }>;
      // 2 months → 2 fee records, each with full 12.00 (not 12/2 = 6)
      expect(feeData).toHaveLength(2);
      expect(feeData[0].amount).toBeCloseTo(12.00);
      expect(feeData[1].amount).toBeCloseTo(12.00);
    });

    it('skips fee when no amount is set on template', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const feeTemplate = {
        feeTemplate: { id: 'ft-2', name: 'Empty Fee', category: 'OTHER', defaultAmount: null, defaultCurrency: 'USD' },
        customAmount: null,
        customCurrency: 'USD',
      };

      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ feeTemplates: [feeTemplate] }),
        months: [makeMonth('m-1', 2026, 1)],
      });
      (prisma.userPurchaseFee.createMany as jest.Mock).mockResolvedValue({ count: 0 });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      // No fees created — empty amount skipped
      const feeCalls = (prisma.userPurchaseFee.createMany as jest.Mock).mock.calls;
      if (feeCalls.length > 0) {
        expect(feeCalls[0][0].data).toHaveLength(0);
      }
    });
  });

  // ── Prepaid with billing batches (auto-computed "No" path) ────────────────

  describe('prepaid — billing batches (auto "No" path)', () => {
    it('splits shipping evenly across months in a batch', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [
        makeMonth('m-1', 2026, 1),
        makeMonth('m-2', 2026, 2),
        makeMonth('m-3', 2026, 3),
      ];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ shippingCost: null }),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2', 'pg-3'],
        billingPeriodId: 'bp-1',
      });

      // Single 3-month batch with $60 shipping
      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2', 'm-3'],
        billingBatches: [{
          billedAt: '2026-01-22',
          baseAmount: 89.97,
          monthsCovered: 3,
          currency: 'USD',
          monthIds: ['m-1', 'm-2', 'm-3'],
          shippingAmount: 60,
        }],
      } as any);

      // Each of 3 months should get 60/3 = 20 shipping
      const calls = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls;
      expect(calls).toHaveLength(3);
      for (const call of calls) {
        expect(call[0].data.shippingAmount).toBeCloseTo(20);
      }
    });

    it('splits base amount evenly across months in a batch', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2)];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry(),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
        billingPeriodId: 'bp-1',
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2'],
        billingBatches: [{
          billedAt: '2026-01-22',
          baseAmount: 59.98,
          monthsCovered: 2,
          currency: 'USD',
          monthIds: ['m-1', 'm-2'],
        }],
      } as any);

      const calls = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls;
      expect(calls).toHaveLength(2);
      // 59.98 / 2 = 29.99 per month
      for (const call of calls) {
        expect(call[0].data.totalAmount).toBeCloseTo(29.99);
      }
    });

    it('uses batch.billedAt as purchasedAt for all months in the batch', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2)];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry(),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
        billingPeriodId: 'bp-1',
      });

      const billedAt = '2026-01-22';
      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2'],
        billingBatches: [{
          billedAt,
          baseAmount: 59.98,
          monthsCovered: 2,
          currency: 'USD',
          monthIds: ['m-1', 'm-2'],
        }],
      } as any);

      const calls = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls;
      for (const call of calls) {
        expect(call[0].data.purchasedAt).toEqual(new Date(billedAt));
      }
    });

    it('creates a billing period record once per batch with correct data', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2), makeMonth('m-3', 2026, 3)];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry(),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2', 'pg-3'],
        billingPeriodId: 'bp-1',
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2', 'm-3'],
        billingBatches: [{
          billedAt: '2026-01-01',
          baseAmount: 89.97,
          monthsCovered: 3,
          currency: 'USD',
          monthIds: ['m-1', 'm-2', 'm-3'],
          shippingAmount: 45,
        }],
      } as any);

      // Billing period created exactly once (not once per month)
      expect(prisma.userSubBillingPeriod.create).toHaveBeenCalledTimes(1);
      expect(prisma.userSubBillingPeriod.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            baseAmount: 89.97,
            shipping: 45,
            monthsCovered: 3,
            coveredFromYear: 2026,
            coveredFromMonth: 1,
            coveredToYear: 2026,
            coveredToMonth: 3,
          }),
        }),
      );
    });

    it('null shipping in batch → null shippingAmount on purchase group', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2)];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry(),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
        billingPeriodId: 'bp-1',
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2'],
        billingBatches: [{
          billedAt: '2026-01-01',
          baseAmount: 59.98,
          monthsCovered: 2,
          currency: 'USD',
          monthIds: ['m-1', 'm-2'],
          // no shippingAmount
        }],
      } as any);

      const calls = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls;
      for (const call of calls) {
        expect(call[0].data.shippingAmount).toBeNull();
      }
    });
  });

  // ── Prepaid — yes path (manual billing batches) ───────────────────────────

  describe('prepaid — yes path (manually-provided batches)', () => {
    it('uses user-supplied batch date as purchasedAt', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      // User gave a specific billing date in the past
      const customDate = '2025-06-15';
      const months = [makeMonth('m-1', 2025, 7), makeMonth('m-2', 2025, 8), makeMonth('m-3', 2025, 9)];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ startDate: '2025-01-01' }),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2', 'pg-3'],
        billingPeriodId: 'bp-1',
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2', 'm-3'],
        billingBatches: [{
          billedAt: customDate,
          baseAmount: 90,
          monthsCovered: 3,
          currency: 'USD',
          monthIds: ['m-1', 'm-2', 'm-3'],
          shippingAmount: 30,
        }],
      } as any);

      const calls = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls;
      expect(calls).toHaveLength(3);
      for (const call of calls) {
        expect(call[0].data.purchasedAt).toEqual(new Date(customDate));
      }
    });

    it('handles two separate batches (period switch during sub)', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      // 2 batches: first batch = Jan–Mar 2025 (monthly), second = Apr–Sep 2025 (6-month prepay)
      const months = [
        makeMonth('m-1', 2025, 1), makeMonth('m-2', 2025, 2), makeMonth('m-3', 2025, 3),
        makeMonth('m-4', 2025, 4), makeMonth('m-5', 2025, 5), makeMonth('m-6', 2025, 6),
      ];

      // Set up mocks: 6 purchase groups + 4 billing periods (one per batch) + book entries
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(makeEntry());
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce(months);
      for (let i = 1; i <= 6; i++) {
        (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: `pg-${i}` });
      }
      (prisma.userPurchaseGroup.update as jest.Mock).mockResolvedValue({ id: 'pg-1' });
      // 4 billing period creates (one per batch: 3 monthly + 1 three-month)
      for (let i = 1; i <= 4; i++) {
        (prisma.userSubBillingPeriod.create as jest.Mock).mockResolvedValueOnce({ id: `bp-${i}` });
      }
      // Book entries: findFirst returns null, create returns entry for each of 6 months
      for (let i = 1; i <= 6; i++) {
        (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
        (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: `be-${i}` });
        (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});
      }
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ id: SUB_ID, skipPolicies: [] });
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]);
      skipMock.recomputeSkipState.mockResolvedValueOnce(undefined);

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1','m-2','m-3','m-4','m-5','m-6'],
        billingBatches: [
          { billedAt: '2025-01-01', baseAmount: 29.99, monthsCovered: 1, currency: 'USD', monthIds: ['m-1'] },
          { billedAt: '2025-02-01', baseAmount: 29.99, monthsCovered: 1, currency: 'USD', monthIds: ['m-2'] },
          { billedAt: '2025-03-01', baseAmount: 29.99, monthsCovered: 1, currency: 'USD', monthIds: ['m-3'] },
          { billedAt: '2025-04-01', baseAmount: 149.94, monthsCovered: 3, currency: 'USD', monthIds: ['m-4','m-5','m-6'] },
        ],
      } as any);

      // 2 billing periods created (3 monthly + 1 six-month)
      expect(prisma.userSubBillingPeriod.create).toHaveBeenCalledTimes(4); // one per batch
    });
  });

  // ── Batch fees ────────────────────────────────────────────────────────────

  describe('billing batch — fee splitting', () => {
    it('splits batch fee by monthsCovered when currencies match', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2), makeMonth('m-3', 2026, 3)];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ feeTemplates: [] }),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2', 'pg-3'],
        billingPeriodId: 'bp-1',
      });
      (prisma.userPurchaseFee.createMany as jest.Mock).mockResolvedValue({ count: 3 });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2', 'm-3'],
        billingBatches: [{
          billedAt: '2026-01-01',
          baseAmount: 89.97,
          monthsCovered: 3,
          currency: 'USD',
          monthIds: ['m-1', 'm-2', 'm-3'],
          fees: [{ name: 'VAT', amount: 12, currency: 'USD' }],
        }],
      } as any);

      const feeCalls = (prisma.userPurchaseFee.createMany as jest.Mock).mock.calls;
      expect(feeCalls).toHaveLength(1);
      const feeData = feeCalls[0][0].data as Array<{ name: string; amount: number }>;
      // 3 fee records (one per month), each = 12/3 = 4
      expect(feeData).toHaveLength(3);
      for (const fd of feeData) {
        expect(fd.name).toBe('VAT');
        expect(fd.amount).toBeCloseTo(4);
      }
    });

    it('does NOT split batch fee when fee currency differs from batch currency', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2)];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ feeTemplates: [] }),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
        billingPeriodId: 'bp-1',
      });
      (prisma.userPurchaseFee.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2'],
        billingBatches: [{
          billedAt: '2026-01-01',
          baseAmount: 59.98,
          monthsCovered: 2,
          currency: 'USD',
          monthIds: ['m-1', 'm-2'],
          fees: [{ name: 'EU VAT', amount: 20, currency: 'EUR' }], // different currency
        }],
      } as any);

      const feeCalls = (prisma.userPurchaseFee.createMany as jest.Mock).mock.calls;
      expect(feeCalls).toHaveLength(1);
      const feeData = feeCalls[0][0].data as Array<{ amount: number }>;
      // 2 records, each with full 20 (not 20/2=10) because currencies differ
      expect(feeData).toHaveLength(2);
      for (const fd of feeData) {
        expect(fd.amount).toBeCloseTo(20);
      }
    });
  });

  // ── Book price overrides ──────────────────────────────────────────────────

  describe('book price overrides', () => {
    it('updates purchase group totalAmount with override price for specified book', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [
        {
          id: 'm-1', year: 2026, month: 1, signatureType: null,
          books: [
            { editionId: 'ed-A', bookId: 'bk-A', signatureType: null },
            { editionId: 'ed-B', bookId: 'bk-B', signatureType: null },
          ],
        },
      ];

      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ basePrice: { toString: () => '59.98' } }),
        months,
        purchaseGroupIds: ['pg-1'],
      });
      // 2 books: each needs findFirst + create + ownershipStatusHistory
      for (let b = 0; b < 2; b++) {
        (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
        (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: `be-${b}` });
        (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});
      }

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
        bookPrices: [
          { monthId: 'm-1', editionId: 'ed-A', price: 29.99 },
        ],
      } as any);

      // Verify update was called with override price for the first book
      expect(prisma.userPurchaseGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pg-1' },
          data: { totalAmount: 29.99 },
        }),
      );
    });
  });

  // ── Skip records auto-derived ─────────────────────────────────────────────

  describe('skip records auto-derived from eligible minus selected', () => {
    it('creates skip records for eligible months not in selectedMonthIds', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const selectedMonth = makeMonth('m-1', 2026, 1);

      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(makeEntry());
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([selectedMonth]);
      (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
      (prisma.userPurchaseGroup.update as jest.Mock).mockResolvedValue({ id: 'pg-1' });
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: 'be-1' });
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});

      // Skip policy lookup
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        id: SUB_ID,
        skipPolicies: [{ billingType: 'ALL', windowMonths: 6, maxSkipsPerWindow: 1 }],
      });
      // Eligible months for auto-skip derivation: m-1 (selected) + m-2 (skipped)
      const skippedMonth = makeMonth('m-2', 2026, 2);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([selectedMonth, skippedMonth]);
      // Skip upsert
      (prisma.userSkipRecord.upsert as jest.Mock).mockResolvedValueOnce({ id: 'skip-1' });
      // firstSkipDate update
      (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValueOnce({});
      skipMock.recomputeSkipState.mockResolvedValueOnce(undefined);

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      // Skip record should be created for m-2
      expect(prisma.userSkipRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userEntryId_subscriptionMonthId: {
              userEntryId: ENTRY_ID,
              subscriptionMonthId: 'm-2',
            },
          }),
        }),
      );
    });

    it('creates no skip records when all eligible months are selected', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2)];
      setupBackfill(prisma, skipMock, {
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2'],
      } as any);

      expect(prisma.userSkipRecord.upsert).not.toHaveBeenCalled();
    });
  });

  describe('multi-policy — selects policy by entry.prepaidMonths', () => {
    // Helper: run a backfill with MONTHLY + PREPAID policies and return the windowKey
    // used when creating the auto-derived skip record for the unselected month.
    async function runWithPolicies(entryOverrides: Record<string, unknown>) {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const selectedMonth = makeMonth('m-1', 2026, 1);
      const skippedMonth = makeMonth('m-2', 2026, 2);

      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(makeEntry(entryOverrides));
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([selectedMonth]);
      (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
      (prisma.userPurchaseGroup.update as jest.Mock).mockResolvedValue({ id: 'pg-1' });
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: 'be-1' });
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});

      // Two policies: MONTHLY uses FROM_SUB_START (windowKey = start date),
      // PREPAID uses CALENDAR_YEAR (windowKey = year).
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        id: SUB_ID,
        skipPolicies: [
          { billingType: 'MONTHLY', type: 'FROM_SUB_START', windowMonths: null },
          { billingType: 'PREPAID', type: 'CALENDAR_YEAR', windowMonths: null },
        ],
      });
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([selectedMonth, skippedMonth]);
      (prisma.userSkipRecord.upsert as jest.Mock).mockResolvedValueOnce({ id: 'skip-1' });
      (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValueOnce({});
      skipMock.recomputeSkipState.mockResolvedValueOnce(undefined);

      await service.backfillSubscription(USER_ID, SUB_SLUG, { selectedMonthIds: ['m-1'] } as any);

      const call = (prisma.userSkipRecord.upsert as jest.Mock).mock.calls[0][0];
      return call.create.windowKey as string | null;
    }

    it('monthly entry → selects MONTHLY policy (FROM_SUB_START windowKey)', async () => {
      const windowKey = await runWithPolicies({ prepaidMonths: 1 });
      // FROM_SUB_START → windowKey derived from entry.startDate '2026-01-22'
      expect(windowKey).toBe('2026-01-22');
    });

    it('prepaid entry → selects PREPAID policy (CALENDAR_YEAR windowKey)', async () => {
      const windowKey = await runWithPolicies({ prepaidMonths: 3 });
      // CALENDAR_YEAR → windowKey is the calendar year of the skipped month (2026)
      expect(windowKey).toBe('2026');
    });
  });

  // ── Purchase group billing date ───────────────────────────────────────────

  describe('purchase group billing date (no batch)', () => {
    it('uses entry.startDate as purchasedAt for the earliest month (paymentOnStartup=true)', async () => {
      const sub = makeSub({ paymentOnStartup: true });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const entry = makeEntry({ startDate: '2026-01-22', renewalDay: 1 });
      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2)];
      setupBackfill(prisma, skipMock, {
        entry,
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2'],
      } as any);

      const calls = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls;
      // First call (earliest month = Jan) → startDate
      expect(calls[0][0].data.purchasedAt).toEqual(new Date('2026-01-22'));
      // Second call (Feb) → computed renewalDate (2026-02-01)
      expect(calls[1][0].data.purchasedAt).toEqual(new Date(Date.UTC(2026, 1, 1)));
    });

    it('uses computed renewalDate for all months when paymentOnStartup=false', async () => {
      const sub = makeSub({ paymentOnStartup: false, renewalDay: 15 });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [makeMonth('m-1', 2026, 3), makeMonth('m-2', 2026, 4)];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ renewalDay: 15 }),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2'],
      } as any);

      const calls = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls;
      expect(calls[0][0].data.purchasedAt).toEqual(new Date(Date.UTC(2026, 2, 15)));
      expect(calls[1][0].data.purchasedAt).toEqual(new Date(Date.UTC(2026, 3, 15)));
    });
  });

  // ── Return value ──────────────────────────────────────────────────────────

  describe('return value', () => {
    it('returns booksAdded count equal to number of selected months (1 book each)', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [makeMonth('m-1', 2026, 1), makeMonth('m-2', 2026, 2)];
      setupBackfill(prisma, skipMock, {
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
      });

      const result = await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2'],
      } as any);

      expect(result.booksAdded).toBe(2);
    });
  });

  // ── Multi-book months ─────────────────────────────────────────────────────

  describe('months with multiple books', () => {
    it('creates ONE purchase group per month even when month has multiple books', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      // Month with 2 books
      const multiBookMonth = {
        id: 'mb-1',
        year: 2026,
        month: 3,
        signatureType: null,
        books: [
          { editionId: 'ed-mb-1a', bookId: 'bk-mb-1a', signatureType: null },
          { editionId: 'ed-mb-1b', bookId: 'bk-mb-1b', signatureType: null },
        ],
      };

      setupBackfill(prisma, skipMock, {
        months: [multiBookMonth],
        purchaseGroupIds: ['pg-multi-1'],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['mb-1'],
      } as any);

      // ONE purchase group for the month (not one per book)
      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledTimes(1);
      // Both books linked to the same purchase group
      expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(2);
      const pgId = 'pg-multi-1';
      expect(prisma.userBookEntry.create).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ data: expect.objectContaining({ purchaseGroupId: pgId }) }),
      );
      expect(prisma.userBookEntry.create).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ data: expect.objectContaining({ purchaseGroupId: pgId }) }),
      );
    });

    it('counts all books across multi-book months in booksAdded', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      // Month 1: 1 book; Month 2: 3 books
      const months = [
        makeMonth('m-1', 2026, 1),
        {
          id: 'm-2',
          year: 2026,
          month: 2,
          signatureType: null,
          books: [
            { editionId: 'ed-2a', bookId: 'bk-2a', signatureType: null },
            { editionId: 'ed-2b', bookId: 'bk-2b', signatureType: null },
            { editionId: 'ed-2c', bookId: 'bk-2c', signatureType: null },
          ],
        },
      ];

      setupBackfill(prisma, skipMock, {
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
      });

      const result = await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2'],
      } as any);

      // 1 + 3 = 4 books total
      expect(result.booksAdded).toBe(4);
      // 2 purchase groups (one per month, regardless of book count)
      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledTimes(2);
    });

    it('creates ONE purchase group per month for multi-book months in a prepaid batch', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      // Two months in a 2-month batch, each with 2 books
      const months = [
        {
          id: 'mb-1',
          year: 2026,
          month: 1,
          signatureType: null,
          books: [
            { editionId: 'ed-1a', bookId: 'bk-1a', signatureType: null },
            { editionId: 'ed-1b', bookId: 'bk-1b', signatureType: null },
          ],
        },
        {
          id: 'mb-2',
          year: 2026,
          month: 2,
          signatureType: null,
          books: [
            { editionId: 'ed-2a', bookId: 'bk-2a', signatureType: null },
            { editionId: 'ed-2b', bookId: 'bk-2b', signatureType: null },
          ],
        },
      ];

      setupBackfill(prisma, skipMock, {
        months,
        purchaseGroupIds: ['pg-1', 'pg-2'],
        billingPeriodId: 'bp-1',
      });

      const result = await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['mb-1', 'mb-2'],
        billingBatches: [{
          monthIds: ['mb-1', 'mb-2'],
          baseAmount: 59.98,
          monthsCovered: 2,
          shippingAmount: 19.98,
          currency: 'USD',
          billedAt: '2026-01-01T00:00:00.000Z',
        }],
      } as any);

      // ONE purchase group per month (2 months) — NOT one per book (4 books)
      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledTimes(2);
      // All 4 books added
      expect(result.booksAdded).toBe(4);
    });
  });

  // ── backfillOwnershipStatus ───────────────────────────────────────────────

  describe('backfillOwnershipStatus', () => {
    it('defaults to OWNED when backfillOwnershipStatus is not provided', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      setupBackfill(prisma, skipMock, { months: [makeMonth('m-1', 2026, 1)], purchaseGroupIds: ['pg-1'] });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ownershipStatus: 'OWNED' }) }),
      );
    });

    it('uses PREORDER when backfillOwnershipStatus=PREORDER is provided', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      setupBackfill(prisma, skipMock, { months: [makeMonth('m-1', 2026, 1)], purchaseGroupIds: ['pg-1'] });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
        backfillOwnershipStatus: 'PREORDER',
      } as any);

      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ownershipStatus: 'PREORDER' }) }),
      );
    });

    it('uses OWNED when backfillOwnershipStatus=OWNED is explicitly provided', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      setupBackfill(prisma, skipMock, { months: [makeMonth('m-1', 2026, 1)], purchaseGroupIds: ['pg-1'] });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
        backfillOwnershipStatus: 'OWNED',
      } as any);

      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ownershipStatus: 'OWNED' }) }),
      );
    });

    it('applies same ownershipStatus to all books in a multi-book month', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const multiBookMonth = {
        id: 'mb-1', year: 2026, month: 3, signatureType: null,
        books: [
          { editionId: 'ed-1a', bookId: 'bk-1a', signatureType: null },
          { editionId: 'ed-1b', bookId: 'bk-1b', signatureType: null },
        ],
      };

      setupBackfill(prisma, skipMock, { months: [multiBookMonth], purchaseGroupIds: ['pg-1'] });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['mb-1'],
        backfillOwnershipStatus: 'PREORDER',
      } as any);

      expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(2);
      expect(prisma.userBookEntry.create).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ data: expect.objectContaining({ ownershipStatus: 'PREORDER' }) }),
      );
      expect(prisma.userBookEntry.create).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ data: expect.objectContaining({ ownershipStatus: 'PREORDER' }) }),
      );
    });
  });

  // ── Cross-currency prepaid ────────────────────────────────────────────────

  describe('cross-currency prepaid', () => {
    it('uses batch.currency for purchase groups when batch currency differs from entry.costCurrency', async () => {
      const sub = makeSub(); // USD subscription
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const months = [
        makeMonth('m-1', 2026, 1),
        makeMonth('m-2', 2026, 2),
        makeMonth('m-3', 2026, 3),
      ];
      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ costCurrency: 'USD', basePrice: { toString: () => '399.00' } }),
        months,
        purchaseGroupIds: ['pg-1', 'pg-2', 'pg-3'],
        billingPeriodId: 'bp-1',
      });

      // User entered PLN prepaid batch (subscription default is USD)
      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1', 'm-2', 'm-3'],
        billingBatches: [{
          billedAt: '2026-01-01',
          baseAmount: 399.00,
          monthsCovered: 3,
          currency: 'PLN',
          monthIds: ['m-1', 'm-2', 'm-3'],
        }],
      } as any);

      const pgCalls = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls;
      expect(pgCalls).toHaveLength(3);
      for (const call of pgCalls) {
        expect(call[0].data.currency).toBe('PLN');
      }

      const periodCalls = (prisma.userSubBillingPeriod.create as jest.Mock).mock.calls;
      expect(periodCalls).toHaveLength(1);
      expect(periodCalls[0][0].data.paidCurrency).toBe('PLN');
    });

    it('falls back to entry.costCurrency when no batch is present', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      setupBackfill(prisma, skipMock, {
        entry: makeEntry({ costCurrency: 'GBP' }),
        months: [makeMonth('m-1', 2026, 1)],
        purchaseGroupIds: ['pg-1'],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      const pgCalls = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls;
      expect(pgCalls).toHaveLength(1);
      expect(pgCalls[0][0].data.currency).toBe('GBP');
    });
  });

  // ── Combo subscription — component is a content stream variant ───────────

  describe('combo subscription — component is a content stream variant', () => {
    const COMBO_SUB_ID = 'combo-sub-1';
    const VARIANT_COMP_ID = 'variant-comp-id';
    const PARENT_STREAM_ID = 'parent-stream-id';
    const COMBO_USER_ID = 'user-combo-1';
    const COMBO_ENTRY_ID = 'combo-entry-1';

    it('fetches months from parent subscription and adds books when combo component is a content stream variant', async () => {
      const comboSub = {
        id: COMBO_SUB_ID,
        slug: 'combo-test',
        name: 'Combo Test',
        isCombo: true,
        componentIds: [VARIANT_COMP_ID],
        currency: 'USD',
        renewalDay: 1,
        renewalDayUserSet: false,
        paymentOnStartup: false,
        signupIncludesCurrentMonth: false,
        renewalMonthOffset: 0,
        isContentStream: false,
        parentSubscriptionId: null,
      };
      jest.spyOn(service, 'findBySlug').mockResolvedValue(comboSub as any);

      const entry = {
        id: COMBO_ENTRY_ID,
        userId: COMBO_USER_ID,
        subscriptionId: COMBO_SUB_ID,
        startDate: '2026-01-01',
        cancellationDate: null,
        renewalDay: 1,
        basePrice: { toString: () => '29.99' },
        costCurrency: 'USD',
        shippingCost: null,
        firstSkipDate: null,
        feeTemplates: [],
      };

      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);

      const parentMonth = {
        id: 'parent-month-jan',
        year: 2026,
        month: 1,
        signatureType: null,
        books: [{ editionId: 'ed-combo-1', bookId: 'bk-combo-1', signatureType: null,
          edition: { book: { authors: [] } } }],
      };

      // resolveEffectiveComponentIds (inside getComboEligibleMonths)
      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: VARIANT_COMP_ID, parentSubscriptionId: PARENT_STREAM_ID },
      ]);
      // getComboEligibleMonths: month record from PARENT stream
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([parentMonth]);

      // resolveEffectiveComponentIds (in backfillSubscription loop)
      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: VARIANT_COMP_ID, parentSubscriptionId: PARENT_STREAM_ID },
      ]);
      // books lookup for COMBO_2026_1 — must use parent stream ID
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([parentMonth]);

      (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-combo-1' });
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: 'be-combo-1' });
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});

      // skip policy lookup
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ id: COMBO_SUB_ID, skipPolicies: [] });
      // skippable months (empty — no skips)
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]);

      skipMock.recomputeSkipState.mockResolvedValueOnce(undefined);

      await service.backfillSubscription(COMBO_USER_ID, 'combo-test', {
        selectedMonthIds: ['COMBO_2026_1'],
      } as any);

      // The books-lookup subscriptionMonth.findMany call (index 1) must use PARENT_STREAM_ID, not VARIANT_COMP_ID
      const monthFindManyCalls = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls;
      const booksLookupCall = monthFindManyCalls[1];
      expect(booksLookupCall[0].where.subscriptionId.in).toContain(PARENT_STREAM_ID);
      expect(booksLookupCall[0].where.subscriptionId.in).not.toContain(VARIANT_COMP_ID);

      // Book was added
      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ editionId: 'ed-combo-1', bookId: 'bk-combo-1' }),
        }),
      );
    });

    it('uses variant ID directly (no redirect) when combo component is a regular subscription', async () => {
      const REGULAR_COMP_ID = 'regular-comp-id';
      const comboSub = {
        id: COMBO_SUB_ID,
        slug: 'combo-test',
        name: 'Combo Test',
        isCombo: true,
        componentIds: [REGULAR_COMP_ID],
        currency: 'USD',
        renewalDay: 1,
        renewalDayUserSet: false,
        paymentOnStartup: false,
        signupIncludesCurrentMonth: false,
        renewalMonthOffset: 0,
        isContentStream: false,
        parentSubscriptionId: null,
      };
      jest.spyOn(service, 'findBySlug').mockResolvedValue(comboSub as any);

      const entry = {
        id: COMBO_ENTRY_ID,
        userId: COMBO_USER_ID,
        subscriptionId: COMBO_SUB_ID,
        startDate: '2026-01-01',
        cancellationDate: null,
        renewalDay: 1,
        basePrice: { toString: () => '29.99' },
        costCurrency: 'USD',
        shippingCost: null,
        firstSkipDate: null,
        feeTemplates: [],
      };

      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);

      const regularMonth = {
        id: 'regular-month-jan',
        year: 2026,
        month: 1,
        signatureType: null,
        books: [{ editionId: 'ed-reg-1', bookId: 'bk-reg-1', signatureType: null,
          edition: { book: { authors: [] } } }],
      };

      // resolveEffectiveComponentIds — no parentSubscriptionId → same ID
      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: REGULAR_COMP_ID, parentSubscriptionId: null },
      ]);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([regularMonth]);

      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: REGULAR_COMP_ID, parentSubscriptionId: null },
      ]);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([regularMonth]);

      (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-reg-1' });
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: 'be-reg-1' });
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ id: COMBO_SUB_ID, skipPolicies: [] });
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]);
      skipMock.recomputeSkipState.mockResolvedValueOnce(undefined);

      await service.backfillSubscription(COMBO_USER_ID, 'combo-test', {
        selectedMonthIds: ['COMBO_2026_1'],
      } as any);

      // Books-lookup call should use REGULAR_COMP_ID (no redirect)
      const monthFindManyCalls = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls;
      const booksLookupCall = monthFindManyCalls[1];
      expect(booksLookupCall[0].where.subscriptionId.in).toContain(REGULAR_COMP_ID);

      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ editionId: 'ed-reg-1', bookId: 'bk-reg-1' }),
        }),
      );
    });
  });
});
