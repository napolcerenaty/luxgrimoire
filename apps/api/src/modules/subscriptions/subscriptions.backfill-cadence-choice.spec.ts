/**
 * Book-choice mechanics × subscription cadence, at the backfillSubscription() level.
 *
 * subscription-month-choice.util.spec.ts covers resolveMonthBooksForEntry/persistMonthChoice/
 * materializeChoiceGroupBooks in isolation (single month, cadence-agnostic). subscriptions
 * .book-choice-bugs.spec.ts covers choice resolution for the COMBO backfill path only.
 * subscriptions.backfill-bundle.spec.ts covers bundle (bimonthly/quarterly) grouping and
 * pricing but never exercises a choice group inside a bundle.
 *
 * Nothing previously exercised a choice group through backfillSubscription for a plain
 * (non-combo) subscription across monthly / bimonthly / quarterly cadences — in particular
 * whether resolveMonthBooksForEntry's deadline-aware exclude/default-both fallback plays
 * correctly with bundle grouping (one purchase unit spanning multiple SubscriptionMonth rows,
 * deduped by editionId before the choice resolves).
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const SUB_ID = 'sub-cadence-1';
const SUB_SLUG = 'cadence-test-sub';
const USER_ID = 'user-cadence-1';
const ENTRY_ID = 'entry-cadence-1';

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Cadence Choice Test Sub',
    isCombo: false,
    componentIds: [],
    currency: 'USD',
    renewalDay: 1,
    renewalDayUserSet: false,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: false,
    renewalMonthOffset: 0,
    isContentStream: false,
    isBundleSubscription: false,
    intervalMonths: 1,
    startingMonth: 1,
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    startDate: '2026-04-05',
    cancellationDate: null,
    renewalDay: 1,
    basePrice: { toString: () => '30.00' },
    costCurrency: 'USD',
    shippingCost: null,
    firstSkipDate: null,
    feeTemplates: [],
    ...overrides,
  };
}

type MonthBook = { id: string; editionId: string; bookId: string; signatureType: null; choiceGroupId: string | null };

function makeMonth(id: string, year: number, month: number, books: MonthBook[]) {
  return { id, year, month, signatureType: null, books };
}

function book(id: string, choiceGroupId: string | null = null): MonthBook {
  return { id, editionId: `ed-${id}`, bookId: `book-${id}`, signatureType: null, choiceGroupId };
}

/** Wires up the mocks shared by every backfillSubscription() call in this file. */
function setupBackfill(
  prisma: DeepMockProxy<PrismaService>,
  skipMock: { recomputeSkipState: jest.Mock },
  options: {
    entry?: ReturnType<typeof makeEntry>;
    months: ReturnType<typeof makeMonth>[];
    purchaseGroupIds: string[];
    /** One entry per unit that contains a choice-grouped book, in unit-processing order. */
    choiceResolutions?: {
      choices: { choiceGroupId: string; selections: { monthBookId: string }[] }[];
      groups: {
        id: string;
        choiceDeadlineType: string;
        choiceDeadlineDaysBefore: number;
        choiceDeadlineDayOfMonth: number | null;
        month: { year: number; month: number; subscription: { renewalDay: number } };
      }[];
    }[];
  },
) {
  const { entry = makeEntry(), months, purchaseGroupIds, choiceResolutions = [] } = options;

  (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);
  (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
  (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce(months);
  (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);

  for (const res of choiceResolutions) {
    (prisma.userSubscriptionMonthChoice.findMany as jest.Mock).mockResolvedValueOnce(res.choices);
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValueOnce(res.groups);
  }

  for (const pgId of purchaseGroupIds) {
    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: pgId });
  }
  (prisma.userPurchaseGroup.update as jest.Mock).mockResolvedValue({ id: purchaseGroupIds[0] });

  // Generous supply of book-entry mocks — exact count consumed depends on the resolved choice.
  (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.userBookEntry.create as jest.Mock).mockImplementation((args: any) =>
    Promise.resolve({ id: `be-${args.data.editionId}` }),
  );
  (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValue({});

  (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ id: SUB_ID, skipPolicies: [] });
  (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]);

  skipMock.recomputeSkipState.mockResolvedValueOnce(undefined);
}

