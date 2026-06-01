/**
 * Integration tests for backfillSubscription() with SubscriptionSettingsHistory.
 *
 * These tests verify that per-month settings resolution (via resolveEffectiveSettings)
 * correctly influences the computed renewalDate (purchasedAt) when settings such as
 * renewalDay and renewalMonthOffset changed over the subscription's lifetime.
 *
 * Also covers the bug-fix: entry.renewalDay=null must use sub.renewalDay (fallback),
 * not hardcoded 1.
 *
 * All tests use the non-combo path (isCombo=false) for simplicity. Combo path uses
 * the same resolveEffectiveSettings call and is covered structurally.
 */

import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const SUB_ID = 'sub-backfill-settings';
const SUB_SLUG = 'backfill-test-sub';
const USER_ID = 'user-backfill-1';
const ENTRY_ID = 'entry-backfill-1';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Backfill Test Sub',
    isCombo: false,
    componentIds: [],
    currency: 'EUR',
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
    startDate: '2023-01-01',
    cancellationDate: null,
    renewalDay: null,           // entry-level override (null = use sub-level)
    basePrice: { toString: () => '20.00' },
    costCurrency: 'EUR',
    shippingCost: null,
    firstSkipDate: null,
    feeTemplates: [],
    ...overrides,
  };
}

function makeMonthRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    year: 2024,
    month: 6,
    signatureType: null,
    books: [
      { editionId: 'ed-1', bookId: 'bk-1', signatureType: null },
    ],
    ...overrides,
  };
}

function makeSettingsHistory(records: Array<Record<string, unknown>> = []) {
  return records.map((r, i) => ({
    id: `sh-${i + 1}`,
    subscriptionId: SUB_ID,
    effectiveFrom: new Date('2020-01-01T00:00:00Z'),
    renewalDay: 1,
    renewalDayUserSet: false,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: false,
    renewalMonthOffset: 0,
    changedBy: null,
    ...r,
  }));
}

// ── Setup helper ──────────────────────────────────────────────────────────────

/**
 * Sets up all mocks needed for a single non-combo backfill of one month with one book.
 * Returns mocks for assertion.
 */
