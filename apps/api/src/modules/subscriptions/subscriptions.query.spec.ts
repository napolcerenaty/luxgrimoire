/**
 * Unit tests for SubscriptionsService query methods:
 *   - getMySubscriptions
 *   - getOrphanedMembershipHistory
 *   - getMySubscriptionEntry
 *   - updateMyEntryCosts
 */

import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const SUB_ID = 'sub-q-1';
const SUB_SLUG = 'query-test-sub';
const USER_ID = 'user-q-1';
const ENTRY_ID = 'entry-q-1';
const HISTORY_ID_1 = 'hist-q-1';
const HISTORY_ID_2 = 'hist-q-2';

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Query Test Sub',
    currency: 'GBP',
    isDiscontinued: false,
    paymentOnStartup: false,
    renewalDay: 1,
    intervalMonths: 1,
    startingMonth: null,
    coverImage: null,
    logoUrl: null,
    priceChanges: [],
    company: { name: 'Test Co', slug: 'test-co', brandColors: null },
    ...overrides,
  };
}

function makeEntryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    active: true,
    startDate: '2024-01-01',
    cancellationDate: null,
    cancellationReason: null,
    renewalDay: 1,
    nextRenewalDate: new Date('2025-02-01'),
    costCurrency: 'GBP',
    basePrice: '20.00',
    shippingCost: null,
    scheduledPrepayOptionId: null,
    scheduledPrepayOption: null,
    skipRecords: [],
    feeTemplates: [],
    subscription: makeSub(),
    ...overrides,
  };
}

function makeHistoryRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    active: false,
    startDate: '2023-01-01',
    cancellationDate: '2023-12-31',
    cancellationReason: null,
    subscription: makeSub(),
    ...overrides,
  };
}

