/**
 * Unit tests for a bug fix: BookEdition.subscriptionId is a denormalized "which subscription is
 * this from" flag, backfilled by addBookToMonth but never unset when the link that set it goes
 * away — an edition kept reading as "part of a subscription" long after the last
 * SubscriptionMonthBook row linking it to one was deleted (via removeBookFromMonth, deleteMonth,
 * or markMonthSkipped's content-deletion path).
 *
 * Covers:
 *  1. removeBookFromMonth clears the flag once no SubscriptionMonthBook links remain
 *  2. removeBookFromMonth leaves the flag alone if another link to the same edition still exists
 *  3. deleteMonth clears the flag for each of its linked editions, once orphaned
 *  4. deleteMonth leaves the flag alone for an edition still linked from another month
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const SUB_ID = 'sub-1';
const SUB_SLUG = 'test-sub';
const MONTH_ID = 'month-1';
const MONTH_BOOK_ID = 'mb-1';
const EDITION_ID = 'edition-1';

function makeSub(overrides: Record<string, unknown> = {}) {
  return { id: SUB_ID, slug: SUB_SLUG, parentSubscriptionId: null, ...overrides };
}

function makeService(prisma: DeepMockProxy<PrismaService>) {
  return new SubscriptionsService(
    prisma,
    {} as any, // typesense
    {} as any, // skipPolicyEngine
    {} as any, // renewalCron
    {} as any, // countryFeeSnapshotService
    { deleteImages: jest.fn().mockResolvedValue(undefined) } as any, // uploadService
    {} as any, // crowdStatsService
    {} as any, // statsService
    { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() } as any, // cache
  );
}

describe('SubscriptionsService — removeBookFromMonth clears orphaned edition subscription flag', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(makeSub());
    (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValue({ id: MONTH_ID });
    (prisma.subscriptionMonthBook.findUnique as jest.Mock).mockResolvedValue({
      id: MONTH_BOOK_ID, monthId: MONTH_ID, editionId: EDITION_ID,
    });
    (prisma.subscriptionMonthBook.delete as jest.Mock).mockResolvedValue({ id: MONTH_BOOK_ID });
    (prisma.bookEdition.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('clears BookEdition.subscriptionId once no SubscriptionMonthBook links remain', async () => {
    (prisma.subscriptionMonthBook.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await service.removeBookFromMonth(SUB_SLUG, 2026, 8, MONTH_BOOK_ID);

    expect(prisma.subscriptionMonthBook.findFirst).toHaveBeenCalledWith({ where: { editionId: EDITION_ID } });
    expect(prisma.bookEdition.updateMany).toHaveBeenCalledWith({
      where: { id: EDITION_ID },
      data: { subscriptionId: null },
    });
  });

  it('leaves the flag alone when the edition is still linked from another month', async () => {
    (prisma.subscriptionMonthBook.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'mb-2', editionId: EDITION_ID });

    await service.removeBookFromMonth(SUB_SLUG, 2026, 8, MONTH_BOOK_ID);

    expect(prisma.bookEdition.updateMany).not.toHaveBeenCalled();
  });
});

describe('SubscriptionsService — deleteMonth clears orphaned edition subscription flags', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(makeSub());
    (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValue({
      id: MONTH_ID, coverImage: null, spoilerImage: null,
    });
    (prisma.subscriptionMonth.delete as jest.Mock).mockResolvedValue({ id: MONTH_ID });
    (prisma.bookEdition.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('clears the flag for a linked edition once the month (and its cascade-deleted link) is gone', async () => {
    (prisma.subscriptionMonthBook.findMany as jest.Mock).mockResolvedValueOnce([{ editionId: EDITION_ID }]);
    (prisma.subscriptionMonthBook.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await service.deleteMonth(SUB_SLUG, 2026, 8);

    expect(prisma.subscriptionMonth.delete).toHaveBeenCalledWith({ where: { id: MONTH_ID } });
    expect(prisma.bookEdition.updateMany).toHaveBeenCalledWith({
      where: { id: EDITION_ID },
      data: { subscriptionId: null },
    });
  });

  it('leaves the flag alone for an edition still linked from a different month', async () => {
    (prisma.subscriptionMonthBook.findMany as jest.Mock).mockResolvedValueOnce([{ editionId: EDITION_ID }]);
    (prisma.subscriptionMonthBook.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'mb-elsewhere', editionId: EDITION_ID });

    await service.deleteMonth(SUB_SLUG, 2026, 8);

    expect(prisma.bookEdition.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing extra when the month had no linked books at all', async () => {
    (prisma.subscriptionMonthBook.findMany as jest.Mock).mockResolvedValueOnce([]);

    await service.deleteMonth(SUB_SLUG, 2026, 8);

    expect(prisma.subscriptionMonthBook.findFirst).not.toHaveBeenCalled();
    expect(prisma.bookEdition.updateMany).not.toHaveBeenCalled();
  });
});
