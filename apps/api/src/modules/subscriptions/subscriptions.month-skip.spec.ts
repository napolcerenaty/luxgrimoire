/**
 * Unit tests for SubscriptionsService.markMonthSkipped() / unmarkMonthSkipped()
 * — the admin-declared, company-wide "this month doesn't happen" feature
 * (SubscriptionMonthSkip), distinct from the per-user manageSkips/UserSkipRecord flow.
 *
 * Covers:
 *  1. markMonthSkipped cascades to the content stream (parent + every variant),
 *     writing one row per member and recomputing every one of their active entries
 *  2. markMonthSkipped never creates a UserSkipRecord row (regression guard)
 *  3. unmarkMonthSkipped is deliberately scoped to exactly the slug passed in —
 *     siblings/parent are untouched (the "correct a single variant" workflow)
 *  4. bulk-recompute resilience: one entry failing doesn't stop the rest, and the
 *     {succeeded, failed} summary accounts for every entry
 *  5. combo subscriptions are rejected for both mark and unmark
 *  6. idempotent double-mark (upsert-based toggle, not create-only)
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const PARENT_ID = 'sub-parent';
const PARENT_SLUG = 'parent-slug';
const VARIANT_1_ID = 'sub-variant-1';
const VARIANT_1_SLUG = 'variant-1-slug';
const VARIANT_2_ID = 'sub-variant-2';
const YEAR = 2026;
const MONTH = 9;
const ADMIN_ID = 'admin-1';

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: PARENT_ID,
    slug: PARENT_SLUG,
    isCombo: false,
    parentSubscriptionId: null,
    companyId: 'company-1',
    ...overrides,
  };
}

function makeService(prisma: DeepMockProxy<PrismaService>) {
  return new SubscriptionsService(
    prisma,
    {} as any, // typesense
    {} as any, // skipPolicyEngine
    {} as any, // renewalCron
    {} as any, // countryFeeSnapshotService
    {} as any, // uploadService
    {} as any, // crowdStatsService
    {} as any, // statsService
    { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() } as any, // cache
  );
}

describe('SubscriptionsService — markMonthSkipped', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
    (prisma.subscriptionMonthSkip.upsert as jest.Mock).mockResolvedValue({});
    (prisma.subscriptionMonthSkip.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    // refreshNextRenewalDate no-ops cleanly when findUnique resolves undefined — the actual
    // renewal-date math is covered separately in refresh-next-renewal-date.spec.ts; here we
    // only care that the orchestration (which entries get touched, and how failures propagate)
    // is correct.
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(undefined);
  });

  it('cascades to the content stream: writes a skip row for the parent and every variant', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(makeSub());
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
      { id: PARENT_ID }, { id: VARIANT_1_ID }, { id: VARIANT_2_ID },
    ]);
    (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'entry-1' }, { id: 'entry-2' }, { id: 'entry-3' },
    ]);

    const result = await service.markMonthSkipped(PARENT_SLUG, YEAR, MONTH, 'shipping delay', ADMIN_ID);

    expect(prisma.subscriptionMonthSkip.upsert).toHaveBeenCalledTimes(3);
    for (const id of [PARENT_ID, VARIANT_1_ID, VARIANT_2_ID]) {
      expect(prisma.subscriptionMonthSkip.upsert).toHaveBeenCalledWith({
        where: { subscriptionId_year_month: { subscriptionId: id, year: YEAR, month: MONTH } },
        create: { subscriptionId: id, year: YEAR, month: MONTH, reason: 'shipping delay', createdBy: ADMIN_ID },
        update: { undoneAt: null, reason: 'shipping delay', createdBy: ADMIN_ID },
      });
    }
    expect(result.memberSubscriptionIds).toEqual([PARENT_ID, VARIANT_1_ID, VARIANT_2_ID]);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toEqual([]);
  });

  it('marking via a variant\'s own slug still resolves to the shared content-stream id', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(
      makeSub({ id: VARIANT_1_ID, slug: VARIANT_1_SLUG, parentSubscriptionId: PARENT_ID }),
    );
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
      { id: PARENT_ID }, { id: VARIANT_1_ID }, { id: VARIANT_2_ID },
    ]);
    (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);

    const result = await service.markMonthSkipped(VARIANT_1_SLUG, YEAR, MONTH, undefined, ADMIN_ID);

    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ id: PARENT_ID }, { parentSubscriptionId: PARENT_ID }] },
      }),
    );
    expect(result.subscriptionId).toBe(PARENT_ID);
    expect(prisma.subscriptionMonthSkip.upsert).toHaveBeenCalledTimes(3);
  });

  it('never creates a UserSkipRecord row — the personal skip table stays untouched', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(makeSub());
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([{ id: PARENT_ID }]);
    (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);

    await service.markMonthSkipped(PARENT_SLUG, YEAR, MONTH, undefined, ADMIN_ID);

    expect(prisma.userSkipRecord.upsert).not.toHaveBeenCalled();
    expect(prisma.userSkipRecord.create).not.toHaveBeenCalled();
    expect(prisma.userSkipRecord.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a combo subscription with a clear error, not a silent no-op', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(makeSub({ isCombo: true }));

    await expect(service.markMonthSkipped(PARENT_SLUG, YEAR, MONTH, undefined, ADMIN_ID))
      .rejects.toThrow(BadRequestException);
    expect(prisma.subscriptionMonthSkip.upsert).not.toHaveBeenCalled();
  });

  it('double-marking an already-skipped month is idempotent (upsert-based toggle, no duplicate-row error)', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(makeSub());
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([{ id: PARENT_ID }]);
    (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValue([]);

    await service.markMonthSkipped(PARENT_SLUG, YEAR, MONTH, 'first reason', ADMIN_ID);
    await expect(service.markMonthSkipped(PARENT_SLUG, YEAR, MONTH, 'updated reason', ADMIN_ID))
      .resolves.not.toThrow();

    expect(prisma.subscriptionMonthSkip.upsert).toHaveBeenCalledTimes(2);
  });

  it('bulk-recompute resilience: one entry failing does not stop the rest, and the summary counts both', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(makeSub());
    (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([{ id: PARENT_ID }]);
    (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'entry-ok-1' }, { id: 'entry-fails' }, { id: 'entry-ok-2' },
    ]);
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockImplementation((args: any) => {
      if (args.where.id === 'entry-fails') return Promise.reject(new Error('boom'));
      return Promise.resolve(undefined);
    });

    const result = await service.markMonthSkipped(PARENT_SLUG, YEAR, MONTH, undefined, ADMIN_ID);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toEqual([{ entryId: 'entry-fails', error: 'boom' }]);
    // succeeded + failed accounts for every entry that was attempted
    expect(result.succeeded + result.failed.length).toBe(3);
  });
});

describe('SubscriptionsService — unmarkMonthSkipped', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
    (prisma.subscriptionMonthSkip.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(undefined);
  });

  it('is scoped to exactly the one subscription in slug — not cascaded to the content stream', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(
      makeSub({ id: VARIANT_1_ID, slug: VARIANT_1_SLUG, parentSubscriptionId: PARENT_ID }),
    );
    (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'entry-1' }]);

    const result = await service.unmarkMonthSkipped(VARIANT_1_SLUG, YEAR, MONTH);

    expect(prisma.subscriptionMonthSkip.updateMany).toHaveBeenCalledWith({
      where: { subscriptionId: VARIANT_1_ID, year: YEAR, month: MONTH, undoneAt: null },
      data: { undoneAt: expect.any(Date) },
    });
    // No parent/variant resolution query at all — this is the whole point of the asymmetry
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    expect(prisma.userSubscriptionEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subscriptionId: { in: [VARIANT_1_ID] }, active: true } }),
    );
    expect(result.subscriptionId).toBe(VARIANT_1_ID);
  });

  it('unmarking the parent does not touch sibling variants\' rows', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(makeSub());
    (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);

    await service.unmarkMonthSkipped(PARENT_SLUG, YEAR, MONTH);

    expect(prisma.subscriptionMonthSkip.updateMany).toHaveBeenCalledWith({
      where: { subscriptionId: PARENT_ID, year: YEAR, month: MONTH, undoneAt: null },
      data: { undoneAt: expect.any(Date) },
    });
  });

  it('rejects a combo subscription with a clear error', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(makeSub({ isCombo: true }));

    await expect(service.unmarkMonthSkipped(PARENT_SLUG, YEAR, MONTH)).rejects.toThrow(BadRequestException);
    expect(prisma.subscriptionMonthSkip.updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op, not an error, when the subscription was never skipped', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(makeSub());
    (prisma.subscriptionMonthSkip.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);

    await expect(service.unmarkMonthSkipped(PARENT_SLUG, YEAR, MONTH)).resolves.not.toThrow();
  });
});

describe('SubscriptionsService — listMonthSkips', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
  });

  it('returns active skips for the subscription, ordered by year/month', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(makeSub());
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValueOnce([
      { year: 2026, month: 9, reason: 'shipping delay' },
    ]);

    const result = await service.listMonthSkips(PARENT_SLUG);

    expect(prisma.subscriptionMonthSkip.findMany).toHaveBeenCalledWith({
      where: { subscriptionId: PARENT_ID, undoneAt: null },
      select: { year: true, month: true, reason: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    expect(result).toEqual([{ year: 2026, month: 9, reason: 'shipping delay' }]);
  });

  it('resolves a variant slug transparently to its content-stream parent\'s skips, same as getMonths', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(
      makeSub({ id: VARIANT_1_ID, slug: VARIANT_1_SLUG, parentSubscriptionId: PARENT_ID }),
    );
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValueOnce([]);

    await service.listMonthSkips(VARIANT_1_SLUG);

    expect(prisma.subscriptionMonthSkip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subscriptionId: PARENT_ID, undoneAt: null } }),
    );
  });

  it('applies optional date bounds, for a paginated caller matching its own page window', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(makeSub());
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValueOnce([]);

    await service.listMonthSkips(PARENT_SLUG, 2025, 6, 2025, 12);

    expect(prisma.subscriptionMonthSkip.findMany).toHaveBeenCalledWith({
      where: {
        subscriptionId: PARENT_ID,
        undoneAt: null,
        AND: [
          { OR: [{ year: { gt: 2025 } }, { year: 2025, month: { gte: 6 } }] },
          { OR: [{ year: { lt: 2025 } }, { year: 2025, month: { lte: 12 } }] },
        ],
      },
      select: { year: true, month: true, reason: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
  });
});
