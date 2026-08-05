/**
 * Regression tests for three book-choice bugs found while testing the feature live against
 * real subscriptions, at the SubscriptionsService level (see subscription-month-choice.util.spec.ts
 * for the lower-level resolver/materialization tests):
 *
 *  1. recordFirstMonthAsPreorder (paymentOnStartup subscriptions) ran synchronously inside
 *     joinSubscription() — before the entry even existed from the frontend's point of view,
 *     so no choice could ever have been submitted yet — and unconditionally created every
 *     book in the first eligible month, including choice-grouped ones. Fixed: choice-grouped
 *     books are excluded outright from this path, deferred to the backfill/self-service flow.
 *  2. The combo backfill path built its own book list (deduped by editionId across component
 *     months) entirely independent of resolveMonthBooksForEntry, so a choice group on a combo
 *     component's month was never respected during backfill — always added every edition.
 *  3. getMonthChoiceGroups / submitMonthChoice looked up the SubscriptionMonth under the
 *     combo's own subscriptionId, which never has any (combos have no SubscriptionMonth rows
 *     of their own — those live on each component's effective parent). The choice submission
 *     silently 404'd every time for a combo subscription. Fixed via resolveMonthHoldingSubscriptionIds.
 */

import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const USER_ID = 'user-1';
const SUB_ID = 'sub-1';
const SUB_SLUG = 'test-sub';
const ENTRY_ID = 'entry-1';

function makeService(prisma: DeepMockProxy<PrismaService>, extra: Record<string, unknown> = {}) {
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
    extra.scheduledReminders as any, // ScheduledRemindersService
  );
}

describe('recordFirstMonthAsPreorder — choice-grouped books excluded', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
  });

  it('does not create a UserBookEntry for a choice-grouped book, only for plain ones', async () => {
    (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'month-1',
      year: 2026,
      month: 7,
      signatureType: null,
      books: [
        { id: 'mb-plain', editionId: 'ed-plain', bookId: 'book-plain', signatureType: null, choiceGroupId: null },
        { id: 'mb-choice', editionId: 'ed-choice', bookId: 'book-choice', signatureType: null, choiceGroupId: 'group-1' },
      ],
    });
    (prisma.userSubscriptionEntryFeeTemplate.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: 'ube-1' });
    (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});
    (prisma.userPurchaseFee.createMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const entry = {
      id: ENTRY_ID,
      renewalDay: 1,
      basePrice: { toString: () => '29.99' },
      shippingCost: null,
      costCurrency: 'USD',
      feeTemplates: [],
    };

    await (service as any).recordFirstMonthAsPreorder(
      ENTRY_ID, USER_ID, SUB_ID, new Date(2026, 5, 28), entry,
    );

    // Only the plain (non-choice) book should ever reach userBookEntry.create
    expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ editionId: 'ed-plain' }) }),
    );
  });
});

