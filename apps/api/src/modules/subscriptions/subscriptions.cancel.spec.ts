/**
 * Unit tests for SubscriptionsService.cancelMySubscription()
 *
 * After the subscription-entry-per-period refactor:
 * - active entries are found via findFirst({ userId, subscriptionId, active: true })
 * - cancelling updates the entry itself to active=false
 * - there is no separate membership history table
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const SUB_ID = 'sub-cancel-1';
const SUB_SLUG = 'cancel-test-sub';
const USER_ID = 'user-cancel-1';
const ENTRY_ID = 'entry-cancel-1';

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Cancel Test Sub',
    isCombo: false,
    componentIds: [],
    currency: 'GBP',
    renewalDay: 1,
    paymentOnStartup: false,
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
    cancellationReason: null,
    ...overrides,
  };
}

describe('SubscriptionsService — cancelMySubscription', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let crowdStatsMock: { decrementSubscriberCount: jest.Mock; incrementSubscriberCount: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    crowdStatsMock = {
      decrementSubscriberCount: jest.fn().mockResolvedValue(undefined),
      incrementSubscriberCount: jest.fn().mockResolvedValue(undefined),
    };

    service = new SubscriptionsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      crowdStatsMock as any,
      { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any,
    );
  });

  function setupActiveEntry(entryOverrides: Record<string, unknown> = {}) {
    const sub = makeSub();
    const entry = makeEntry({ active: true, ...entryOverrides });
    jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);
    (prisma.subscriptionSeries.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const cancelled = { ...entry, active: false, cancellationDate: '2025-01-31', nextRenewalDate: null };
    (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValueOnce(cancelled);
    return { sub, entry, cancelled };
  }

  describe('cancelling an active subscription', () => {
    it('updates the entry to inactive', async () => {
      setupActiveEntry();
      await service.cancelMySubscription(USER_ID, SUB_SLUG);
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ENTRY_ID },
          data: expect.objectContaining({ active: false }),
        }),
      );
    });

    it('sets nextRenewalDate to null', async () => {
      setupActiveEntry();
      await service.cancelMySubscription(USER_ID, SUB_SLUG);
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nextRenewalDate: null }),
        }),
      );
    });

    it('does NOT create a separate history record (the entry itself represents the period)', async () => {
      setupActiveEntry({ startDate: '2024-01-01' });
      await service.cancelMySubscription(USER_ID, SUB_SLUG);
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ENTRY_ID },
          data: expect.objectContaining({ active: false, cancellationDate: expect.any(String) }),
        }),
      );
    });

    it('decrements subscriber count', async () => {
      setupActiveEntry();
      await service.cancelMySubscription(USER_ID, SUB_SLUG);
      await new Promise(r => setImmediate(r));
      expect(crowdStatsMock.decrementSubscriberCount).toHaveBeenCalledWith(SUB_ID);
    });

    it('uses today as cancellationDate when none provided', async () => {
      setupActiveEntry();
      const today = new Date().toISOString().slice(0, 10);
      await service.cancelMySubscription(USER_ID, SUB_SLUG);
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cancellationDate: today }),
        }),
      );
    });

    it('uses provided cancellationDate', async () => {
      setupActiveEntry();
      await service.cancelMySubscription(USER_ID, SUB_SLUG, { cancellationDate: '2025-03-31' });
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cancellationDate: '2025-03-31' }),
        }),
      );
    });

    it('sets cancellationReason when provided', async () => {
      setupActiveEntry();
      await service.cancelMySubscription(USER_ID, SUB_SLUG, { cancellationReason: 'Too expensive' });
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cancellationReason: 'Too expensive' }),
        }),
      );
    });

    it('returns the updated entry', async () => {
      const { cancelled } = setupActiveEntry();
      const result = await service.cancelMySubscription(USER_ID, SUB_SLUG);
      expect(result.id).toBe(ENTRY_ID);
      expect(result.active).toBe(false);
      expect(result).toEqual(cancelled);
    });
  });

  describe('error cases', () => {
    it('throws NotFoundException when user has no active entry', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.cancelMySubscription(USER_ID, SUB_SLUG)).rejects.toThrow(NotFoundException);
    });

    it('does not update the entry when no active subscription exists', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.cancelMySubscription(USER_ID, SUB_SLUG)).rejects.toThrow(NotFoundException);
      expect(prisma.userSubscriptionEntry.update).not.toHaveBeenCalled();
    });
  });

  describe('blocking series (canCancelDuring=false)', () => {
    it('throws BadRequestException with series name in message', async () => {
      const sub = makeSub();
      const entry = makeEntry({ active: true });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);
      (prisma.subscriptionSeries.findFirst as jest.Mock).mockResolvedValueOnce({
        name: 'The Dark Series',
      });

      await expect(service.cancelMySubscription(USER_ID, SUB_SLUG)).rejects.toThrow(/The Dark Series/);
    });

    it('does not cancel when blocking series is present', async () => {
      const sub = makeSub();
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(makeEntry());
      (prisma.subscriptionSeries.findFirst as jest.Mock).mockResolvedValueOnce({ name: 'Blocked' });

      await expect(service.cancelMySubscription(USER_ID, SUB_SLUG)).rejects.toThrow(BadRequestException);
      expect(prisma.userSubscriptionEntry.update).not.toHaveBeenCalled();
    });

    it('proceeds with cancellation when no blocking series', async () => {
      setupActiveEntry();
      await expect(service.cancelMySubscription(USER_ID, SUB_SLUG)).resolves.toBeDefined();
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalled();
    });
  });
});
