/**
 * Unit tests for SubscriptionsService.getManagedMonths() and manageSkips().
 *
 * Tests cover:
 *  1. getManagedMonths — returns only months whose renewal date has passed
 *  2. getManagedMonths — marks months with active skip records as isSkipped=true
 *  3. manageSkips — creates skip records for toSkip[]
 *  4. manageSkips — soft-deletes skip records for toUnskip[]
 *  5. manageSkips — adds books with OWNED status for past-renewal unskipped months
 *  6. manageSkips — adds books with PREORDER status for future-renewal unskipped months
 *  7. manageSkips — removes only subscription-sourced book entries when removeBooksForSkipped=true
 *  8. manageSkips — does NOT remove manually-added book entries (subscriptionEntryId mismatch)
 *  9. manageSkips — calls recomputeSkipState and refreshNextRenewalDate
 */

import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const SUB_ID = 'sub-ms-1';
const SUB_SLUG = 'ms-test-sub';
const USER_ID = 'user-ms-1';
const ENTRY_ID = 'entry-ms-1';
const MONTH_ID_MAY = 'month-ms-may';
const MONTH_ID_JUN = 'month-ms-jun';

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Manage Skips Test Sub',
    isCombo: false,
    componentIds: [],
    parentSubscriptionId: null,
    renewalDay: 15,
    renewalDayUserSet: false,
    renewalMonthOffset: 0,
    intervalMonths: 1,
    startingMonth: null,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: false,
    startDate: null,
    currency: 'GBP',
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    active: true,
    startDate: '2026-01-01',
    renewalDay: null,
    basePrice: '20.00',
    shippingCost: null,
    costCurrency: 'GBP',
    skipRecords: [],
    feeTemplates: [],
    ...overrides,
  };
}

