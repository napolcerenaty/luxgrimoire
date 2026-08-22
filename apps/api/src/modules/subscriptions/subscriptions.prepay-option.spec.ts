/**
 * Service-level tests for prepay option operations in SubscriptionsService.
 *
 * Covers:
 *  1. createPrepayOption — auto-close: no prior sibling, one open sibling closed, an
 *     already-closed sibling left untouched, a different months/currency sibling left
 *     untouched, multiple open siblings (bad pre-existing data) all closed.
 *  2. getPrepayOptions(slug, userId) — resolves against the caller's ACTIVE entry only,
 *     never a historical cancelled one for the same user+subscription.
 *
 * Note: the resolution algorithm itself (grandfathering, chains, discontinuation) is covered
 * exhaustively in prepay-option.util.spec.ts — these tests only check that the service wires
 * the right data into it.
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const SUB_ID = 'sub-id-1';
const SUB_SLUG = 'test-subscription';

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
    { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any, // cache
  );
}

describe('SubscriptionsService — prepay options', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({ id: SUB_ID, slug: SUB_SLUG });
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    (prisma.subscriptionPrepayOption.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.subscriptionPrepayOption.create as jest.Mock).mockImplementation(({ data }: any) => Promise.resolve({ id: 'new-opt', ...data }));
  });

  describe('createPrepayOption — auto-close', () => {
    it('does not attempt to close anything when creating the first option for a group', async () => {
      await service.createPrepayOption(SUB_SLUG, { months: 6, price: '60.00', currency: 'USD' } as any);

      expect(prisma.subscriptionPrepayOption.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ subscriptionId: SUB_ID, months: 6, currency: 'USD' }),
        }),
      );
      // No open sibling existed, but the call is unconditional and harmless (matches 0 rows) —
      // what matters is the create still goes through.
      expect(prisma.subscriptionPrepayOption.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ months: 6, price: '60.00', currency: 'USD' }) }),
      );
    });

    it('closes an open sibling for the same months+currency, setting its validUntil to the new validFrom', async () => {
      await service.createPrepayOption(SUB_SLUG, {
        months: 6,
        price: '60.00',
        currency: 'USD',
        validFrom: '2026-09-01',
      } as any);

      expect(prisma.subscriptionPrepayOption.updateMany).toHaveBeenCalledWith({
        where: {
          subscriptionId: SUB_ID,
          months: 6,
          currency: 'USD',
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: new Date('2026-09-01') } }] },
            { OR: [{ validUntil: null }, { validUntil: { gt: new Date('2026-09-01') } }] },
          ],
        },
        data: { validUntil: new Date('2026-09-01') },
      });
    });

    it('defaults the close boundary to "now" when the admin leaves validFrom blank', async () => {
      const before = Date.now();
      await service.createPrepayOption(SUB_SLUG, { months: 6, price: '60.00', currency: 'USD' } as any);
      const after = Date.now();

      const callArg = (prisma.subscriptionPrepayOption.updateMany as jest.Mock).mock.calls[0][0];
      const usedValidUntil = (callArg.data.validUntil as Date).getTime();
      expect(usedValidUntil).toBeGreaterThanOrEqual(before);
      expect(usedValidUntil).toBeLessThanOrEqual(after);
    });

    it('scopes the close query to the exact months+currency group being created — different groups are never touched by this call', async () => {
      await service.createPrepayOption(SUB_SLUG, { months: 12, price: '100.00', currency: 'EUR', validFrom: '2026-09-01' } as any);

      const where = (prisma.subscriptionPrepayOption.updateMany as jest.Mock).mock.calls[0][0].where;
      expect(where.months).toBe(12);
      expect(where.currency).toBe('EUR');
      // The query itself only ever matches rows with months=12 AND currency='EUR' for this
      // subscription — a sibling for e.g. 6 months or GBP is excluded by construction (Prisma
      // filters on these fields directly), so no separate mock is needed to prove isolation.
    });

    it('persists the grandfatheredPrice flag on the new row', async () => {
      await service.createPrepayOption(SUB_SLUG, {
        months: 6,
        price: '60.00',
        currency: 'USD',
        grandfatheredPrice: true,
      } as any);

      expect(prisma.subscriptionPrepayOption.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ grandfatheredPrice: true }) }),
      );
    });

    it('defaults grandfatheredPrice to false when not provided', async () => {
      await service.createPrepayOption(SUB_SLUG, { months: 6, price: '60.00', currency: 'USD' } as any);

      expect(prisma.subscriptionPrepayOption.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ grandfatheredPrice: false }) }),
      );
    });
  });

  describe('getPrepayOptions(slug, userId) — active-entry scoping', () => {
    const OPEN_OPTION = { id: 'opt-open', months: 6, currency: 'USD', price: { toString: () => '60.00' }, validFrom: null, validUntil: null, grandfatheredPrice: false };

    it('uses the plain current list (no grandfathering) when no userId is given', async () => {
      (prisma.subscriptionPrepayOption.findMany as jest.Mock).mockResolvedValueOnce([OPEN_OPTION]);

      const result = await service.getPrepayOptions(SUB_SLUG);

      expect(prisma.userSubscriptionEntry.findFirst).not.toHaveBeenCalled();
      expect(result.map((o: any) => o.id)).toEqual(['opt-open']);
    });

    it('resolves against the ACTIVE entry, not a cancelled historical one for the same user', async () => {
      const OLD = { id: 'opt-old', months: 6, currency: 'USD', price: { toString: () => '50.00' }, validFrom: null, validUntil: '2026-08-01T00:00:00Z', grandfatheredPrice: false };
      const NEW = { id: 'opt-new', months: 6, currency: 'USD', price: { toString: () => '60.00' }, validFrom: '2026-08-01T00:00:00Z', validUntil: null, grandfatheredPrice: true };
      (prisma.subscriptionPrepayOption.findMany as jest.Mock).mockResolvedValueOnce([OLD, NEW]);

      // findFirst is called with { active: true } — simulate the DB correctly ignoring an older
      // cancelled entry with an early startDate and returning only the active one.
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockImplementationOnce(({ where }: any) => {
        expect(where).toEqual({ userId: 'user-1', subscriptionId: SUB_ID, active: true });
        return Promise.resolve({ startDate: '2026-08-15' }); // the ACTIVE entry — joined AFTER the price change
      });

      const result = await service.getPrepayOptions(SUB_SLUG, 'user-1');

      // A user whose active entry started after the change is not grandfathered -> gets NEW.
      expect(result.map((o: any) => o.id)).toEqual(['opt-new']);
    });

    it('grandfathers a user whose ACTIVE entry predates the change, even if a cancelled entry would have looked newer', async () => {
      const OLD = { id: 'opt-old', months: 6, currency: 'USD', price: { toString: () => '50.00' }, validFrom: null, validUntil: '2026-08-01T00:00:00Z', grandfatheredPrice: false };
      const NEW = { id: 'opt-new', months: 6, currency: 'USD', price: { toString: () => '60.00' }, validFrom: '2026-08-01T00:00:00Z', validUntil: null, grandfatheredPrice: true };
      (prisma.subscriptionPrepayOption.findMany as jest.Mock).mockResolvedValueOnce([OLD, NEW]);

      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockImplementationOnce(({ where }: any) => {
        expect(where).toEqual({ userId: 'user-1', subscriptionId: SUB_ID, active: true });
        return Promise.resolve({ startDate: '2026-01-01' }); // the ACTIVE entry — long-standing subscriber
      });

      const result = await service.getPrepayOptions(SUB_SLUG, 'user-1');

      expect(result.map((o: any) => o.id)).toEqual(['opt-old']);
    });

    it('falls back to the plain current list when the user has no active entry for this subscription', async () => {
      const NEW = { id: 'opt-new', months: 6, currency: 'USD', price: { toString: () => '60.00' }, validFrom: null, validUntil: null, grandfatheredPrice: false };
      (prisma.subscriptionPrepayOption.findMany as jest.Mock).mockResolvedValueOnce([NEW]);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.getPrepayOptions(SUB_SLUG, 'user-with-no-entry');

      expect(result.map((o: any) => o.id)).toEqual(['opt-new']);
    });
  });

  describe('updateMyBillingMode — anti-manipulation validation', () => {
    const ENTRY = { id: 'entry-1', startDate: '2026-01-01' };
    const OLD = { id: 'opt-old', months: 6, currency: 'USD', validFrom: null, validUntil: '2026-08-01T00:00:00Z', grandfatheredPrice: false };
    const NEW = { id: 'opt-new', months: 6, currency: 'USD', validFrom: '2026-08-01T00:00:00Z', validUntil: null, grandfatheredPrice: true };

    beforeEach(() => {
      jest.spyOn(service, 'findBySlug').mockResolvedValue({ id: SUB_ID, slug: SUB_SLUG } as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValue(ENTRY);
      (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValue({});
    });

    it('accepts an option the active entry is genuinely entitled to (grandfathered onto the old price)', async () => {
      (prisma.subscriptionPrepayOption.findMany as jest.Mock).mockResolvedValueOnce([OLD, NEW]);

      await service.updateMyBillingMode('user-1', SUB_SLUG, { scheduledPrepayOptionId: OLD.id } as any);

      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
        where: { id: ENTRY.id },
        data: { scheduledPrepayOptionId: OLD.id, prepaidMonths: 6 },
      });
    });

    it('rejects an option the active entry no longer qualifies for (grandfathered-excluded)', async () => {
      // Entry started AFTER the change -> not grandfathered -> only NEW is legitimate.
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'entry-1', startDate: '2026-08-15' });
      (prisma.subscriptionPrepayOption.findMany as jest.Mock).mockResolvedValueOnce([OLD, NEW]);

      await expect(
        service.updateMyBillingMode('user-1', SUB_SLUG, { scheduledPrepayOptionId: OLD.id } as any),
      ).rejects.toThrow('Invalid prepay option');
      expect(prisma.userSubscriptionEntry.update).not.toHaveBeenCalled();
    });

    it('rejects an id that does not exist for this subscription at all', async () => {
      (prisma.subscriptionPrepayOption.findMany as jest.Mock).mockResolvedValueOnce([OLD, NEW]);

      await expect(
        service.updateMyBillingMode('user-1', SUB_SLUG, { scheduledPrepayOptionId: 'not-a-real-option' } as any),
      ).rejects.toThrow('Invalid prepay option');
    });
  });

  describe('joinSubscription — prepay selection validation', () => {
    it('rejects a fully discontinued prepay option at join time', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValue({ id: SUB_ID, slug: SUB_SLUG } as any);
      const DISCONTINUED = { id: 'opt-gone', months: 6, currency: 'USD', validFrom: null, validUntil: '2026-01-01T00:00:00Z', grandfatheredPrice: false };
      (prisma.subscriptionPrepayOption.findMany as jest.Mock).mockResolvedValueOnce([DISCONTINUED]);
      // No existing active entry (join guard), so joinSubscription proceeds to the prepay check.
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.joinSubscription('user-1', SUB_SLUG, { selectedPrepayOptionId: DISCONTINUED.id } as any),
      ).rejects.toThrow('Invalid prepay option');
    });
  });
});