function createdEditions(prisma: DeepMockProxy<PrismaService>): string[] {
  return (prisma.userBookEntry.create as jest.Mock).mock.calls.map((c: any) => c[0].data.editionId).sort();
}

describe('SubscriptionsService — backfillSubscription book choice across cadences', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let skipMock: { recomputeSkipState: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    skipMock = { recomputeSkipState: jest.fn() };

    service = new SubscriptionsService(
      prisma,
      {} as any,
      skipMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { markStatsStale: jest.fn() } as any,
      { del: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('monthly (intervalMonths=1, non-bundle): explicit choice creates only the picked edition alongside the plain book', async () => {
    const sub = makeSub({ intervalMonths: 1, isBundleSubscription: false });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [makeMonth('m-jul', 2026, 7, [book('mb-a', 'group-1'), book('mb-b', 'group-1'), book('mb-plain')])];
    setupBackfill(prisma, skipMock, {
      entry: makeEntry({ basePrice: { toString: () => '30.00' } }),
      months,
      purchaseGroupIds: ['pg-jul'],
      choiceResolutions: [
        { choices: [{ choiceGroupId: 'group-1', selections: [{ monthBookId: 'mb-a' }] }], groups: [] },
      ],
    });

    await service.backfillSubscription(USER_ID, SUB_SLUG, { selectedMonthIds: ['m-jul'] } as any);

    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledTimes(1);
    expect(createdEditions(prisma)).toEqual(['ed-mb-a', 'ed-mb-plain']);
    const byEdition = Object.fromEntries(
      (prisma.userBookEntry.create as jest.Mock).mock.calls.map((c: any) => [c[0].data.editionId, c[0].data.basePrice]),
    );
    expect(byEdition).toEqual({ 'ed-mb-a': 15, 'ed-mb-plain': 15 });
  });

  it('bimonthly, non-bundle (intervalMonths=2, isBundleSubscription=false): each month is its own purchase unit with independently resolved choices', async () => {
    const sub = makeSub({ intervalMonths: 2, isBundleSubscription: false });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [
      makeMonth('m-jul', 2026, 7, [book('mb-a', 'group-1'), book('mb-b', 'group-1')]),
      makeMonth('m-aug', 2026, 8, [book('mb-plain2')]),
    ];
    setupBackfill(prisma, skipMock, {
      months,
      purchaseGroupIds: ['pg-jul', 'pg-aug'],
      choiceResolutions: [
        { choices: [{ choiceGroupId: 'group-1', selections: [{ monthBookId: 'mb-a' }] }], groups: [] },
      ],
    });

    await service.backfillSubscription(USER_ID, SUB_SLUG, { selectedMonthIds: ['m-jul', 'm-aug'] } as any);

    // Two calendar months → two separate purchase groups, not bundled.
    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledTimes(2);
    expect(createdEditions(prisma)).toEqual(['ed-mb-a', 'ed-mb-plain2']);
    const calls = (prisma.userBookEntry.create as jest.Mock).mock.calls;
    const julGroupId = (prisma.userPurchaseGroup.create as jest.Mock).mock.results[0].value;
    expect(calls.find((c: any) => c[0].data.editionId === 'ed-mb-a')[0].data.purchaseGroupId).toBe('pg-jul');
    expect(calls.find((c: any) => c[0].data.editionId === 'ed-mb-plain2')[0].data.purchaseGroupId).toBe('pg-aug');
  });

  it('quarterly bundle (intervalMonths=3, isBundleSubscription=true): a choice group in the middle month resolves before the 3 months are merged into one purchase group', async () => {
    const sub = makeSub({ intervalMonths: 3, isBundleSubscription: true, startingMonth: 1 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [
      makeMonth('m-apr', 2026, 4, [book('mb-apr')]),
      makeMonth('m-may', 2026, 5, [book('mb-a', 'group-1'), book('mb-b', 'group-1')]),
      makeMonth('m-jun', 2026, 6, [book('mb-jun')]),
    ];
    setupBackfill(prisma, skipMock, {
      entry: makeEntry({ basePrice: { toString: () => '45.00' }, shippingCost: { toString: () => '12.00' } }),
      months,
      purchaseGroupIds: ['pg-bundle-1'],
      choiceResolutions: [
        { choices: [{ choiceGroupId: 'group-1', selections: [{ monthBookId: 'mb-a' }] }], groups: [] },
      ],
    });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-apr', 'm-may', 'm-jun'],
    } as any);

    // ONE purchase group for the whole quarter, and the unpicked alternative (ed-mb-b) never created.
    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledTimes(1);
    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalAmount: 45, shippingAmount: 12 }) }),
    );
    expect(createdEditions(prisma)).toEqual(['ed-mb-a', 'ed-mb-apr', 'ed-mb-jun']);
    const byEdition = Object.fromEntries(
      (prisma.userBookEntry.create as jest.Mock).mock.calls.map((c: any) => [c[0].data.editionId, c[0].data.basePrice]),
    );
    // 45 split evenly across the 3 resolved editions — ed-mb-b never enters the split.
    expect(byEdition).toEqual({ 'ed-mb-apr': 15, 'ed-mb-a': 15, 'ed-mb-jun': 15 });
  });

  it('quarterly bundle: an unresolved choice group before its deadline is excluded entirely from the bundle (not defaulted to both)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.UTC(2026, 3, 15))); // Apr 15, 2026 — before the deadline below

    const sub = makeSub({ intervalMonths: 3, isBundleSubscription: true, startingMonth: 1 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [
      makeMonth('m-apr', 2026, 4, [book('mb-apr')]),
      makeMonth('m-may', 2026, 5, [book('mb-a', 'group-1'), book('mb-b', 'group-1')]),
      makeMonth('m-jun', 2026, 6, [book('mb-jun')]),
    ];
    setupBackfill(prisma, skipMock, {
      entry: makeEntry({ basePrice: { toString: () => '45.00' } }),
      months,
      purchaseGroupIds: ['pg-bundle-1'],
      choiceResolutions: [
        {
          choices: [], // nobody has picked yet
          groups: [
            {
              id: 'group-1',
              choiceDeadlineType: 'RENEWAL_RELATIVE',
              choiceDeadlineDaysBefore: 5,
              choiceDeadlineDayOfMonth: null,
              // deadline = May 5 2026 minus 5 days = Apr 30 2026 — "now" (Apr 15) is before it
              month: { year: 2026, month: 5, subscription: { renewalDay: 5 } },
            },
          ],
        },
      ],
    });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-apr', 'm-may', 'm-jun'],
    } as any);

    // Neither alternative created yet — the user still has time to choose.
    expect(createdEditions(prisma)).toEqual(['ed-mb-apr', 'ed-mb-jun']);
    const byEdition = Object.fromEntries(
      (prisma.userBookEntry.create as jest.Mock).mock.calls.map((c: any) => [c[0].data.editionId, c[0].data.basePrice]),
    );
    // 45 split across only the 2 non-choice editions, not divided down for a phantom 3rd/4th slot.
    expect(byEdition).toEqual({ 'ed-mb-apr': 22.5, 'ed-mb-jun': 22.5 });
  });

  it('quarterly bundle: an unresolved choice group past its deadline defaults to including every alternative', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.UTC(2026, 5, 1))); // Jun 1, 2026 — after the Apr 30 deadline

    const sub = makeSub({ intervalMonths: 3, isBundleSubscription: true, startingMonth: 1 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [
      makeMonth('m-apr', 2026, 4, [book('mb-apr')]),
      makeMonth('m-may', 2026, 5, [book('mb-a', 'group-1'), book('mb-b', 'group-1')]),
      makeMonth('m-jun', 2026, 6, [book('mb-jun')]),
    ];
    setupBackfill(prisma, skipMock, {
      entry: makeEntry({ basePrice: { toString: () => '45.00' } }),
      months,
      purchaseGroupIds: ['pg-bundle-1'],
      choiceResolutions: [
        {
          choices: [],
          groups: [
            {
              id: 'group-1',
              choiceDeadlineType: 'RENEWAL_RELATIVE',
              choiceDeadlineDaysBefore: 5,
              choiceDeadlineDayOfMonth: null,
              month: { year: 2026, month: 5, subscription: { renewalDay: 5 } },
            },
          ],
        },
      ],
    });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-apr', 'm-may', 'm-jun'],
    } as any);

    // Deadline passed with no pick — falls back to "both", same as the deadline-cron default.
    expect(createdEditions(prisma)).toEqual(['ed-mb-a', 'ed-mb-apr', 'ed-mb-b', 'ed-mb-jun']);
    const byEdition = Object.fromEntries(
      (prisma.userBookEntry.create as jest.Mock).mock.calls.map((c: any) => [c[0].data.editionId, c[0].data.basePrice]),
    );
    expect(byEdition).toEqual({ 'ed-mb-apr': 11.25, 'ed-mb-a': 11.25, 'ed-mb-b': 11.25, 'ed-mb-jun': 11.25 });
  });

  it('bimonthly bundle (intervalMonths=2, isBundleSubscription=true): choice in the first month still merges into one purchase group covering both months', async () => {
    const sub = makeSub({ intervalMonths: 2, isBundleSubscription: true, startingMonth: 1 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [
      makeMonth('m-jan', 2026, 1, [book('mb-a', 'group-1'), book('mb-b', 'group-1')]),
      makeMonth('m-feb', 2026, 2, [book('mb-feb')]),
    ];
    setupBackfill(prisma, skipMock, {
      entry: makeEntry({ basePrice: { toString: () => '20.00' } }),
      months,
      purchaseGroupIds: ['pg-bimonthly-1'],
      choiceResolutions: [
        { choices: [{ choiceGroupId: 'group-1', selections: [{ monthBookId: 'mb-b' }] }], groups: [] },
      ],
    });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-jan', 'm-feb'],
    } as any);

    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledTimes(1);
    expect(createdEditions(prisma)).toEqual(['ed-mb-b', 'ed-mb-feb']);
    for (const call of (prisma.userBookEntry.create as jest.Mock).mock.calls) {
      expect(call[0].data.purchaseGroupId).toBe('pg-bimonthly-1');
    }
  });

  // ── price-per-book overrides (dto.bookPrices) combined with a resolved choice ──
  // resolvePerBookPrices runs with allowGrowth:true here: an override is always an extra
  // paid on top, never a reduced carve-out of the other resolved books' shares.

  it('monthly: a bookPrices override on the CHOSEN edition is an extra on top — the plain book keeps its full base share', async () => {
    const sub = makeSub({ intervalMonths: 1, isBundleSubscription: false });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [makeMonth('m-jul', 2026, 7, [book('mb-a', 'group-1'), book('mb-b', 'group-1'), book('mb-plain')])];
    setupBackfill(prisma, skipMock, {
      entry: makeEntry({ basePrice: { toString: () => '30.00' } }),
      months,
      purchaseGroupIds: ['pg-jul'],
      choiceResolutions: [
        { choices: [{ choiceGroupId: 'group-1', selections: [{ monthBookId: 'mb-a' }] }], groups: [] },
      ],
    });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-jul'],
      bookPrices: [{ monthId: 'm-jul', editionId: 'ed-mb-a', price: 10 }],
    } as any);

    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalAmount: 40, priceDistribution: 'CUSTOM' }) }), // 10 + 30
    );
    const byEdition = Object.fromEntries(
      (prisma.userBookEntry.create as jest.Mock).mock.calls.map((c: any) => [c[0].data.editionId, c[0].data.basePrice]),
    );
    expect(byEdition).toEqual({ 'ed-mb-a': 10, 'ed-mb-plain': 30 });
  });

  it('quarterly bundle: a bookPrices override targeting the UNPICKED choice alternative is silently ignored — resolved books keep an equal split', async () => {
    const sub = makeSub({ intervalMonths: 3, isBundleSubscription: true, startingMonth: 1 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [
      makeMonth('m-apr', 2026, 4, [book('mb-apr')]),
      makeMonth('m-may', 2026, 5, [book('mb-a', 'group-1'), book('mb-b', 'group-1')]),
      makeMonth('m-jun', 2026, 6, [book('mb-jun')]),
    ];
    setupBackfill(prisma, skipMock, {
      entry: makeEntry({ basePrice: { toString: () => '45.00' } }),
      months,
      purchaseGroupIds: ['pg-bundle-1'],
      choiceResolutions: [
        { choices: [{ choiceGroupId: 'group-1', selections: [{ monthBookId: 'mb-a' }] }], groups: [] },
      ],
    });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-apr', 'm-may', 'm-jun'],
      // ed-mb-b was never resolved (mb-a was picked instead) — this override must not
      // create an orphaned allocation or otherwise perturb the purchase group's pricing.
      bookPrices: [{ monthId: 'm-may', editionId: 'ed-mb-b', price: 99 }],
    } as any);

    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalAmount: 45, priceDistribution: 'EQUAL' }) }),
    );
    expect(createdEditions(prisma)).toEqual(['ed-mb-a', 'ed-mb-apr', 'ed-mb-jun']);
    const byEdition = Object.fromEntries(
      (prisma.userBookEntry.create as jest.Mock).mock.calls.map((c: any) => [c[0].data.editionId, c[0].data.basePrice]),
    );
    expect(byEdition).toEqual({ 'ed-mb-apr': 15, 'ed-mb-a': 15, 'ed-mb-jun': 15 });
  });

  it('quarterly bundle: a bookPrices override on the CHOSEN edition is an extra on top of the bundle total, split evenly with the other resolved months', async () => {
    const sub = makeSub({ intervalMonths: 3, isBundleSubscription: true, startingMonth: 1 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const months = [
      makeMonth('m-apr', 2026, 4, [book('mb-apr')]),
      makeMonth('m-may', 2026, 5, [book('mb-a', 'group-1'), book('mb-b', 'group-1')]),
      makeMonth('m-jun', 2026, 6, [book('mb-jun')]),
    ];
    setupBackfill(prisma, skipMock, {
      entry: makeEntry({ basePrice: { toString: () => '45.00' } }),
      months,
      purchaseGroupIds: ['pg-bundle-1'],
      choiceResolutions: [
        { choices: [{ choiceGroupId: 'group-1', selections: [{ monthBookId: 'mb-a' }] }], groups: [] },
      ],
    });

    await service.backfillSubscription(USER_ID, SUB_SLUG, {
      selectedMonthIds: ['m-apr', 'm-may', 'm-jun'],
      bookPrices: [{ monthId: 'm-may', editionId: 'ed-mb-a', price: 20 }],
    } as any);

    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalAmount: 65, priceDistribution: 'CUSTOM' }) }), // 20 + 22.5 + 22.5
    );
    const byEdition = Object.fromEntries(
      (prisma.userBookEntry.create as jest.Mock).mock.calls.map((c: any) => [c[0].data.editionId, c[0].data.basePrice]),
    );
    // ed-mb-apr / ed-mb-jun each keep the FULL bundle share (45/2 = 22.5), not a shrunken
    // (45-20)/2 = 12.5 — the override adds on top, it doesn't carve into the other months.
    expect(byEdition).toEqual({ 'ed-mb-apr': 22.5, 'ed-mb-a': 20, 'ed-mb-jun': 22.5 });
  });
});
