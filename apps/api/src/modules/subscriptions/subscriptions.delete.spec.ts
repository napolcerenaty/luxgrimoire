/**
 * Unit tests for SubscriptionsService.removeMySubscription()
 *
 * Covers all deletion scenarios from the "My Subscriptions" delete feature:
 * - Active subscription, no history
 * - Cancelled subscription with single history record
 * - Cancelled subscription with multiple history records (select one, multiple, all)
 * - Active subscription with history (select one period, multiple, all, removeCurrentOnly)
 *
 * Uses jest-mock-extended to mock PrismaService. findBySlug is spied on.
 * crowdStatsService.decrementSubscriberCount is spied to avoid side-effects.
 */

import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const SUB_ID = 'sub-delete-1';
const SUB_SLUG = 'delete-test-sub';
const USER_ID = 'user-delete-1';
const ENTRY_ID = 'entry-delete-1';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Delete Test Sub',
    isCombo: false,
    componentIds: [],
    currency: 'GBP',
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
    active: true,
    startDate: '2024-01-01',
    cancellationDate: null,
    basePrice: '20.00',
    costCurrency: 'GBP',
    billingPeriods: [],
    ...overrides,
  };
}

function makeHistoryRecord(id: string, startDate: string, endDate: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    entryId: ENTRY_ID,
    startDate,
    endDate,
    cancellationReason: null,
    ...overrides,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

describe('SubscriptionsService — removeMySubscription', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let cache: { del: jest.Mock; get: jest.Mock; set: jest.Mock };
  let crowdStatsMock: { decrementSubscriberCount: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    cache = {
      del: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    crowdStatsMock = {
      decrementSubscriberCount: jest.fn().mockResolvedValue(undefined),
    };

    service = new SubscriptionsService(
      prisma,
      {} as any, // TypesenseService
      {} as any, // SkipPolicyEngine
      {} as any, // RenewalCronService
      {} as any, // UploadService
      crowdStatsMock as any,
      cache as any,
    );
  });

  function setupBaseEntry(entryOverrides: Record<string, unknown> = {}) {
    const sub = makeSub();
    const entry = makeEntry(entryOverrides);
    jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);
    (prisma.userSubscriptionSkipState.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    (prisma.userSubscriptionMembershipHistory.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    (prisma.userSubscriptionMembershipHistory.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    (prisma.userSubscriptionEntry.delete as jest.Mock).mockResolvedValueOnce({ id: ENTRY_ID });
    return { sub, entry };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Case: Active subscription, no history
  // ══════════════════════════════════════════════════════════════════════════

  describe('active subscription with no history', () => {
    it('removes the entry and decrements subscriber count', async () => {
      setupBaseEntry({ active: true });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
      });

      expect(prisma.userSubscriptionEntry.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_subscriptionId: { userId: USER_ID, subscriptionId: SUB_ID } },
        }),
      );
      expect(crowdStatsMock.decrementSubscriberCount).toHaveBeenCalledWith(SUB_ID);
    });

    it('removes books when removeBooks=true', async () => {
      setupBaseEntry({ active: true });
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.userBookEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: true,
        removeSpending: false,
      });

      expect(prisma.userBookEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID, subscriptionEntryId: ENTRY_ID }),
        }),
      );
    });

    it('removes spending when removeSpending=true', async () => {
      const entry = makeEntry({ active: true, billingPeriods: [{ id: 'bp-1', purchaseTransactionId: 'tx-1' }] });
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);
      (prisma.purchaseTransaction.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
      (prisma.userSubscriptionSkipState.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionMembershipHistory.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionEntry.delete as jest.Mock).mockResolvedValueOnce({ id: ENTRY_ID });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: true,
      });

      expect(prisma.purchaseTransaction.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['tx-1'] } },
        }),
      );
    });

    it('throws NotFoundException when user has no subscription entry', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.removeMySubscription(USER_ID, SUB_SLUG, { removeBooks: false, removeSpending: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case: Single historical record only (cancelled, no active)
  // ══════════════════════════════════════════════════════════════════════════

  describe('cancelled subscription with single history record', () => {
    it('removes the entry (auto-created history for cancelled period is also cleaned up)', async () => {
      setupBaseEntry({ active: false, startDate: '2023-01-01', cancellationDate: '2023-12-31' });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
      });

      expect(prisma.userSubscriptionEntry.delete).toHaveBeenCalled();
      // Should clean up the auto-created history record for this cancelled period
      expect(prisma.userSubscriptionMembershipHistory.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: USER_ID,
            subscriptionId: SUB_ID,
            startDate: '2023-01-01',
          }),
        }),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 1.1 — Many history records, no active: select one period
  // ══════════════════════════════════════════════════════════════════════════

  describe('case 1.1: multiple history records, remove single period', () => {
    it('removes only the specified history record, does not delete the entry', async () => {
      const sub = makeSub();
      const entry = makeEntry({ active: false, cancellationDate: '2023-12-31' });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);
      (prisma.userSubscriptionMembershipHistory.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        historyId: 'hist-1',
      });

      expect(prisma.userSubscriptionMembershipHistory.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'hist-1', userId: USER_ID },
        }),
      );
      // Entry itself should NOT be deleted
      expect(prisma.userSubscriptionEntry.delete).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 1.2 — Many history records, no active: select multiple (not all)
  // ══════════════════════════════════════════════════════════════════════════

  describe('case 1.2: multiple history records, remove multiple specific periods', () => {
    it('removes all specified history records by historyIds array, does not delete the entry', async () => {
      const sub = makeSub();
      const entry = makeEntry({ active: false });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);
      (prisma.userSubscriptionMembershipHistory.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        historyIds: ['hist-1', 'hist-2'],
      });

      expect(prisma.userSubscriptionMembershipHistory.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['hist-1', 'hist-2'] }, userId: USER_ID },
        }),
      );
      expect(prisma.userSubscriptionEntry.delete).not.toHaveBeenCalled();
    });

    it('removes books for each selected period when removeBooks=true', async () => {
      const sub = makeSub();
      const entry = makeEntry({ active: false });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);
      // Book removal queries for each history period (2 periods)
      const histRecord1 = makeHistoryRecord('hist-1', '2022-01-01', '2022-12-31');
      const histRecord2 = makeHistoryRecord('hist-2', '2023-01-01', '2023-12-31');
      (prisma.userSubscriptionMembershipHistory.findFirst as jest.Mock)
        .mockResolvedValueOnce(histRecord1)
        .mockResolvedValueOnce(histRecord2);
      (prisma.subscriptionMonth.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // no months in range for period 1
        .mockResolvedValueOnce([]); // no months in range for period 2
      (prisma.userSubscriptionMembershipHistory.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: true,
        removeSpending: false,
        historyIds: ['hist-1', 'hist-2'],
      });

      // Should look up each history record for date range
      expect(prisma.userSubscriptionMembershipHistory.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.userSubscriptionMembershipHistory.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['hist-1', 'hist-2'] }, userId: USER_ID },
        }),
      );
      expect(prisma.userSubscriptionEntry.delete).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 1.3/1.4 — Many history records, no active: remove all (removeAllPeriods)
  // ══════════════════════════════════════════════════════════════════════════

  describe('case 1.3/1.4: multiple history records, remove all periods', () => {
    it('removes all history records and the entry when removeAllPeriods=true', async () => {
      setupBaseEntry({ active: false, cancellationDate: '2023-12-31' });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        removeAllPeriods: true,
      });

      expect(prisma.userSubscriptionMembershipHistory.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, subscriptionId: SUB_ID },
        }),
      );
      expect(prisma.userSubscriptionEntry.delete).toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 2.1 — Active subscription + history: remove single history period
  // ══════════════════════════════════════════════════════════════════════════

  describe('case 2.1: active subscription with history, remove single history period', () => {
    it('removes only the specified history record, active entry is untouched', async () => {
      const sub = makeSub();
      const entry = makeEntry({ active: true });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);
      (prisma.userSubscriptionMembershipHistory.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        historyId: 'hist-old-1',
      });

      expect(prisma.userSubscriptionMembershipHistory.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'hist-old-1', userId: USER_ID },
        }),
      );
      expect(prisma.userSubscriptionEntry.delete).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 2.2 — Active subscription + history: remove multiple specific history periods
  // ══════════════════════════════════════════════════════════════════════════

  describe('case 2.2: active subscription with history, remove multiple specific history periods', () => {
    it('removes specified history records by historyIds, active entry is untouched', async () => {
      const sub = makeSub();
      const entry = makeEntry({ active: true });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);
      (prisma.userSubscriptionMembershipHistory.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        historyIds: ['hist-old-1', 'hist-old-2'],
      });

      expect(prisma.userSubscriptionMembershipHistory.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['hist-old-1', 'hist-old-2'] }, userId: USER_ID },
        }),
      );
      expect(prisma.userSubscriptionEntry.delete).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 2.3 — Active subscription + history: remove all history, keep active
  // ══════════════════════════════════════════════════════════════════════════

  describe('case 2.3: active subscription with history, remove all history periods only', () => {
    it('removes all history records without removeAllPeriods by sending historyIds for all', async () => {
      // This is handled the same as case 1.2 — historyIds covering all history records.
      // The entry is NOT deleted since neither removeAllPeriods nor removeCurrentOnly is set.
      const sub = makeSub();
      const entry = makeEntry({ active: true });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);
      (prisma.userSubscriptionMembershipHistory.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 3 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        historyIds: ['hist-1', 'hist-2', 'hist-3'],
      });

      expect(prisma.userSubscriptionMembershipHistory.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['hist-1', 'hist-2', 'hist-3'] }, userId: USER_ID },
        }),
      );
      expect(prisma.userSubscriptionEntry.delete).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 2.4 — Active subscription + history: remove everything (removeAllPeriods)
  // ══════════════════════════════════════════════════════════════════════════

  describe('case 2.4: active subscription, remove all including current (removeAllPeriods)', () => {
    it('removes all history records and the entry, decrements subscriber count', async () => {
      setupBaseEntry({ active: true });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        removeAllPeriods: true,
      });

      expect(prisma.userSubscriptionMembershipHistory.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, subscriptionId: SUB_ID },
        }),
      );
      expect(prisma.userSubscriptionEntry.delete).toHaveBeenCalled();
      expect(crowdStatsMock.decrementSubscriberCount).toHaveBeenCalledWith(SUB_ID);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Case 2.5 — Active subscription: remove only current period (keep history)
  // ══════════════════════════════════════════════════════════════════════════

  describe('case 2.5: active subscription, remove current period only (removeCurrentOnly)', () => {
    it('detaches history records (entryId→null) and deletes the entry, decrements count', async () => {
      setupBaseEntry({ active: true });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        removeCurrentOnly: true,
      });

      // History records should be detached (entryId set to null), not deleted
      expect(prisma.userSubscriptionMembershipHistory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entryId: ENTRY_ID, userId: USER_ID },
          data: { entryId: null },
        }),
      );
      // History records should NOT be deleted
      expect(prisma.userSubscriptionMembershipHistory.deleteMany).not.toHaveBeenCalled();
      // Entry is deleted (but history survives as orphaned)
      expect(prisma.userSubscriptionEntry.delete).toHaveBeenCalled();
      expect(crowdStatsMock.decrementSubscriberCount).toHaveBeenCalledWith(SUB_ID);
    });

    it('removes books linked to current period when removeBooks=true', async () => {
      const sub = makeSub();
      const entry = makeEntry({ active: true });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.userBookEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionSkipState.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionMembershipHistory.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionEntry.delete as jest.Mock).mockResolvedValueOnce({ id: ENTRY_ID });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: true,
        removeSpending: false,
        removeCurrentOnly: true,
      });

      expect(prisma.userBookEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID, subscriptionEntryId: ENTRY_ID }),
        }),
      );
    });
  });
});
