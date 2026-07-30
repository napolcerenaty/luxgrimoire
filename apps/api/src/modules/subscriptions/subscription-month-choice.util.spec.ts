/**
 * Regression tests for subscription-month-choice.util.ts — covers the book-choice bugs
 * found and fixed while testing the feature live:
 *
 *  1. resolveMonthBooksForEntry defaulted to "include everything" the instant no choice
 *     existed, regardless of whether the choice deadline had actually passed — meaning a
 *     user's pick could get silently pre-empted by both editions being created before they
 *     ever had a chance to choose (paymentOnStartup subscriptions creating the first box
 *     synchronously at join time). Fixed: deadline-aware — exclude until the deadline
 *     passes, only then fall back to "both".
 *  2. Nothing ever turned a resolved choice into an actual UserBookEntry outside of the
 *     narrow moments the resolver itself was consulted (renewal/backfill) — a user picking
 *     early, or the deadline-cron applying the default, recorded a choice that never
 *     materialized into a book. Fixed: materializeChoiceGroupBooks.
 *  3. persistMonthChoice's allowMultiple:false guard needs to stay lenient for the
 *     deadline-cron's 'default' source (which always resolves to every option), while still
 *     rejecting a user manually trying to pick more than one option in a single-pick group.
 */

import { BadRequestException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveMonthBooksForEntry,
  computeChoiceDeadline,
  persistMonthChoice,
  materializeChoiceGroupBooks,
} from './subscription-month-choice.util';

const ENTRY_ID = 'entry-1';
const GROUP_ID = 'group-1';
const OPT_A = 'opt-a';
const OPT_B = 'opt-b';

function makeGroupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: GROUP_ID,
    choiceDeadlineType: 'DAYS_BEFORE',
    choiceDeadlineDaysBefore: 1,
    choiceDeadlineDayOfMonth: null,
    month: { year: 2026, month: 7, subscription: { renewalDay: 1 } },
    ...overrides,
  };
}

function bookA(overrides: Record<string, unknown> = {}) {
  return { id: OPT_A, choiceGroupId: GROUP_ID, ...overrides };
}
function bookB(overrides: Record<string, unknown> = {}) {
  return { id: OPT_B, choiceGroupId: GROUP_ID, ...overrides };
}

describe('computeChoiceDeadline', () => {
  it('anchors DAYS_BEFORE to the renewal day, not the 1st of the month', () => {
    const deadline = computeChoiceDeadline(2026, 7, 15, {
      choiceDeadlineType: 'DAYS_BEFORE',
      choiceDeadlineDaysBefore: 2,
      choiceDeadlineDayOfMonth: null,
    });
    // July 15 minus 2 days = July 13
    expect(deadline.toISOString().slice(0, 10)).toBe('2026-07-13');
  });

  it('DAY_OF_MONTH overrides to a fixed day in the previous month', () => {
    const deadline = computeChoiceDeadline(2026, 7, 15, {
      choiceDeadlineType: 'DAY_OF_MONTH',
      choiceDeadlineDaysBefore: 0,
      choiceDeadlineDayOfMonth: 20,
    });
    expect(deadline.toISOString().slice(0, 10)).toBe('2026-06-20');
  });
});

describe('resolveMonthBooksForEntry', () => {
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
  });

  it('passes through books with no choiceGroupId untouched, without querying anything', async () => {
    const plain = [{ id: 'x', choiceGroupId: null }];
    const result = await resolveMonthBooksForEntry(prisma, ENTRY_ID, plain);
    expect(result).toEqual(plain);
    expect(prisma.userSubscriptionMonthChoice.findMany).not.toHaveBeenCalled();
  });

  it('respects an explicit choice — includes only the picked option(s)', async () => {
    (prisma.userSubscriptionMonthChoice.findMany as jest.Mock).mockResolvedValue([
      { choiceGroupId: GROUP_ID, selections: [{ monthBookId: OPT_A }] },
    ]);
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValue([makeGroupRow()]);

    const result = await resolveMonthBooksForEntry(prisma, ENTRY_ID, [bookA(), bookB()]);
    expect(result).toEqual([bookA()]);
  });

  it('regression: no choice yet + deadline NOT passed -> excludes the book entirely (does not default to both)', async () => {
    (prisma.userSubscriptionMonthChoice.findMany as jest.Mock).mockResolvedValue([]);
    // Deadline far in the future relative to "now"
    const futureYear = new Date().getUTCFullYear() + 5;
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValue([
      makeGroupRow({ month: { year: futureYear, month: 1, subscription: { renewalDay: 1 } } }),
    ]);

    const result = await resolveMonthBooksForEntry(prisma, ENTRY_ID, [bookA(), bookB()]);
    expect(result).toEqual([]);
  });

  it('no choice yet + deadline already passed -> falls back to including every option', async () => {
    (prisma.userSubscriptionMonthChoice.findMany as jest.Mock).mockResolvedValue([]);
    const pastYear = 2020;
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValue([
      makeGroupRow({ month: { year: pastYear, month: 1, subscription: { renewalDay: 1 } } }),
    ]);

    const result = await resolveMonthBooksForEntry(prisma, ENTRY_ID, [bookA(), bookB()]);
    expect(result).toEqual([bookA(), bookB()]);
  });

  it('mixes a non-grouped book with an unresolved choice-grouped book — the plain book always survives', async () => {
    (prisma.userSubscriptionMonthChoice.findMany as jest.Mock).mockResolvedValue([]);
    const futureYear = new Date().getUTCFullYear() + 5;
    (prisma.subscriptionMonthChoiceGroup.findMany as jest.Mock).mockResolvedValue([
      makeGroupRow({ month: { year: futureYear, month: 1, subscription: { renewalDay: 1 } } }),
    ]);

    const plain = { id: 'plain-1', choiceGroupId: null };
    const result = await resolveMonthBooksForEntry(prisma, ENTRY_ID, [plain, bookA(), bookB()]);
    expect(result).toEqual([plain]);
  });
});