describe('SubscriptionsService — query methods', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();

    service = new SubscriptionsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { incrementSubscriberCount: jest.fn(), decrementSubscriberCount: jest.fn() } as any,
      { markStatsStale: jest.fn() } as any,
      { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any,
    );
  });

  describe('getMySubscriptions', () => {
    it('returns active subscriptions with subscription details', async () => {
      const entry = makeEntryRow({ active: true });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID, true);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(ENTRY_ID);
      expect(result[0].active).toBe(true);
      expect(result[0].subscription.id).toBe(SUB_ID);
    });

    it('returns cancelled subscriptions', async () => {
      const entry = makeEntryRow({
        active: false,
        cancellationDate: '2024-06-30',
        nextRenewalDate: null,
      });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID, false);

      expect(result).toHaveLength(1);
      expect(result[0].active).toBe(false);
      expect(result[0].cancellationDate).toBe('2024-06-30');
    });

    it('returns all subscriptions when no filter given', async () => {
      const active = makeEntryRow({ active: true });
      const cancelled = makeEntryRow({
        id: 'entry-q-2',
        active: false,
        cancellationDate: '2024-06-30',
        nextRenewalDate: null,
      });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([active, cancelled]);

      const result = await service.getMySubscriptions(USER_ID);
      expect(result).toHaveLength(2);
    });

    it('does not include membershipHistory field on each entry', async () => {
      const entry = makeEntryRow({ active: true, startDate: '2024-01-01' });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID);
      expect(result[0]).not.toHaveProperty('membershipHistory');
    });

    it('returns empty array when user has no subscriptions', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);
      const result = await service.getMySubscriptions(USER_ID);
      expect(result).toEqual([]);
    });

    it('includes nextRenewalDate from stored value', async () => {
      const renewalDate = new Date('2025-02-01');
      const entry = makeEntryRow({ nextRenewalDate: renewalDate });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID);
      expect(result[0].nextRenewalDate).toBe(renewalDate.toISOString());
    });

    it('includes computed nextRenewalAmount', async () => {
      const entry = makeEntryRow({ basePrice: '20.00', shippingCost: '5.00', costCurrency: 'GBP' });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID);
      expect(parseFloat(result[0].nextRenewalAmount ?? '0')).toBe(25);
    });
  });

  describe('getOrphanedMembershipHistory', () => {
    it('returns empty array when no orphaned records', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getOrphanedMembershipHistory(USER_ID);
      expect(result).toEqual([]);
    });

    it('returns orphaned inactive entries grouped by subscription', async () => {
      const SUB_ID_2 = 'sub-q-2';
      const records = [
        makeHistoryRecord(HISTORY_ID_1, { subscriptionId: SUB_ID }),
        makeHistoryRecord(HISTORY_ID_2, { subscriptionId: SUB_ID }),
        makeHistoryRecord('hist-q-3', {
          subscriptionId: SUB_ID_2,
          subscription: { ...makeSub(), id: SUB_ID_2 },
        }),
      ];
      (prisma.userSubscriptionEntry.findMany as jest.Mock)
        .mockResolvedValueOnce(records)
        .mockResolvedValueOnce([]);

      const result = await service.getOrphanedMembershipHistory(USER_ID);

      expect(result).toHaveLength(2);
      const group1 = result.find(g => g.subscription.id === SUB_ID);
      expect(group1?.records).toHaveLength(2);
      const group2 = result.find(g => g.subscription.id === SUB_ID_2);
      expect(group2?.records).toHaveLength(1);
    });

    it('queries inactive entries for the user', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getOrphanedMembershipHistory(USER_ID);

      expect(prisma.userSubscriptionEntry.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { userId: USER_ID, active: false },
        }),
      );
      expect(prisma.userSubscriptionEntry.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { userId: USER_ID, active: true },
        }),
      );
    });
  });

  describe('getMySubscriptionEntry', () => {
    it('returns entry for subscribed user', async () => {
      const entry = {
        id: ENTRY_ID,
        active: true,
        startDate: '2024-01-01',
        nextRenewalDate: new Date('2025-02-01'),
        feeTemplates: [],
        skipRecords: [],
        subscription: makeSub(),
      };
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);

      const result = await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(ENTRY_ID);
    });

    it('returns null for non-subscribed user', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);
      expect(result).toBeNull();
    });

    it('uses userId and subscriptionId with active:true to find entry', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);

      expect(prisma.userSubscriptionEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, subscriptionId: SUB_ID, active: true },
        }),
      );
    });

    it('includes nextRenewalDate as ISO string', async () => {
      const renewalDate = new Date('2025-03-01');
      const entry = {
        id: ENTRY_ID,
        active: true,
        startDate: '2024-01-01',
        nextRenewalDate: renewalDate,
        feeTemplates: [],
        skipRecords: [],
      };
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);

      const result = await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);
      expect(result?.nextRenewalDate).toBe(renewalDate.toISOString());
    });
  });

  describe('updateMyEntryCosts', () => {
    function setupForUpdate(entryOverrides: Record<string, unknown> = {}) {
      const sub = makeSub();
      const entry = { id: ENTRY_ID, userId: USER_ID, subscriptionId: SUB_ID, active: true, ...entryOverrides };
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock)
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce({
          ...entry,
          feeTemplates: [],
          skipRecords: [],
          nextRenewalDate: new Date('2025-02-01'),
        });
      (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValueOnce(entry);
      return { sub, entry };
    }

    it('updates basePrice on the entry', async () => {
      setupForUpdate();
      await service.updateMyEntryCosts(USER_ID, SUB_SLUG, { basePrice: '25.00' });
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ basePrice: '25.00' }),
        }),
      );
    });

    it('updates shippingCost on the entry', async () => {
      setupForUpdate();
      await service.updateMyEntryCosts(USER_ID, SUB_SLUG, { shippingCost: '3.50' });
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ shippingCost: '3.50' }),
        }),
      );
    });

    it('updates costCurrency on the entry', async () => {
      setupForUpdate();
      await service.updateMyEntryCosts(USER_ID, SUB_SLUG, { costCurrency: 'USD' });
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ costCurrency: 'USD' }),
        }),
      );
    });

    it('replaces fee templates when provided', async () => {
      setupForUpdate();
      (prisma.userSubscriptionEntryFeeTemplate.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionEntryFeeTemplate.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      await service.updateMyEntryCosts(USER_ID, SUB_SLUG, {
        linkedFeeTemplates: [{ templateId: 'tmpl-1', customAmount: 5 }],
      });

      expect(prisma.userSubscriptionEntryFeeTemplate.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { subscriptionEntryId: ENTRY_ID } }),
      );
      expect(prisma.userSubscriptionEntryFeeTemplate.createMany).toHaveBeenCalled();
    });

    it('throws NotFoundException when user has no entry', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.updateMyEntryCosts(USER_ID, SUB_SLUG, { basePrice: '25.00' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('clears fee templates when empty array provided', async () => {
      setupForUpdate();
      (prisma.userSubscriptionEntryFeeTemplate.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      await service.updateMyEntryCosts(USER_ID, SUB_SLUG, { linkedFeeTemplates: [] });

      expect(prisma.userSubscriptionEntryFeeTemplate.deleteMany).toHaveBeenCalled();
      expect(prisma.userSubscriptionEntryFeeTemplate.createMany).not.toHaveBeenCalled();
    });
  });
});
