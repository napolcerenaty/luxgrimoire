/**
 * getMonthChoiceGroups() / submitMonthChoice() across subscription cadences.
 *
 * subscriptions.book-choice-bugs.spec.ts already locks in resolveMonthHoldingSubscriptionIds'
 * 4 shapes (normal / content-stream variant / combo / combo-with-variant-component) for these
 * two endpoints, but every one of those fixtures is cadence-agnostic (no intervalMonths /
 * isBundleSubscription set). resolveMonthHoldingSubscriptionIds itself never looks at cadence
 * at all — it only branches on isCombo/parentSubscriptionId — so a bimonthly/quarterly plain
 * subscription resolves identically to a monthly one. What's genuinely untested is the more
 * surprising fact this implies for BUNDLE subscriptions specifically: both endpoints look up
 * a SubscriptionMonth by exact (year, month), with no awareness of bundle periods at all. A
 * choice group therefore lives on, and must be addressed via, its own single calendar month —
 * never the bundle's primary/first month — even though backfillSubscription merges all of a
 * bundle's months into one purchase unit. These tests lock that behavior in so a future change
 * to bundle handling doesn't accidentally special-case choice-group lookups around the
 * bundle's primary month.
 */

import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const USER_ID = 'user-1';
const ENTRY_ID = 'entry-1';

function makeService(prisma: DeepMockProxy<PrismaService>) {
  return new SubscriptionsService(
    prisma,
    {} as any,        // TypesenseService
    { recomputeSkipState: jest.fn() } as any, // SkipPolicyEngine
    { retroactivelyAddBookForSubscribers: jest.fn() } as any, // RenewalCronService
    {} as any,        // CountryFeeSnapshotCronService
    {} as any,        // UploadService
    {} as any,        // CrowdStatsService
    { markStatsStale: jest.fn() } as any, // StatsService
    { del: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) } as any,
    undefined,        // MediaAssetsService
    { cancelBookChoice: jest.fn().mockResolvedValue(undefined) } as any, // ScheduledRemindersService
  );
}

describe('getMonthChoiceGroups — cadence', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
  });

  it('bimonthly (intervalMonths=2, non-bundle): resolves via the subscription\'s own id and returns myChoice for an exact calendar month, same as a monthly sub', async () => {
    const sub = { id: 'sub-bi-1', isCombo: false, parentSubscriptionId: null, intervalMonths: 2, isBundleSubscription: false };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'month-aug' }]);
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'group-1', monthId: 'month-aug', options: [] }]);
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: ENTRY_ID });
    (prisma.userSubscriptionMonthChoice.findMany as jest.Mock).mockResolvedValueOnce([
      { choiceGroupId: 'group-1', source: 'user', selections: [{ monthBookId: 'mb-a' }] },
    ]);

    const result = await service.getMonthChoiceGroups('bimonthly-sub', 2026, 8, USER_ID);

    expect(prisma.subscriptionMonth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subscriptionId: { in: ['sub-bi-1'] }, year: 2026, month: 8 }) }),
    );
    expect(prisma.subscriptionComboComponent.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([expect.objectContaining({ id: 'group-1', myChoice: { source: 'user', monthBookIds: ['mb-a'] } })]);
  });

  it('quarterly bundle (intervalMonths=3, isBundleSubscription=true): a choice group on the MIDDLE bundle month is found by that month alone — no widening to the bundle\'s primary (first) month', async () => {
    const sub = { id: 'sub-q-1', isCombo: false, parentSubscriptionId: null, intervalMonths: 3, isBundleSubscription: true, startingMonth: 1 };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);
    // Query is for May (the 2nd of Apr/May/Jun), not April (the bundle's primary month).
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'month-may' }]);
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'group-1', monthId: 'month-may', options: [] }]);

    const result = await service.getMonthChoiceGroups('quarterly-bundle-sub', 2026, 5);

    expect(prisma.subscriptionMonth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subscriptionId: { in: ['sub-q-1'] }, year: 2026, month: 5 } ) }),
    );
    // No userId passed — the anonymous/public preview path — must short-circuit before ever
    // looking up an entry, regardless of cadence.
    expect(prisma.userSubscriptionEntry.findFirst).not.toHaveBeenCalled();
    expect(result).toEqual([expect.objectContaining({ id: 'group-1', myChoice: null })]);
  });
});

describe('submitMonthChoice — cadence', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
  });

  it('quarterly bundle: submitting a choice for the middle bundle month succeeds and materializes into that month\'s own purchase group, independent of the other bundle months', async () => {
    const sub = { id: 'sub-q-1', isCombo: false, parentSubscriptionId: null, intervalMonths: 3, isBundleSubscription: true, startingMonth: 1 };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'month-may' }]);
    (prisma.subscriptionMonthChoiceGroup.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'group-1', monthId: 'month-may', allowMultiple: false, options: [{ id: 'mb-a' }, { id: 'mb-b' }],
    });
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: ENTRY_ID });
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    (prisma.userSubscriptionMonthChoice.upsert as jest.Mock).mockResolvedValueOnce({ id: 'choice-1' });
    (prisma.userMonthBookChoiceSelection.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    (prisma.userMonthBookChoiceSelection.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (prisma.subscriptionMonthBook.findMany as jest.Mock).mockResolvedValueOnce([
      { bookId: 'book-1', editionId: 'ed-a', signatureType: null, month: { year: 2026, month: 5, signatureType: null } },
    ]);
    (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      basePrice: { toString: () => '45.00' }, shippingCost: null, costCurrency: 'USD',
    });
    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: 'ube-1' });

    await expect(
      service.submitMonthChoice('quarterly-bundle-sub', 2026, 5, 'group-1', USER_ID, { monthBookIds: ['mb-a'] }),
    ).resolves.toBeDefined();

    expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ editionId: 'ed-a', subscriptionEntryId: ENTRY_ID }) }),
    );
    // The materialized purchase group is titled for May alone — the live pick is scoped to
    // its own calendar month, not merged with April/June the way backfill would bundle them.
    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Subscription – 2026/05' }) }),
    );
  });

  it('quarterly bundle: a choice group belonging to a DIFFERENT month in the same bundle period is rejected — bundle grouping does not widen which month a submission may target', async () => {
    const sub = { id: 'sub-q-1', isCombo: false, parentSubscriptionId: null, intervalMonths: 3, isBundleSubscription: true, startingMonth: 1 };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);
    // Caller addresses May, but the group actually belongs to June — same bundle period, different month.
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'month-may' }]);
    (prisma.subscriptionMonthChoiceGroup.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'group-1', monthId: 'month-jun', allowMultiple: false, options: [{ id: 'mb-a' }],
    });

    await expect(
      service.submitMonthChoice('quarterly-bundle-sub', 2026, 5, 'group-1', USER_ID, { monthBookIds: ['mb-a'] }),
    ).rejects.toThrow(NotFoundException);
  });
});