describe('SubscriptionsService — getManagedMonths', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let skipEngMock: { recomputeSkipState: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T10:00:00Z'));

    prisma = mockDeep<PrismaService>();
    skipEngMock = { recomputeSkipState: jest.fn().mockResolvedValue(undefined) };
    service = new SubscriptionsService(
      prisma,
      {} as any,
      skipEngMock as any, // skipPolicyEngine (position 3)
      {} as any,
      {} as any,
      {} as any,
      { incrementSubscriberCount: jest.fn(), decrementSubscriberCount: jest.fn() } as any,
      { markStatsStale: jest.fn() } as any,
      { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('returns only months whose renewal date has passed (renewalDay=15, now=Jul 13)', async () => {
    jest.spyOn(service, 'findBySlug').mockResolvedValue(makeSub() as any);
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValue(
      makeEntry({ startDate: '2026-05-01', skipRecords: [] }),
    );
    // computeLastProcessedBoxMonth(Jul 13, 15, 0): refDay=13 < 15 → lastBilled=Jun → limit=Jun 2026
    // DB query bounded to [May..Jun], so mock returns only those two
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([
      { year: 2026, month: 5, books: [] },
      { year: 2026, month: 6, books: [] },
    ]);

    const result = await service.getManagedMonths(USER_ID, SUB_SLUG);

    expect(result.months).toHaveLength(2);
    expect(result.months.map(m => m.month)).toEqual([5, 6]);
    expect(result.months.every(m => m.year === 2026)).toBe(true);
  });

  it('marks months with active skip records as isSkipped=true', async () => {
    jest.spyOn(service, 'findBySlug').mockResolvedValue(makeSub() as any);
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValue(
      makeEntry({
        startDate: '2026-05-01',
        skipRecords: [{ month: { year: 2026, month: 5 } }], // May is skipped
      }),
    );
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([
      { year: 2026, month: 5, books: [] },
      { year: 2026, month: 6, books: [] },
    ]);

    const result = await service.getManagedMonths(USER_ID, SUB_SLUG);

    const may = result.months.find(m => m.month === 5);
    const jun = result.months.find(m => m.month === 6);
    expect(may?.isSkipped).toBe(true);
    expect(jun?.isSkipped).toBe(false);
  });

  it('extends the query range to include a future skipped month beyond the normal processed limit', async () => {
    // now=Jul 13 2026, renewalDay=15 → computeLastProcessedBoxMonth = Jun 2026 (the normal upper bound).
    // The user has an accidental skip on Dec 2026 (far in the future) — it must still be surfaced
    // here so it can be corrected, even though it's well past the "processed" cutoff.
    jest.spyOn(service, 'findBySlug').mockResolvedValue(makeSub() as any);
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValue(
      makeEntry({
        startDate: '2026-01-01',
        skipRecords: [{ month: { year: 2026, month: 12 } }],
      }),
    );
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([
      { year: 2026, month: 12, books: [] },
    ]);

    const result = await service.getManagedMonths(USER_ID, SUB_SLUG);

    // The query's upper bound must have been extended to December, not stopped at June.
    const queryArgs = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls[0][0];
    expect(queryArgs.where.AND[1]).toEqual({
      OR: [{ year: { lt: 2026 } }, { year: 2026, month: { lte: 12 } }],
    });

    const dec = result.months.find(m => m.month === 12);
    expect(dec?.isSkipped).toBe(true);
  });

  it('does not shrink the range when no skip is beyond the normal processed limit', async () => {
    jest.spyOn(service, 'findBySlug').mockResolvedValue(makeSub() as any);
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValue(
      makeEntry({ startDate: '2026-05-01', skipRecords: [{ month: { year: 2026, month: 5 } }] }),
    );
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);

    await service.getManagedMonths(USER_ID, SUB_SLUG);

    // Still bounded by the normal computeLastProcessedBoxMonth result (Jun 2026), unchanged.
    const queryArgs = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls[0][0];
    expect(queryArgs.where.AND[1]).toEqual({
      OR: [{ year: { lt: 2026 } }, { year: 2026, month: { lte: 6 } }],
    });
  });

  it('includes book title and author for each month', async () => {
    jest.spyOn(service, 'findBySlug').mockResolvedValue(makeSub() as any);
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValue(
      makeEntry({ startDate: '2026-06-01', skipRecords: [] }),
    );
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([
      {
        year: 2026,
        month: 6,
        books: [
          { book: { title: 'The Name of the Wind', authors: [{ author: { name: 'Patrick Rothfuss' } }] } },
        ],
      },
    ]);

    const result = await service.getManagedMonths(USER_ID, SUB_SLUG);

    expect(result.months[0].books[0].title).toBe('The Name of the Wind');
    expect(result.months[0].books[0].author).toBe('Patrick Rothfuss');
  });

  it('throws NotFoundException when entry not found', async () => {
    jest.spyOn(service, 'findBySlug').mockResolvedValue(makeSub() as any);
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.getManagedMonths(USER_ID, SUB_SLUG)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('respects renewalMonthOffset when computing renewal date', async () => {
    // offset=1: renewal for box month M fires in month M-1
    // User joins Jul 1, signupIncludesCurrentMonth=true:
    //   computeFirstEligibleBoxMonth(Jul 1, 15, 1, true):
    //     joinDay=1 < 15 → lastBilling=Jun → currentBox=Jun+1=Jul → first=Jul 2026
    //   computeLastProcessedBoxMonth(Jul 13, 15, 1):
    //     refDay=13 < 15 → lastBilled=Jun → box=Jun+1=Jul → limit=Jul 2026
    // DB returns Jul only; Aug box (renewal Jul 15) is excluded because Jul 15 > Jul 13
    jest.spyOn(service, 'findBySlug').mockResolvedValue(
      makeSub({ renewalMonthOffset: 1, signupIncludesCurrentMonth: true }) as any,
    );
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValue(
      makeEntry({ startDate: '2026-07-01', skipRecords: [] }),
    );
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([
      { year: 2026, month: 7, books: [] },
    ]);

    const result = await service.getManagedMonths(USER_ID, SUB_SLUG);

    expect(result.months).toHaveLength(1);
    expect(result.months[0].month).toBe(7);
  });
});

describe('SubscriptionsService — manageSkips', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let skipEngMock: { recomputeSkipState: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T10:00:00Z'));

    prisma = mockDeep<PrismaService>();
    skipEngMock = { recomputeSkipState: jest.fn().mockResolvedValue(undefined) };
    service = new SubscriptionsService(
      prisma,
      {} as any,
      skipEngMock as any, // skipPolicyEngine (position 3)
      {} as any,
      {} as any,
      {} as any,
      { incrementSubscriberCount: jest.fn(), decrementSubscriberCount: jest.fn() } as any,
      { markStatsStale: jest.fn() } as any,
      { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any,
    );
    // Default: update resolves, userSubscriptionEntry.findUnique for refreshNextRenewalDate
    (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValue({});
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => jest.useRealTimers());

  function setupBase() {
    jest.spyOn(service, 'findBySlug').mockResolvedValue(makeSub() as any);
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValue(
      makeEntry({ feeTemplates: [] }),
    );
  }

  it('creates skip records for months in toSkip', async () => {
    setupBase();
    (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue({ id: MONTH_ID_MAY });
    (prisma.userSkipRecord.upsert as jest.Mock).mockResolvedValue({});
    (prisma.userSkipRecord.updateMany as jest.Mock).mockResolvedValue({});

    await service.manageSkips(USER_ID, SUB_SLUG, {
      toSkip: [{ year: 2026, month: 5 }],
      toUnskip: [],
      addBooksForUnskipped: false,
      removeBooksForSkipped: false,
    });

    expect(prisma.userSkipRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userEntryId_subscriptionMonthId: { userEntryId: ENTRY_ID, subscriptionMonthId: MONTH_ID_MAY } },
        create: expect.objectContaining({ userId: USER_ID, userEntryId: ENTRY_ID }),
        update: expect.objectContaining({ undoneAt: null }),
      }),
    );
  });

  it('soft-deletes skip records for months in toUnskip', async () => {
    setupBase();
    (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue({ id: MONTH_ID_JUN });
    (prisma.userSkipRecord.upsert as jest.Mock).mockResolvedValue({});
    (prisma.userSkipRecord.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await service.manageSkips(USER_ID, SUB_SLUG, {
      toSkip: [],
      toUnskip: [{ year: 2026, month: 6 }],
      addBooksForUnskipped: false,
      removeBooksForSkipped: false,
    });

    expect(prisma.userSkipRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userEntryId: ENTRY_ID, subscriptionMonthId: MONTH_ID_JUN, undoneAt: null },
        data: { undoneAt: expect.any(Date) },
      }),
    );
  });

  it('adds books with OWNED status when ownershipStatusForUnskipped=OWNED', async () => {
    setupBase();
    (prisma.subscriptionMonth.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: MONTH_ID_JUN }) // for unskip
      .mockResolvedValueOnce({ // for addBooks
        year: 2026,
        month: 6,
        signatureType: null,
        books: [{ editionId: 'ed-1', bookId: 'book-1', signatureType: null }],
      });
    (prisma.userSkipRecord.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValue({ id: 'group-1' });
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'ube-1' });
    (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValue({});
    (prisma.userPurchaseFee.createMany as jest.Mock).mockResolvedValue({});

    await service.manageSkips(USER_ID, SUB_SLUG, {
      toSkip: [],
      toUnskip: [{ year: 2026, month: 6 }],
      addBooksForUnskipped: true,
      removeBooksForSkipped: false,
      ownershipStatusForUnskipped: 'OWNED',
    });

    expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownershipStatus: 'OWNED' }),
      }),
    );
    // Purchase group must include purchasedAt
    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ purchasedAt: expect.any(Date) }),
      }),
    );
  });

  it('adds books with PREORDER status when ownershipStatusForUnskipped=PREORDER', async () => {
    setupBase();
    (prisma.subscriptionMonth.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 'month-aug' }) // for unskip
      .mockResolvedValueOnce({
        year: 2026,
        month: 8, // August — renewal Aug 15 is in the future
        signatureType: null,
        books: [{ editionId: 'ed-2', bookId: 'book-2', signatureType: null }],
      });
    (prisma.userSkipRecord.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValue({ id: 'group-2' });
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'ube-2' });
    (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValue({});
    (prisma.userPurchaseFee.createMany as jest.Mock).mockResolvedValue({});

    await service.manageSkips(USER_ID, SUB_SLUG, {
      toSkip: [],
      toUnskip: [{ year: 2026, month: 8 }],
      addBooksForUnskipped: true,
      removeBooksForSkipped: false,
      ownershipStatusForUnskipped: 'PREORDER',
    });

    expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownershipStatus: 'PREORDER' }),
      }),
    );
  });

  it('removes subscription-sourced book entries when removeBooksForSkipped=true', async () => {
    setupBase();
    const bookEntry = { id: 'ube-skip-1', purchaseGroupId: 'group-skip-1' };
    (prisma.subscriptionMonth.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: MONTH_ID_MAY }) // for skip
      .mockResolvedValueOnce({ // for removeBooks
        books: [{ editionId: 'ed-may' }],
      });
    (prisma.userSkipRecord.upsert as jest.Mock).mockResolvedValue({});
    (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([bookEntry]);
    (prisma.userBookEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.ownershipStatusHistory.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.userBookEntry.count as jest.Mock).mockResolvedValue(0); // group is empty after delete
    (prisma.userPurchaseFee.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.userPurchaseGroup.delete as jest.Mock).mockResolvedValue({});

    await service.manageSkips(USER_ID, SUB_SLUG, {
      toSkip: [{ year: 2026, month: 5 }],
      toUnskip: [],
      addBooksForUnskipped: false,
      removeBooksForSkipped: true,
    });

    // Must search only for subscription-sourced entries
    expect(prisma.userBookEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subscriptionEntryId: ENTRY_ID }),
      }),
    );
    expect(prisma.userBookEntry.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['ube-skip-1'] } },
      }),
    );
    // Empty group cleaned up
    expect(prisma.userPurchaseGroup.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'group-skip-1' } }),
    );
  });

  it('does NOT remove book entries added manually (subscriptionEntryId filter)', async () => {
    setupBase();
    (prisma.subscriptionMonth.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: MONTH_ID_MAY })
      .mockResolvedValueOnce({ books: [{ editionId: 'ed-may' }] });
    (prisma.userSkipRecord.upsert as jest.Mock).mockResolvedValue({});
    // findMany returns empty — no subscription-sourced entries exist
    (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([]);

    await service.manageSkips(USER_ID, SUB_SLUG, {
      toSkip: [{ year: 2026, month: 5 }],
      toUnskip: [],
      addBooksForUnskipped: false,
      removeBooksForSkipped: true,
    });

    // No deletion when no subscription-sourced entries found
    expect(prisma.userBookEntry.deleteMany).not.toHaveBeenCalled();
  });

  it('calls recomputeSkipState and refreshNextRenewalDate after changes', async () => {
    setupBase();
    (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue({ id: MONTH_ID_MAY });
    (prisma.userSkipRecord.upsert as jest.Mock).mockResolvedValue({});

    await service.manageSkips(USER_ID, SUB_SLUG, {
      toSkip: [{ year: 2026, month: 5 }],
      toUnskip: [],
      addBooksForUnskipped: false,
      removeBooksForSkipped: false,
    });

    expect(skipEngMock.recomputeSkipState).toHaveBeenCalledWith(USER_ID, SUB_ID);
    // refreshNextRenewalDate hits findUnique to read the entry
    expect(prisma.userSubscriptionEntry.findUnique).toHaveBeenCalled();
  });

  it('throws NotFoundException when entry not found', async () => {
    jest.spyOn(service, 'findBySlug').mockResolvedValue(makeSub() as any);
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.manageSkips(USER_ID, SUB_SLUG, {
        toSkip: [],
        toUnskip: [],
        addBooksForUnskipped: false,
        removeBooksForSkipped: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