function setupNonComboBackfill(
  prisma: DeepMockProxy<PrismaService>,
  skipPolicyEngineMock: { recomputeSkipState: jest.Mock },
  {
    entry = makeEntry(),
    monthRecord = makeMonthRecord(),
    settingsHistory = [] as ReturnType<typeof makeSettingsHistory>,
  } = {},
) {
  // Entry with feeTemplates
  (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);

  // Settings history
  (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValueOnce(settingsHistory);

  // Price changes (empty — not the focus of these tests)
  (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);

  // Selected months
  (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([monthRecord]);

  // Purchase group
  (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });

  // Book entry upsert + ownership history
  (prisma.userBookEntry.upsert as jest.Mock).mockResolvedValueOnce({ id: 'be-1' });
  (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});

  // Skip derivation: subscription with no skip policy
  (prisma.subscription.findUnique as jest.Mock)
    .mockResolvedValueOnce({ id: SUB_ID, skipPolicy: null }); // for skip policy lookup
  // Eligible months for auto-skip derivation: empty — avoids complex skip mocks
  (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]);

  // SkipPolicyEngine
  skipPolicyEngineMock.recomputeSkipState.mockResolvedValueOnce(undefined);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SubscriptionsService — backfill with settings history', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let skipPolicyEngineMock: { recomputeSkipState: jest.Mock };
  let cache: { del: jest.Mock; get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    cache = {
      del: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    skipPolicyEngineMock = { recomputeSkipState: jest.fn() };

    service = new SubscriptionsService(
      prisma,
      {} as any, // TypesenseService
      skipPolicyEngineMock as any,
      {} as any, // RenewalCronService
      {} as any, // UploadService
      {} as any, // CrowdStatsService
      { markStatsStale: jest.fn() } as any, // StatsService
      cache as any,
    );
  });

  // ── No settings history → fallback settings ───────────────────────────────

  describe('no settings history (empty) → uses fallback subscription settings', () => {
    it('uses sub.renewalDay as renewalDate day when no history exists', async () => {
      const sub = makeSub({ renewalDay: 15 });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const month = makeMonthRecord({ year: 2024, month: 6 });
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null }),
        monthRecord: month,
        settingsHistory: [],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date(Date.UTC(2024, 5, 15)), // June 15, 2024
          }),
        }),
      );
    });

    it('uses renewalDay=1 when both entry.renewalDay and sub.renewalDay are null', async () => {
      const sub = makeSub({ renewalDay: null });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const month = makeMonthRecord({ year: 2024, month: 3 });
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null }),
        monthRecord: { ...month, id: 'm-1' },
        settingsHistory: [],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date(Date.UTC(2024, 2, 1)), // March 1, 2024
          }),
        }),
      );
    });
  });

  // ── entry.renewalDay override beats settings history ──────────────────────

  describe('entry.renewalDay overrides settings history', () => {
    it('uses entry.renewalDay when set, ignoring sub.renewalDay and history', async () => {
      const sub = makeSub({ renewalDay: 15 });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const history = makeSettingsHistory([
        { effectiveFrom: new Date('2023-01-01'), renewalDay: 20 },
      ]);
      const month = makeMonthRecord({ year: 2024, month: 6 });
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: 25 }), // entry-level day wins
        monthRecord: month,
        settingsHistory: history,
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date(Date.UTC(2024, 5, 25)), // entry.renewalDay=25 wins
          }),
        }),
      );
    });
  });

  // ── Epoch sentinel: retroactive/archival subscriptions ────────────────────
  //
  // create() inserts a sentinel record with effectiveFrom = new Date(0) (epoch).
  // This ensures months far in the past always find an applicable history record
  // instead of falling back to the current settings.

  describe('settings history — epoch sentinel enables retroactive backfill', () => {
    it('uses epoch sentinel settings for months far in the past (archival subscription)', async () => {
      // Scenario: sub active since 2015, added to DB in 2026.
      // create() inserts sentinel with effectiveFrom=epoch and renewalDay=15.
      // Backfilling 2015-06 must find the sentinel, NOT fall back to current settings.
      const sub = makeSub({ renewalDay: 15 });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const history = makeSettingsHistory([
        { effectiveFrom: new Date(0), renewalDay: 15 }, // epoch sentinel
      ]);
      const month = makeMonthRecord({ id: 'm-1', year: 2015, month: 6 });
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null, startDate: '2015-01-01' }),
        monthRecord: month,
        settingsHistory: history,
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date(Date.UTC(2015, 5, 15)), // epoch sentinel day=15 applied
          }),
        }),
      );
    });

    it('epoch sentinel is used for months before the first explicit change', async () => {
      // Sentinel: renewalDay=15; change in 2020: renewalDay=25.
      // Backfilling 2018-06 (before 2020 change) → epoch sentinel wins (day 15).
      const sub = makeSub({ renewalDay: 25 }); // current = post-change
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const history = makeSettingsHistory([
        { effectiveFrom: new Date(0), renewalDay: 15 },
        { effectiveFrom: new Date('2020-03-01T00:00:00Z'), renewalDay: 25 },
      ]);
      const month = makeMonthRecord({ id: 'm-1', year: 2018, month: 6 });
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null, startDate: '2015-01-01' }),
        monthRecord: month,
        settingsHistory: history,
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date(Date.UTC(2018, 5, 15)), // sentinel day=15
          }),
        }),
      );
    });

    it('epoch sentinel is superseded by a later change for months after the change', async () => {
      // Sentinel: renewalDay=15; change in 2020: renewalDay=25.
      // Backfilling 2022-06 → 2020 record is the most recent before cutoff → day 25.
      const sub = makeSub({ renewalDay: 25 });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const history = makeSettingsHistory([
        { effectiveFrom: new Date(0), renewalDay: 15 },
        { effectiveFrom: new Date('2020-03-01T00:00:00Z'), renewalDay: 25 },
      ]);
      const month = makeMonthRecord({ id: 'm-1', year: 2022, month: 6 });
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null }),
        monthRecord: month,
        settingsHistory: history,
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date(Date.UTC(2022, 5, 25)), // 2020 change wins
          }),
        }),
      );
    });
  });

  // ── Settings history renewalDay resolution ────────────────────────────────

  describe('settings history — renewalDay per-month resolution', () => {
    it('uses historical renewalDay for months that fall after the history record', async () => {
      const sub = makeSub({ renewalDay: 1 }); // current sub renewalDay = 1
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      // History: from 2024-01-01, renewalDay was changed to 20
      const history = makeSettingsHistory([
        { effectiveFrom: new Date('2024-01-01T00:00:00Z'), renewalDay: 20 },
      ]);
      const month = makeMonthRecord({ year: 2024, month: 6 }); // after history record → uses day 20
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null }),
        monthRecord: month,
        settingsHistory: history,
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date(Date.UTC(2024, 5, 20)), // historical day 20
          }),
        }),
      );
    });

    it('uses fallback (current sub.renewalDay) for months before all history records', async () => {
      // The month is 2022-06, but the earliest history record is 2023-01-01.
      // resolveEffectiveSettings returns fallback for months before the earliest record.
      const sub = makeSub({ renewalDay: 5 }); // current sub renewalDay = fallback
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      // History: changed in 2023, but we're backfilling 2022
      const history = makeSettingsHistory([
        { effectiveFrom: new Date('2023-01-15T00:00:00Z'), renewalDay: 20 },
      ]);
      const month = makeMonthRecord({ id: 'm-1', year: 2022, month: 6 }); // before history
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null, startDate: '2022-01-01' }),
        monthRecord: month,
        settingsHistory: history,
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // cutoff for 2022-06 is 2022-06-30 → no history record precedes it → fallback day 5
            purchasedAt: new Date(Date.UTC(2022, 5, 5)),
          }),
        }),
      );
    });

    it('picks the most recent history record that precedes the month when multiple records exist', async () => {
      const sub = makeSub({ renewalDay: 1 });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      // Three history records — 2024-06 month should use the 2024-03 record (day=12)
      const history = makeSettingsHistory([
        { effectiveFrom: new Date('2024-07-01T00:00:00Z'), renewalDay: 25 }, // after month
        { effectiveFrom: new Date('2024-03-01T00:00:00Z'), renewalDay: 12 }, // most recent before
        { effectiveFrom: new Date('2023-01-01T00:00:00Z'), renewalDay: 8  }, // older
      ]);
      const month = makeMonthRecord({ id: 'm-1', year: 2024, month: 6 });
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null }),
        monthRecord: month,
        settingsHistory: history,
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date(Date.UTC(2024, 5, 12)), // 2024-03 record wins
          }),
        }),
      );
    });
  });

  // ── Settings history renewalMonthOffset resolution ────────────────────────

  describe('settings history — renewalMonthOffset per-month resolution', () => {
    it('shifts purchasedAt back by offset months when renewalMonthOffset=1', async () => {
      // offset=1 means renewal day is in the PREVIOUS month relative to the subscription month
      const sub = makeSub({ renewalDay: 10, renewalMonthOffset: 1 });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const history = makeSettingsHistory([
        { effectiveFrom: new Date('2023-01-01T00:00:00Z'), renewalDay: 10, renewalMonthOffset: 1 },
      ]);
      const month = makeMonthRecord({ id: 'm-1', year: 2024, month: 6 }); // offset=1 → renewal in May
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null }),
        monthRecord: month,
        settingsHistory: history,
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date(Date.UTC(2024, 4, 10)), // May 10, 2024 (June - 1 month)
          }),
        }),
      );
    });

    it('wraps month back to previous year when offset pushes January into December', async () => {
      const sub = makeSub({ renewalDay: 5, renewalMonthOffset: 1 });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const history = makeSettingsHistory([
        { effectiveFrom: new Date('2023-01-01T00:00:00Z'), renewalDay: 5, renewalMonthOffset: 1 },
      ]);
      const month = makeMonthRecord({ id: 'm-1', year: 2024, month: 1 }); // Jan - offset=1 → Dec 2023
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null }),
        monthRecord: month,
        settingsHistory: history,
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date(Date.UTC(2023, 11, 5)), // December 5, 2023
          }),
        }),
      );
    });

    it('uses offset=0 from history for months before offset change — no shift', async () => {
      // Before 2024-06, offset was 0 (from history). After, offset=1.
      // Backfilling 2023-12 should use offset=0.
      const sub = makeSub({ renewalDay: 10, renewalMonthOffset: 1 }); // current
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      const history = makeSettingsHistory([
        // Changed to offset=1 in 2024-06 → months before that use fallback (current sub)
        // Wait — months BEFORE all history use fallback. Months AFTER use history record.
        // So to test a month using offset=0 via history, we need a record with offset=0 before the month.
        { effectiveFrom: new Date('2022-01-01T00:00:00Z'), renewalDay: 10, renewalMonthOffset: 0 },
        { effectiveFrom: new Date('2024-06-01T00:00:00Z'), renewalDay: 10, renewalMonthOffset: 1 },
      ]);
      const month = makeMonthRecord({ id: 'm-1', year: 2023, month: 12 }); // between the two records → offset=0
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null }),
        monthRecord: month,
        settingsHistory: history,
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date(Date.UTC(2023, 11, 10)), // December 10, 2023 (no offset)
          }),
        }),
      );
    });
  });

  // ── paymentOnStartup: earliest month uses startDate ───────────────────────

  describe('settings history — paymentOnStartup via fallback settings', () => {
    it('uses entry.startDate as purchasedAt for the earliest month when paymentOnStartup=true', async () => {
      const sub = makeSub({ renewalDay: 15, paymentOnStartup: true });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

      // No history — fallbackSettings.paymentOnStartup = true
      const month = makeMonthRecord({ id: 'm-1', year: 2023, month: 2 });
      setupNonComboBackfill(prisma, skipPolicyEngineMock, {
        entry: makeEntry({ renewalDay: null, startDate: '2023-01-15' }),
        monthRecord: month,
        settingsHistory: [],
      });

      await service.backfillSubscription(USER_ID, SUB_SLUG, {
        selectedMonthIds: ['m-1'],
      } as any);

      // Only one month selected → it is the "earliest" → should use entry.startDate
      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasedAt: new Date('2023-01-15'),
          }),
        }),
      );
    });
  });

  // ── NotFoundException ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws NotFoundException when entry does not exist', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.backfillSubscription(USER_ID, SUB_SLUG, { selectedMonthIds: [] } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when subscription does not exist', async () => {
      jest.spyOn(service, 'findBySlug').mockRejectedValue(new NotFoundException());

      await expect(
        service.backfillSubscription(USER_ID, SUB_SLUG, { selectedMonthIds: [] } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
