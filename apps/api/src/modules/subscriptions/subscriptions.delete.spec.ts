/**
 * Unit tests for SubscriptionsService.removeMySubscription()
 *
 * After the subscription-entry-per-period refactor:
 * - historyId/historyIds refer to INACTIVE entry IDs (not history table rows)
 * - removeCurrentOnly deletes the active entry only (no history detach)
 * - removeAllPeriods uses deleteMany on all entries
 * - No userSubscriptionMembershipHistory table
 */

import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const SUB_ID = 'sub-delete-1';
const SUB_SLUG = 'delete-test-sub';
const USER_ID = 'user-delete-1';
const ENTRY_ID = 'entry-delete-1';
const INACTIVE_ID_1 = 'inactive-1';
const INACTIVE_ID_2 = 'inactive-2';

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID, slug: SUB_SLUG, name: 'Delete Test Sub', isCombo: false, componentIds: [],
    currency: 'GBP', renewalDay: 1, renewalDayUserSet: false, paymentOnStartup: false,
    signupIncludesCurrentMonth: false, renewalMonthOffset: 0, isContentStream: false, ...overrides,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID, userId: USER_ID, subscriptionId: SUB_ID, active: true,
    startDate: '2024-01-01', cancellationDate: null, basePrice: '20.00', costCurrency: 'GBP',
    billingPeriods: [], ...overrides,
  };
}

function makeInactiveEntry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, userId: USER_ID, subscriptionId: SUB_ID, active: false,
    startDate: '2023-01-01', cancellationDate: '2023-12-31', basePrice: '18.00', costCurrency: 'GBP',
    billingPeriods: [], ...overrides,
  };
}

