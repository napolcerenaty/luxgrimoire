/**
 * Pre-refactor tests for SubscriptionsService query methods:
 *   - getMySubscriptions
 *   - getOrphanedMembershipHistory
 *   - getMySubscriptionEntry
 *   - updateMyEntryCosts
 *
 * These tests document the observable contract for reading subscription data.
 * After the refactor (entries replace history table), update these tests to verify
 * the new shapes: inactive entries instead of membershipHistory, no orphaned endpoint.
 */

import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const SUB_ID = 'sub-q-1';
const SUB_SLUG = 'query-test-sub';
const USER_ID = 'user-q-1';
const ENTRY_ID = 'entry-q-1';
const HISTORY_ID_1 = 'hist-q-1';
const HISTORY_ID_2 = 'hist-q-2';

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
    membershipHistory: [],
    subscription: makeSub(),
    ...overrides,
  };
}

function makeHistoryRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    entryId: null, // orphaned
    startDate: '2023-01-01',
    endDate: '2023-12-31',
    cancellationReason: null,
    subscription: makeSub(),
    ...overrides,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

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
      { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any,
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getMySubscriptions
  // ══════════════════════════════════════════════════════════════════════════

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
        membershipHistory: [],
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

    it('includes membershipHistory on each entry (re-joined sub shows past periods)', async () => {
      const historyRecords = [
        { id: HISTORY_ID_1, startDate: '2022-01-01', endDate: '2022-12-31', cancellationReason: null },
      ];
      const entry = makeEntryRow({ active: true, startDate: '2024-01-01', membershipHistory: historyRecords });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID);
      expect(result[0].membershipHistory).toHaveLength(1);
      expect(result[0].membershipHistory[0].id).toBe(HISTORY_ID_1);
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
      // Base 20 + shipping 5 = 25 (no fees)
      expect(parseFloat(result[0].nextRenewalAmount ?? '0')).toBe(25);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getOrphanedMembershipHistory
  // ══════════════════════════════════════════════════════════════════════════

  describe('getOrphanedMembershipHistory', () => {
    it('returns empty array when no orphaned records', async () => {
      (prisma.userSubscriptionMembershipHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
      const result = await service.getOrphanedMembershipHistory(USER_ID);
      expect(result).toEqual([]);
    });

    it('returns orphaned records grouped by subscription', async () => {
      const SUB_ID_2 = 'sub-q-2';
      const records = [
        makeHistoryRecord(HISTORY_ID_1, { subscriptionId: SUB_ID }),
        makeHistoryRecord(HISTORY_ID_2, { subscriptionId: SUB_ID }), // same sub → same group
        makeHistoryRecord('hist-q-3', {
          subscriptionId: SUB_ID_2,
          subscription: { ...makeSub(), id: SUB_ID_2 },
        }),
      ];
      (prisma.userSubscriptionMembershipHistory.findMany as jest.Mock).mockResolvedValueOnce(records);

      const result = await service.getOrphanedMembershipHistory(USER_ID);

      expect(result).toHaveLength(2); // 2 distinct subscriptions
      const group1 = result.find(g => g.subscription.id === SUB_ID);
      expect(group1?.records).toHaveLength(2);
      const group2 = result.find(g => g.subscription.id === SUB_ID_2);
      expect(group2?.records).toHaveLength(1);
    });

    it('queries only records with entryId=null (truly orphaned)', async () => {
      (prisma.userSubscriptionMembershipHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
      await service.getOrphanedMembershipHistory(USER_ID);

      expect(prisma.userSubscriptionMembershipHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID, entryId: null }),
        }),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getMySubscriptionEntry
  // ══════════════════════════════════════════════════════════════════════════

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
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);

      const result = await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(ENTRY_ID);
    });

    it('returns null for non-subscribed user', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);
      expect(result).toBeNull();
    });

    it('uses userId_subscriptionId composite key to find entry', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);

      expect(prisma.userSubscriptionEntry.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_subscriptionId: { userId: USER_ID, subscriptionId: SUB_ID } },
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
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);

      const result = await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);
      expect(result?.nextRenewalDate).toBe(renewalDate.toISOString());
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // updateMyEntryCosts
  // ══════════════════════════════════════════════════════════════════════════

  describe('updateMyEntryCosts', () => {
    function setupForUpdate(entryOverrides: Record<string, unknown> = {}) {
      const sub = makeSub();
      const entry = { id: ENTRY_ID, userId: USER_ID, subscriptionId: SUB_ID, active: true, ...entryOverrides };
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);
      // First findUnique → existing entry; second → for getMySubscriptionEntry at end
      (prisma.userSubscriptionEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce(entry)         // initial lookup in updateMyEntryCosts
        .mockResolvedValueOnce({ ...entry, feeTemplates: [], skipRecords: [], nextRenewalDate: null }); // getMySubscriptionEntry
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
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);

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
