/**
 * Service-level tests for SubscriptionSettingsHistory feature.
 *
 * Covers:
 *  1. listSettingsHistory — query shape, ordering, NotFoundException propagation
 *  2. update() → history recording — records on tracked field change, skips on
 *     untracked-only changes or no-op updates, passes changedByUserId and correct snapshot
 *  3. settingsEffectiveFrom validation — required when settings change, uses as effectiveFrom
 *  4. Auto-refresh — entries with nextRenewalDate >= effectiveFrom are refreshed; earlier entries are not
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';
import * as renewalDateUtil from '../../common/utils/renewal-date.util';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUB_ID = 'sub-id-settings';
const SUB_SLUG = 'test-subscription-settings';
const USER_ID = 'user-admin-1';
const EFFECTIVE_FROM = '2025-07-01';

/** Base subscription with default settings values */
function makeExistingSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Test Sub',
    renewalDay: 1,
    renewalDayUserSet: false,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: true,
    renewalMonthOffset: 0,
    coverImage: null,
    logoUrl: null,
    currency: 'EUR',
    isCombo: false,
    componentIds: [],
    isContentStream: false,
    ...overrides,
  };
}

function makeUpdatedSub(overrides: Record<string, unknown> = {}) {
  return makeExistingSub(overrides);
}

function makeHistoryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sh-1',
    subscriptionId: SUB_ID,
    effectiveFrom: new Date('2024-01-15T10:00:00Z'),
    renewalDay: 1,
    renewalDayUserSet: false,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: true,
    renewalMonthOffset: 0,
    changedBy: USER_ID,
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('SubscriptionsService — settings history', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let cache: { del: jest.Mock; get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    cache = {
      del: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    service = new SubscriptionsService(
      prisma,
      {} as any, // TypesenseService
      {} as any, // SkipPolicyEngine
      {} as any, // RenewalCronService
      {} as any, // UploadService
      {} as any, // CrowdStatsService
      { markStatsStale: jest.fn() } as any, // StatsService
      cache as any,
    );

    jest
      .spyOn(service, 'findBySlug')
      .mockResolvedValue(makeExistingSub() as any);
  });

  // ── listSettingsHistory ────────────────────────────────────────────────────

  describe('listSettingsHistory', () => {
    it('queries DB with correct subscriptionId', async () => {
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);

      await service.listSettingsHistory(SUB_SLUG);

      expect(prisma.subscriptionSettingsHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { subscriptionId: SUB_ID },
        }),
      );
    });

    it('orders results by effectiveFrom desc (most recent first)', async () => {
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);

      await service.listSettingsHistory(SUB_SLUG);

      expect(prisma.subscriptionSettingsHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { effectiveFrom: 'desc' },
        }),
      );
    });

    it('returns all records including migration sentinel (no sentinel exclusion)', async () => {
      const records = [
        makeHistoryRecord({ id: 'sh-2', effectiveFrom: new Date('2026-01-01') }),
        makeHistoryRecord({ id: 'sh-1', effectiveFrom: new Date('2020-01-01') }), // migration sentinel
      ];
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue(records);

      const result = await service.listSettingsHistory(SUB_SLUG);

      expect(result).toHaveLength(2);
    });

    it('returns empty array when no history records exist', async () => {
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.listSettingsHistory(SUB_SLUG);

      expect(result).toEqual([]);
    });

    it('propagates NotFoundException when subscription does not exist', async () => {
      jest.spyOn(service, 'findBySlug').mockRejectedValue(new NotFoundException());

      await expect(service.listSettingsHistory('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update() — settings history recording ─────────────────────────────────

  describe('update — history recording', () => {
    /** Helper that sets up the mocks needed for update() to succeed */
    function setupUpdate(existingSub: Record<string, unknown>, updatedSub: Record<string, unknown>) {
      jest.spyOn(service, 'findBySlug').mockResolvedValue(existingSub as any);
      (prisma.subscription.update as jest.Mock).mockResolvedValue(updatedSub);
      (prisma.subscriptionSettingsHistory.count as jest.Mock).mockResolvedValue(1); // history already exists
      (prisma.subscriptionSettingsHistory.create as jest.Mock).mockResolvedValue({});
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValue([]);
      // indexSubscription: return null so it exits early before typesense
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
    }

    it('records history when renewalDay changes', async () => {
      const existing = makeExistingSub({ renewalDay: 1 });
      const updated = makeUpdatedSub({ renewalDay: 15 });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { renewalDay: 15, settingsEffectiveFrom: EFFECTIVE_FROM } as any, USER_ID);

      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledTimes(1);
    });

    it('records history when paymentOnStartup changes to true', async () => {
      const existing = makeExistingSub({ paymentOnStartup: false });
      const updated = makeUpdatedSub({ paymentOnStartup: true });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { paymentOnStartup: true, settingsEffectiveFrom: EFFECTIVE_FROM } as any, USER_ID);

      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledTimes(1);
    });

    it('records history when signupIncludesCurrentMonth changes', async () => {
      const existing = makeExistingSub({ signupIncludesCurrentMonth: true });
      const updated = makeUpdatedSub({ signupIncludesCurrentMonth: false });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { signupIncludesCurrentMonth: false, settingsEffectiveFrom: EFFECTIVE_FROM } as any, USER_ID);

      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledTimes(1);
    });

    it('records history when renewalMonthOffset changes', async () => {
      const existing = makeExistingSub({ renewalMonthOffset: 0 });
      const updated = makeUpdatedSub({ renewalMonthOffset: 1 });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { renewalMonthOffset: 1, settingsEffectiveFrom: EFFECTIVE_FROM } as any, USER_ID);

      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledTimes(1);
    });

    it('records history when renewalDayUserSet changes', async () => {
      const existing = makeExistingSub({ renewalDayUserSet: false });
      const updated = makeUpdatedSub({ renewalDayUserSet: true });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { renewalDayUserSet: true, settingsEffectiveFrom: EFFECTIVE_FROM } as any, USER_ID);

      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledTimes(1);
    });

    it('does NOT record history when only untracked field (name) changes', async () => {
      const existing = makeExistingSub({ name: 'Old Name' });
      const updated = makeUpdatedSub({ name: 'New Name' });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { name: 'New Name' } as any, USER_ID);

      expect(prisma.subscriptionSettingsHistory.create).not.toHaveBeenCalled();
    });

    it('does NOT record history when renewalDay is sent but value is unchanged', async () => {
      const existing = makeExistingSub({ renewalDay: 15 });
      const updated = makeUpdatedSub({ renewalDay: 15 });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { renewalDay: 15 } as any, USER_ID);

      expect(prisma.subscriptionSettingsHistory.create).not.toHaveBeenCalled();
    });

    it('does NOT record history when paymentOnStartup is sent but value is unchanged', async () => {
      const existing = makeExistingSub({ paymentOnStartup: true });
      const updated = makeUpdatedSub({ paymentOnStartup: true });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { paymentOnStartup: true } as any, USER_ID);

      expect(prisma.subscriptionSettingsHistory.create).not.toHaveBeenCalled();
    });

    it('records only ONE history entry even when multiple tracked fields change simultaneously', async () => {
      const existing = makeExistingSub({ renewalDay: 1, renewalMonthOffset: 0 });
      const updated = makeUpdatedSub({ renewalDay: 20, renewalMonthOffset: 1 });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { renewalDay: 20, renewalMonthOffset: 1, settingsEffectiveFrom: EFFECTIVE_FROM } as any, USER_ID);

      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledTimes(1);
    });

    it('passes changedByUserId to the history record', async () => {
      const existing = makeExistingSub({ renewalDay: 1 });
      const updated = makeUpdatedSub({ renewalDay: 20 });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { renewalDay: 20, settingsEffectiveFrom: EFFECTIVE_FROM } as any, 'admin-user-123');

      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            changedBy: 'admin-user-123',
          }),
        }),
      );
    });

    it('stores null changedBy when no userId is provided', async () => {
      const existing = makeExistingSub({ renewalDay: 1 });
      const updated = makeUpdatedSub({ renewalDay: 20 });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { renewalDay: 20, settingsEffectiveFrom: EFFECTIVE_FROM } as any);

      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            changedBy: null,
          }),
        }),
      );
    });

    it('snapshot in history record contains all 5 settings fields from the updated sub', async () => {
      const existing = makeExistingSub({ renewalDay: 1, renewalMonthOffset: 0, paymentOnStartup: false });
      const updated = makeUpdatedSub({
        renewalDay: 20,
        renewalDayUserSet: true,
        paymentOnStartup: true,
        signupIncludesCurrentMonth: false,
        renewalMonthOffset: 1,
      });
      setupUpdate(existing, updated);

      await service.update(
        SUB_SLUG,
        { renewalDay: 20, renewalDayUserSet: true, paymentOnStartup: true,
          signupIncludesCurrentMonth: false, renewalMonthOffset: 1,
          settingsEffectiveFrom: EFFECTIVE_FROM } as any,
        USER_ID,
      );

      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscriptionId: SUB_ID,
            renewalDay: 20,
            renewalDayUserSet: true,
            paymentOnStartup: true,
            signupIncludesCurrentMonth: false,
            renewalMonthOffset: 1,
          }),
        }),
      );
    });

    it('history record includes subscriptionId from the updated sub', async () => {
      const existing = makeExistingSub({ renewalDay: 1 });
      const updated = makeUpdatedSub({ renewalDay: 5 });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { renewalDay: 5, settingsEffectiveFrom: EFFECTIVE_FROM } as any, USER_ID);

      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscriptionId: SUB_ID,
          }),
        }),
      );
    });

    // ── settingsEffectiveFrom validation ──────────────────────────────────────

    it('throws BadRequestException when settings change but settingsEffectiveFrom is missing', async () => {
      const existing = makeExistingSub({ renewalDay: 1 });
      const updated = makeUpdatedSub({ renewalDay: 15 });
      setupUpdate(existing, updated);

      await expect(
        service.update(SUB_SLUG, { renewalDay: 15 } as any, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses settingsEffectiveFrom as the effectiveFrom date in the history record', async () => {
      const existing = makeExistingSub({ renewalDay: 1 });
      const updated = makeUpdatedSub({ renewalDay: 10 });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { renewalDay: 10, settingsEffectiveFrom: '2025-08-01' } as any, USER_ID);

      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            effectiveFrom: new Date('2025-08-01'),
          }),
        }),
      );
    });

    it('does not pass settingsEffectiveFrom as a DB column to prisma.subscription.update', async () => {
      const existing = makeExistingSub({ renewalDay: 1 });
      const updated = makeUpdatedSub({ renewalDay: 10 });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { renewalDay: 10, settingsEffectiveFrom: EFFECTIVE_FROM } as any, USER_ID);

      const updateCall = (prisma.subscription.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('settingsEffectiveFrom');
    });

    // ── Auto-refresh after settings save ─────────────────────────────────────

    it('refreshes entries with nextRenewalDate >= effectiveFrom', async () => {
      const refreshSpy = jest.spyOn(renewalDateUtil, 'refreshNextRenewalDate').mockResolvedValue(undefined);
      const existing = makeExistingSub({ renewalDay: 1 });
      const updated = makeUpdatedSub({ renewalDay: 15 });
      setupUpdate(existing, updated);
      const effectiveFrom = new Date('2025-07-01');
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValue([
        { id: 'entry-a' }, // nextRenewalDate = Jul 1 (>= effectiveFrom)
        { id: 'entry-b' }, // nextRenewalDate = Aug 5 (>= effectiveFrom)
      ]);

      await service.update(SUB_SLUG, { renewalDay: 15, settingsEffectiveFrom: '2025-07-01' } as any, USER_ID);
      // Let setImmediate fire
      await new Promise(resolve => setImmediate(resolve));

      expect(prisma.userSubscriptionEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subscriptionId: SUB_ID,
            active: true,
          }),
        }),
      );
      expect(refreshSpy).toHaveBeenCalledTimes(2);
      expect(refreshSpy).toHaveBeenCalledWith(prisma, 'entry-a');
      expect(refreshSpy).toHaveBeenCalledWith(prisma, 'entry-b');
      refreshSpy.mockRestore();
    });

    it('does not refresh any entries when no active entries have nextRenewalDate >= effectiveFrom', async () => {
      const refreshSpy = jest.spyOn(renewalDateUtil, 'refreshNextRenewalDate').mockResolvedValue(undefined);
      const existing = makeExistingSub({ renewalDay: 1 });
      const updated = makeUpdatedSub({ renewalDay: 15 });
      setupUpdate(existing, updated);
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValue([]); // no affected entries

      await service.update(SUB_SLUG, { renewalDay: 15, settingsEffectiveFrom: '2025-07-01' } as any, USER_ID);
      await new Promise(resolve => setImmediate(resolve));

      expect(refreshSpy).not.toHaveBeenCalled();
      refreshSpy.mockRestore();
    });

    it('filters entries correctly: only active entries with nextRenewalDate >= effectiveFrom', async () => {
      const existing = makeExistingSub({ renewalDay: 1 });
      const updated = makeUpdatedSub({ renewalDay: 15 });
      setupUpdate(existing, updated);

      await service.update(SUB_SLUG, { renewalDay: 15, settingsEffectiveFrom: '2025-07-01' } as any, USER_ID);

      expect(prisma.userSubscriptionEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            subscriptionId: SUB_ID,
            active: true,
            OR: [
              { nextRenewalDate: { gte: new Date('2025-07-01') } },
              { nextRenewalDate: null },
            ],
          },
        }),
      );
    });

    it('creates epoch sentinel if no history exists before first change', async () => {
      const existing = makeExistingSub({ renewalDay: 1 });
      const updated = makeUpdatedSub({ renewalDay: 15 });
      jest.spyOn(service, 'findBySlug').mockResolvedValue(existing as any);
      (prisma.subscription.update as jest.Mock).mockResolvedValue(updated);
      (prisma.subscriptionSettingsHistory.count as jest.Mock).mockResolvedValue(0); // no history yet
      (prisma.subscriptionSettingsHistory.create as jest.Mock).mockResolvedValue({});
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

      await service.update(SUB_SLUG, { renewalDay: 15, settingsEffectiveFrom: EFFECTIVE_FROM } as any, USER_ID);

      // First call = epoch sentinel (effectiveFrom = epoch)
      const firstCreate = (prisma.subscriptionSettingsHistory.create as jest.Mock).mock.calls[0][0];
      expect(firstCreate.data.effectiveFrom).toEqual(new Date(0));
      // Second call = actual history record
      expect(prisma.subscriptionSettingsHistory.create).toHaveBeenCalledTimes(2);
    });
  });
});