describe('SubscriptionsService — removeMySubscription', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let cache: { del: jest.Mock; get: jest.Mock; set: jest.Mock };
  let crowdStatsMock: { decrementSubscriberCount: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    cache = { del: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    crowdStatsMock = { decrementSubscriberCount: jest.fn().mockResolvedValue(undefined) };
    service = new SubscriptionsService(prisma, {} as any, {} as any, {} as any, {} as any, crowdStatsMock as any, { markStatsStale: jest.fn() } as any, cache as any);
  });

  function setupFindMany(entries: ReturnType<typeof makeEntry>[]) {
    (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce(entries);
    (prisma.userSubscriptionSkipState.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    (prisma.userSubscriptionEntry.delete as jest.Mock).mockResolvedValueOnce({ id: ENTRY_ID });
    (prisma.userSubscriptionEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: entries.length });
  }

  describe('active subscription with no historical periods', () => {
    it('deletes the entry and decrements subscriber count', async () => {
      const sub = makeSub();
      const entry = makeEntry({ active: true });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      setupFindMany([entry]);

      await service.removeMySubscription(USER_ID, SUB_SLUG, { removeBooks: false, removeSpending: false });

      expect(prisma.userSubscriptionEntry.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ENTRY_ID } }),
      );
      expect(crowdStatsMock.decrementSubscriberCount).toHaveBeenCalledWith(SUB_ID);
    });

    it('removes books when removeBooks=true', async () => {
      const sub = makeSub();
      const entry = makeEntry({ active: true });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      setupFindMany([entry]);
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.userBookEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, { removeBooks: true, removeSpending: false });

      expect(prisma.userBookEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: USER_ID, subscriptionEntryId: ENTRY_ID }) }),
      );
    });

    it('removes spending when removeSpending=true', async () => {
      const sub = makeSub();
      const entry = makeEntry({ active: true, billingPeriods: [{ id: 'bp-1', purchaseTransactionId: 'tx-1' }] });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);
      (prisma.purchaseTransaction.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
      (prisma.userSubscriptionSkipState.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionEntry.delete as jest.Mock).mockResolvedValueOnce({ id: ENTRY_ID });

      await service.removeMySubscription(USER_ID, SUB_SLUG, { removeBooks: false, removeSpending: true });

      expect(prisma.purchaseTransaction.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['tx-1'] } } }),
      );
    });

    it('throws NotFoundException when user has no subscription entries', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        service.removeMySubscription(USER_ID, SUB_SLUG, { removeBooks: false, removeSpending: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelled subscription with single inactive entry', () => {
    it('deletes the inactive entry (no history table to clean up)', async () => {
      const sub = makeSub();
      const entry = makeEntry({ active: false, cancellationDate: '2023-12-31' });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      setupFindMany([entry]);

      await service.removeMySubscription(USER_ID, SUB_SLUG, { removeBooks: false, removeSpending: false });

      expect(prisma.userSubscriptionEntry.delete).toHaveBeenCalled();
      expect(crowdStatsMock.decrementSubscriberCount).not.toHaveBeenCalled();
    });
  });

  describe('case 1.1: multiple inactive entries, remove single period by historyId', () => {
    it('deletes only the specified inactive entry (by id), does not touch others', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        historyId: INACTIVE_ID_1,
      });

      expect(prisma.userSubscriptionEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [INACTIVE_ID_1] }, userId: USER_ID } }),
      );
      expect(prisma.userSubscriptionEntry.findMany).not.toHaveBeenCalled();
      expect(prisma.userSubscriptionSkipState.deleteMany).not.toHaveBeenCalled();
      expect(prisma.userSubscriptionEntry.delete).not.toHaveBeenCalled();
      expect(crowdStatsMock.decrementSubscriberCount).not.toHaveBeenCalled();
    });
  });

  describe('case 1.2: multiple inactive entries, remove multiple specific periods', () => {
    it('deletes all specified inactive entries by historyIds array', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        historyIds: [INACTIVE_ID_1, INACTIVE_ID_2],
      });

      expect(prisma.userSubscriptionEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [INACTIVE_ID_1, INACTIVE_ID_2] }, userId: USER_ID } }),
      );
    });

    it('removes books for selected periods when removeBooks=true', async () => {
      const sub = makeSub();
      const inact1 = makeInactiveEntry(INACTIVE_ID_1);
      const inact2 = makeInactiveEntry(INACTIVE_ID_2, { startDate: '2023-06-01', cancellationDate: '2024-01-01' });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([inact1, inact2]);
      (prisma.userBookEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (prisma.userBookEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.userSubscriptionEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: true,
        removeSpending: false,
        historyIds: [INACTIVE_ID_1, INACTIVE_ID_2],
      });

      expect(prisma.userBookEntry.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.userSubscriptionEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [INACTIVE_ID_1, INACTIVE_ID_2] }, userId: USER_ID } }),
      );
    });
  });

  describe('case 1.3/1.4: multiple inactive entries, remove all (removeAllPeriods)', () => {
    it('uses deleteMany for all entries when removeAllPeriods=true, does NOT decrement subscriber count', async () => {
      const sub = makeSub();
      const inact1 = makeInactiveEntry(INACTIVE_ID_1);
      const inact2 = makeInactiveEntry(INACTIVE_ID_2);
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([inact1, inact2]);
      (prisma.userSubscriptionSkipState.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        removeAllPeriods: true,
      });

      expect(prisma.userSubscriptionEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, subscriptionId: SUB_ID } }),
      );
      expect(crowdStatsMock.decrementSubscriberCount).not.toHaveBeenCalled();
    });
  });

  describe('case 2.1: active subscription with inactive entries, remove single past period', () => {
    it('deletes only the specified inactive entry by historyId, active entry is untouched', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        historyId: INACTIVE_ID_1,
      });

      expect(prisma.userSubscriptionEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [INACTIVE_ID_1] }, userId: USER_ID } }),
      );
      expect(prisma.userSubscriptionEntry.delete).not.toHaveBeenCalled();
      expect(crowdStatsMock.decrementSubscriberCount).not.toHaveBeenCalled();
    });
  });

  describe('case 2.2: active subscription with inactive entries, remove multiple specific past periods', () => {
    it('deletes specified inactive entries, active entry is untouched', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        historyIds: [INACTIVE_ID_1, INACTIVE_ID_2],
      });

      expect(prisma.userSubscriptionEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [INACTIVE_ID_1, INACTIVE_ID_2] }, userId: USER_ID } }),
      );
      expect(prisma.userSubscriptionEntry.delete).not.toHaveBeenCalled();
    });
  });

  describe('case 2.3: active subscription with inactive entries, remove all past periods via historyIds', () => {
    it('deletes all specified inactive entries, active entry is untouched', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 3 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        historyIds: [INACTIVE_ID_1, INACTIVE_ID_2, 'inactive-3'],
      });

      expect(prisma.userSubscriptionEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [INACTIVE_ID_1, INACTIVE_ID_2, 'inactive-3'] }, userId: USER_ID },
        }),
      );
      expect(prisma.userSubscriptionEntry.delete).not.toHaveBeenCalled();
    });
  });

  describe('case 2.4: active subscription, remove all including current (removeAllPeriods)', () => {
    it('deletes all entries, decrements subscriber count', async () => {
      const sub = makeSub();
      const activeEntry = makeEntry({ active: true });
      const inactiveEntry = makeInactiveEntry(INACTIVE_ID_1);
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([activeEntry, inactiveEntry]);
      (prisma.userSubscriptionSkipState.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        removeAllPeriods: true,
      });

      expect(prisma.userSubscriptionEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, subscriptionId: SUB_ID } }),
      );
      expect(crowdStatsMock.decrementSubscriberCount).toHaveBeenCalledWith(SUB_ID);
    });
  });

  describe('case 2.5: active subscription, remove current period only (removeCurrentOnly)', () => {
    it('deletes active entry and decrements subscriber count', async () => {
      const sub = makeSub();
      const activeEntry = makeEntry({ active: true });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(activeEntry);
      (prisma.userSubscriptionSkipState.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionEntry.delete as jest.Mock).mockResolvedValueOnce({ id: ENTRY_ID });

      await service.removeMySubscription(USER_ID, SUB_SLUG, {
        removeBooks: false,
        removeSpending: false,
        removeCurrentOnly: true,
      });

      expect(prisma.userSubscriptionEntry.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ENTRY_ID } }),
      );
      expect(prisma.userSubscriptionEntry.deleteMany).not.toHaveBeenCalled();
      expect(crowdStatsMock.decrementSubscriberCount).toHaveBeenCalledWith(SUB_ID);
    });

    it('removes books linked to current period when removeBooks=true', async () => {
      const sub = makeSub();
      const activeEntry = makeEntry({ active: true });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(activeEntry);
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.userBookEntry.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionSkipState.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
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

    it('throws NotFoundException when no active entry found', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.removeMySubscription(USER_ID, SUB_SLUG, { removeBooks: false, removeSpending: false, removeCurrentOnly: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