describe('persistMonthChoice', () => {
  let prisma: DeepMockProxy<PrismaService>;
  const group = { id: GROUP_ID, allowMultiple: false, options: [{ id: OPT_A }, { id: OPT_B }] };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    (prisma.userSubscriptionMonthChoice.upsert as jest.Mock).mockResolvedValue({ id: 'choice-1' });
    (prisma.userMonthBookChoiceSelection.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.userMonthBookChoiceSelection.createMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('rejects an empty selection', async () => {
    await expect(persistMonthChoice(prisma, group, ENTRY_ID, [], 'user')).rejects.toThrow(BadRequestException);
  });

  it('rejects more than one pick in a single-option (allowMultiple:false) group from a user', async () => {
    await expect(persistMonthChoice(prisma, group, ENTRY_ID, [OPT_A, OPT_B], 'user')).rejects.toThrow(BadRequestException);
  });

  it('allows the deadline-cron "default" source to resolve to every option even when allowMultiple is false', async () => {
    await expect(persistMonthChoice(prisma, group, ENTRY_ID, [OPT_A, OPT_B], 'default')).resolves.toBeDefined();
  });

  it('rejects a selection that is not one of the group options', async () => {
    await expect(persistMonthChoice(prisma, group, ENTRY_ID, ['not-an-option'], 'user')).rejects.toThrow(BadRequestException);
  });

  it('replaces any prior selection: deletes old, creates new', async () => {
    await persistMonthChoice(prisma, group, ENTRY_ID, [OPT_A], 'user');
    expect(prisma.userMonthBookChoiceSelection.deleteMany).toHaveBeenCalledWith({ where: { userChoiceId: 'choice-1' } });
    expect(prisma.userMonthBookChoiceSelection.createMany).toHaveBeenCalledWith({
      data: [{ userChoiceId: 'choice-1', monthBookId: OPT_A }],
    });
  });
});

describe('materializeChoiceGroupBooks', () => {
  let prisma: DeepMockProxy<PrismaService>;
  const USER_ID = 'user-1';

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
  });

  it('does nothing when no monthBookIds are given', async () => {
    await materializeChoiceGroupBooks(prisma, USER_ID, ENTRY_ID, [], new Date(), 'OWNED');
    expect(prisma.subscriptionMonthBook.findMany).not.toHaveBeenCalled();
  });

  it('does nothing when the given ids do not resolve to any SubscriptionMonthBook rows', async () => {
    (prisma.subscriptionMonthBook.findMany as jest.Mock).mockResolvedValue([]);
    await materializeChoiceGroupBooks(prisma, USER_ID, ENTRY_ID, [OPT_A], new Date(), 'OWNED');
    expect(prisma.userPurchaseGroup.findFirst).not.toHaveBeenCalled();
  });

  it('reuses an existing purchase group for this entry+month instead of creating a new one', async () => {
    (prisma.subscriptionMonthBook.findMany as jest.Mock).mockResolvedValue([
      { bookId: 'book-1', editionId: 'ed-1', signatureType: null, month: { year: 2026, month: 7, signatureType: null } },
    ]);
    (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-pg' });
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'ube-1' });

    await materializeChoiceGroupBooks(prisma, USER_ID, ENTRY_ID, [OPT_A], new Date(), 'OWNED');

    expect(prisma.userPurchaseGroup.create).not.toHaveBeenCalled();
    expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ purchaseGroupId: 'existing-pg', editionId: 'ed-1', ownershipStatus: 'OWNED' }) }),
    );
  });

  it('creates a minimal purchase group from the entry\'s own cost fields when none exists yet', async () => {
    (prisma.subscriptionMonthBook.findMany as jest.Mock).mockResolvedValue([
      { bookId: 'book-1', editionId: 'ed-1', signatureType: null, month: { year: 2026, month: 7, signatureType: null } },
    ]);
    (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue({
      basePrice: { toString: () => '19.99' }, shippingCost: null, costCurrency: 'EUR',
    });
    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValue({ id: 'new-pg' });
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'ube-1' });

    await materializeChoiceGroupBooks(prisma, USER_ID, ENTRY_ID, [OPT_A], new Date(), 'PREORDER');

    expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalAmount: 19.99, currency: 'EUR', title: 'Subscription – 2026/07' }) }),
    );
  });

  it('is idempotent — skips creating an entry for an edition the user already has', async () => {
    (prisma.subscriptionMonthBook.findMany as jest.Mock).mockResolvedValue([
      { bookId: 'book-1', editionId: 'ed-1', signatureType: null, month: { year: 2026, month: 7, signatureType: null } },
    ]);
    (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-pg' });
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue({ id: 'already-there' });

    await materializeChoiceGroupBooks(prisma, USER_ID, ENTRY_ID, [OPT_A], new Date(), 'OWNED');

    expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
  });
});
