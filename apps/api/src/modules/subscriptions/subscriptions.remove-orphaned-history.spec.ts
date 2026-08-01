/**
 * Regression coverage for removeOrphanedHistoryRecord's legacy "date-range match" fallback
 * (used when a removed entry's books were never directly linked via subscriptionEntryId —
 * pre-refactor migrated data). That fallback queried SubscriptionMonth by entry.subscriptionId
 * directly, the same bug shape fixed in recordFirstMonthAsPreorder: a content-stream variant
 * or combo subscription doesn't own SubscriptionMonth rows itself, so the lookup would
 * silently find nothing and skip cleaning up the orphaned books. Fixed by resolving through
 * resolveMonthHoldingSubscriptionIds, same as every other month-lookup call site.
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const USER_ID = 'user-1';
const ENTRY_ID = 'entry-orphan-1';

function makeService(prisma: DeepMockProxy<PrismaService>) {
  return new SubscriptionsService(
    prisma,
    {} as any, // TypesenseService
    {} as any, // SkipPolicyEngine
    {} as any, // RenewalCronService
    {} as any, // CountryFeeSnapshotCronService
    {} as any, // UploadService
    {} as any, // CrowdStatsService
    { markStatsStale: jest.fn() } as any, // StatsService
    { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any,
  );
}

function makeEntry(subscriptionId: string) {
  return {
    id: ENTRY_ID,
    userId: USER_ID,
    subscriptionId,
    startDate: '2026-01-01',
    cancellationDate: '2026-03-01',
    billingPeriods: [],
  };
}

describe('SubscriptionsService — removeOrphanedHistoryRecord (legacy date-range fallback)', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
  });

  function setupFallback(subscriptionId: string, subscriptionRow: Record<string, unknown> | null) {
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(makeEntry(subscriptionId));
    (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValueOnce([]); // no direct-linked books → triggers fallback
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(subscriptionRow);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]); // empty is fine — we only assert the query shape
    (prisma.userSubscriptionEntry.delete as jest.Mock).mockResolvedValueOnce({});
  }

  it('normal (non-combo, non-variant) subscription queries its own id', async () => {
    setupFallback('normal-1', { id: 'normal-1', isCombo: false, parentSubscriptionId: null });

    await service.removeOrphanedHistoryRecord(USER_ID, ENTRY_ID, { removeBooks: true });

    expect(prisma.subscriptionMonth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subscriptionId: { in: ['normal-1'] } }) }),
    );
  });

  it('content-stream variant subscription queries the PARENT stream\'s id, not its own', async () => {
    setupFallback('variant-1', { id: 'variant-1', isCombo: false, parentSubscriptionId: 'parent-1' });

    await service.removeOrphanedHistoryRecord(USER_ID, ENTRY_ID, { removeBooks: true });

    expect(prisma.subscriptionMonth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subscriptionId: { in: ['parent-1'] } }) }),
    );
  });

  it('combo subscription with a regular component resolves to the component\'s own id', async () => {
    setupFallback('combo-1', { id: 'combo-1', isCombo: true, parentSubscriptionId: null });
    (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValueOnce([{ componentId: 'regular-comp-1' }]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'regular-comp-1', parentSubscriptionId: null }]);

    await service.removeOrphanedHistoryRecord(USER_ID, ENTRY_ID, { removeBooks: true });

    expect(prisma.subscriptionMonth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subscriptionId: { in: ['regular-comp-1'] } }) }),
    );
  });

  it('combo subscription whose component is a content-stream variant resolves through to the parent stream', async () => {
    setupFallback('combo-2', { id: 'combo-2', isCombo: true, parentSubscriptionId: null });
    (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValueOnce([{ componentId: 'variant-comp-1' }]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'variant-comp-1', parentSubscriptionId: 'parent-2' }]);

    await service.removeOrphanedHistoryRecord(USER_ID, ENTRY_ID, { removeBooks: true });

    expect(prisma.subscriptionMonth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subscriptionId: { in: ['parent-2'] } }) }),
    );
  });
});