describe('backfillSubscription — combo path respects book choice', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
  });

  it('only creates a UserBookEntry for the resolved (non-excluded) editions in a combo month', async () => {
    const sub = {
      id: SUB_ID, slug: SUB_SLUG, isCombo: true, componentIds: ['comp-1'],
      currency: 'USD', renewalDay: 1, renewalDayUserSet: false, paymentOnStartup: false,
      signupIncludesCurrentMonth: false, renewalMonthOffset: 0, isContentStream: false,
    };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);
    // Bypass getComboEligibleMonths's own internal date-window computation entirely —
    // that's not what this test is about; just declare our synthetic month eligible.
    jest.spyOn(service as any, 'getComboEligibleMonths').mockResolvedValue([{ id: 'COMBO_2026_7', year: 2026, month: 7, books: [] }]);

    const entry = {
      id: ENTRY_ID, userId: USER_ID, subscriptionId: SUB_ID, startDate: '2026-07-01',
      cancellationDate: null, renewalDay: 1, basePrice: { toString: () => '29.99' },
      costCurrency: 'USD', shippingCost: null, firstSkipDate: null, feeTemplates: [],
    };
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);
    (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValue([]);
    // Component resolution (resolveEffectiveComponentIds), called again for the actual book fetch below
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'comp-1', parentSubscriptionId: null }]);

    // The combo month has two editions of a choice group — only one is picked
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([
      {
        books: [
          { id: 'mb-a', bookId: 'book-1', editionId: 'ed-a', signatureType: null, choiceGroupId: 'group-1' },
          { id: 'mb-b', bookId: 'book-1', editionId: 'ed-b', signatureType: null, choiceGroupId: 'group-1' },
        ],
      },
    ]);
    // resolveMonthBooksForEntry's own queries: an explicit choice for ed-a only
    (prisma.userSubscriptionMonthChoice.findMany as jest.Mock).mockResolvedValueOnce([
      { choiceGroupId: 'group-1', selections: [{ monthBookId: 'mb-a' }] },
    ]);
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValueOnce([]);

    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: 'ube-1' });
    (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ id: SUB_ID, skipPolicies: [] });
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]); // auto-skip derivation

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['COMBO_2026_7'],
    } as any);

    expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ editionId: 'ed-a' }) }),
    );
  });

  it('a combo month with a resolved choice pick plus an always-included book splits basePrice evenly with no override', async () => {
    const sub = {
      id: SUB_ID, slug: SUB_SLUG, isCombo: true, componentIds: ['comp-1'],
      currency: 'USD', renewalDay: 1, renewalDayUserSet: false, paymentOnStartup: false,
      signupIncludesCurrentMonth: false, renewalMonthOffset: 0, isContentStream: false,
    };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);
    jest.spyOn(service as any, 'getComboEligibleMonths').mockResolvedValue([{ id: 'COMBO_2026_7', year: 2026, month: 7, books: [] }]);

    const entry = {
      id: ENTRY_ID, userId: USER_ID, subscriptionId: SUB_ID, startDate: '2026-07-01',
      cancellationDate: null, renewalDay: 1, basePrice: { toString: () => '30' },
      costCurrency: 'USD', shippingCost: null, firstSkipDate: null, feeTemplates: [],
    };
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);
    (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'comp-1', parentSubscriptionId: null }]);

    // Choice group (2 alternatives, one picked) + one always-included extra book
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([
      {
        books: [
          { id: 'mb-a', bookId: 'book-1', editionId: 'ed-a', signatureType: null, choiceGroupId: 'group-1' },
          { id: 'mb-b', bookId: 'book-1', editionId: 'ed-b', signatureType: null, choiceGroupId: 'group-1' },
          { id: 'mb-extra', bookId: 'book-extra', editionId: 'ed-extra', signatureType: null, choiceGroupId: null },
        ],
      },
    ]);
    (prisma.userSubscriptionMonthChoice.findMany as jest.Mock).mockResolvedValueOnce([
      { choiceGroupId: 'group-1', selections: [{ monthBookId: 'mb-a' }] },
    ]);
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValueOnce([]);

    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
    for (let i = 0; i < 2; i++) {
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: `ube-${i}` });
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});
    }
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ id: SUB_ID, skipPolicies: [] });
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]);

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['COMBO_2026_7'],
    } as any);

    // Group has exactly the 2 resolved books (chosen ed-a + always-included ed-extra) —
    // equal split of the group total (30), not 3-way (which would wrongly count ed-b).
    const createCalls = (prisma.userBookEntry.create as jest.Mock).mock.calls;
    const byEdition = Object.fromEntries(createCalls.map((c: any) => [c[0].data.editionId, c[0].data.basePrice]));
    expect(byEdition).toEqual({ 'ed-a': 15, 'ed-extra': 15 });
  });

  it('bookPrices override keyed by the synthetic comboId applies within the combo purchase group', async () => {
    const sub = {
      id: SUB_ID, slug: SUB_SLUG, isCombo: true, componentIds: ['comp-1'],
      currency: 'USD', renewalDay: 1, renewalDayUserSet: false, paymentOnStartup: false,
      signupIncludesCurrentMonth: false, renewalMonthOffset: 0, isContentStream: false,
    };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);
    jest.spyOn(service as any, 'getComboEligibleMonths').mockResolvedValue([{ id: 'COMBO_2026_7', year: 2026, month: 7, books: [] }]);

    const entry = {
      id: ENTRY_ID, userId: USER_ID, subscriptionId: SUB_ID, startDate: '2026-07-01',
      cancellationDate: null, renewalDay: 1, basePrice: { toString: () => '29.99' },
      costCurrency: 'USD', shippingCost: null, firstSkipDate: null, feeTemplates: [],
    };
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);
    (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'comp-1', parentSubscriptionId: null }]);

    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([
      {
        books: [
          { id: 'mb-a', bookId: 'book-1', editionId: 'ed-a', signatureType: null, choiceGroupId: 'group-1' },
          { id: 'mb-b', bookId: 'book-1', editionId: 'ed-b', signatureType: null, choiceGroupId: 'group-1' },
          { id: 'mb-extra', bookId: 'book-extra', editionId: 'ed-extra', signatureType: null, choiceGroupId: null },
        ],
      },
    ]);
    (prisma.userSubscriptionMonthChoice.findMany as jest.Mock).mockResolvedValueOnce([
      { choiceGroupId: 'group-1', selections: [{ monthBookId: 'mb-a' }] },
    ]);
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValueOnce([]);

    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
    for (let i = 0; i < 2; i++) {
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: `ube-${i}` });
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});
    }
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ id: SUB_ID, skipPolicies: [] });
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]);

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['COMBO_2026_7'],
      // monthId matches the synthetic comboId, exactly how selectedMonthIds addresses combo months.
      bookPrices: [{ monthId: 'COMBO_2026_7', editionId: 'ed-extra', price: 9.99 }],
    } as any);

    expect(prisma.userPurchaseGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pg-1' }, data: { priceDistribution: 'CUSTOM' } }),
    );
    const createCalls = (prisma.userBookEntry.create as jest.Mock).mock.calls;
    const byEdition = Object.fromEntries(createCalls.map((c: any) => [c[0].data.editionId, c[0].data.basePrice]));
    expect(byEdition).toEqual({ 'ed-a': 20, 'ed-extra': 9.99 });
  });
});

describe('getMonthChoiceGroups / submitMonthChoice — combo-aware month resolution', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
  });

  // ── resolveMonthHoldingSubscriptionIds — the other 3 shapes ──
  // The combo-with-variant-component case above was the one that actually 404'd in
  // production. These lock in the other shapes that same helper must also get right.

  it('getMonthChoiceGroups uses the subscription\'s own id for a normal (non-combo, non-variant) subscription', async () => {
    const normal = { id: 'normal-1', isCombo: false, parentSubscriptionId: null };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(normal as any);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'month-1' }]);
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValueOnce([]);

    await service.getMonthChoiceGroups('normal-slug', 2026, 7);

    expect(prisma.subscriptionMonth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subscriptionId: { in: ['normal-1'] }, year: 2026, month: 7 }) }),
    );
    // A normal sub is never a combo — resolution must not even attempt a component lookup
    expect(prisma.subscriptionComboComponent.findMany).not.toHaveBeenCalled();
  });

  it('getMonthChoiceGroups uses the PARENT content stream\'s id for a non-combo content-stream variant', async () => {
    const variant = { id: 'variant-1', isCombo: false, parentSubscriptionId: 'parent-2' };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(variant as any);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'month-1' }]);
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValueOnce([]);

    await service.getMonthChoiceGroups('variant-slug', 2026, 7);

    expect(prisma.subscriptionMonth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subscriptionId: { in: ['parent-2'] }, year: 2026, month: 7 }) }),
    );
  });

  it('getMonthChoiceGroups resolves combo components unchanged when a component is a regular (non-variant) subscription', async () => {
    const combo = { id: 'combo-2', isCombo: true, parentSubscriptionId: null };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(combo as any);
    (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValueOnce([{ componentId: 'regular-comp-1' }]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'regular-comp-1', parentSubscriptionId: null }]);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'month-1' }]);
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValueOnce([]);

    await service.getMonthChoiceGroups('combo-slug-2', 2026, 7);

    expect(prisma.subscriptionMonth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subscriptionId: { in: ['regular-comp-1'] }, year: 2026, month: 7 }) }),
    );
  });

  it('getMonthChoiceGroups resolves a combo subscription through its components\' effective parents', async () => {
    const combo = { id: 'combo-1', isCombo: true, parentSubscriptionId: null };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(combo as any);
    (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValueOnce([{ componentId: 'comp-1' }]);
    // resolveEffectiveComponentIds: comp-1 is itself a content-stream variant of parent-1
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'comp-1', parentSubscriptionId: 'parent-1' }]);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'month-1' }]);
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'group-1', monthId: 'month-1', options: [] },
    ]);

    const result = await service.getMonthChoiceGroups('combo-slug', 2026, 7);

    // Must have queried subscription_months scoped to the resolved parent, not the combo's own id
    expect(prisma.subscriptionMonth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subscriptionId: { in: ['parent-1'] }, year: 2026, month: 7 }) }),
    );
    expect(result).toEqual([expect.objectContaining({ id: 'group-1', myChoice: null })]);
  });

  it('submitMonthChoice finds the choice group via the resolved parent month, not the combo\'s own (nonexistent) one', async () => {
    const combo = { id: 'combo-1', isCombo: true, parentSubscriptionId: null };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(combo as any);
    (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValueOnce([{ componentId: 'comp-1' }]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'comp-1', parentSubscriptionId: 'parent-1' }]);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'month-1' }]);
    (prisma.subscriptionMonthChoiceGroup.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'group-1', monthId: 'month-1', allowMultiple: true, options: [{ id: 'mb-a' }],
    });
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: ENTRY_ID });
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    (prisma.userSubscriptionMonthChoice.upsert as jest.Mock).mockResolvedValueOnce({ id: 'choice-1' });
    (prisma.userMonthBookChoiceSelection.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    (prisma.userMonthBookChoiceSelection.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (prisma.subscriptionMonthBook.findMany as jest.Mock).mockResolvedValueOnce([]); // materialize: no matching rows, no-op

    await expect(
      service.submitMonthChoice('combo-slug', 2026, 7, 'group-1', USER_ID, { monthBookIds: ['mb-a'] }),
    ).resolves.toBeDefined();
  });

  it('submitMonthChoice throws NotFoundException when the group does not belong to any resolved month', async () => {
    const combo = { id: 'combo-1', isCombo: true, parentSubscriptionId: null };
    jest.spyOn(service, 'findBySlug').mockResolvedValue(combo as any);
    (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValueOnce([{ componentId: 'comp-1' }]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'comp-1', parentSubscriptionId: 'parent-1' }]);
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'month-1' }]);
    (prisma.subscriptionMonthChoiceGroup.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'group-1', monthId: 'some-other-month', allowMultiple: true, options: [],
    });

    await expect(
      service.submitMonthChoice('combo-slug', 2026, 7, 'group-1', USER_ID, { monthBookIds: ['mb-a'] }),
    ).rejects.toThrow(NotFoundException);
  });
});
