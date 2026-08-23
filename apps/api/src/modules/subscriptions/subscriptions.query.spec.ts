/**
 * Unit tests for SubscriptionsService query methods:
 *   - getMySubscriptions
 *   - getOrphanedMembershipHistory
 *   - getMySubscriptionEntry
 *   - updateMyEntryCosts
 */

import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

const SUB_ID = 'sub-q-1';
const SUB_SLUG = 'query-test-sub';
const USER_ID = 'user-q-1';
const ENTRY_ID = 'entry-q-1';
const HISTORY_ID_1 = 'hist-q-1';
const HISTORY_ID_2 = 'hist-q-2';

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Query Test Sub',
    currency: 'GBP',
    isDiscontinued: false,
    paymentOnStartup: false,
    renewalDay: 1,
    intervalMonths: 1,
    startingMonth: null,
    coverImage: null,
    logoUrl: null,
    priceChanges: [],
    company: { name: 'Test Co', slug: 'test-co', brandColors: null },
    ...overrides,
  };
}

function makeEntryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    active: true,
    startDate: '2024-01-01',
    cancellationDate: null,
    cancellationReason: null,
    renewalDay: 1,
    nextRenewalDate: new Date('2025-02-01'),
    costCurrency: 'GBP',
    basePrice: '20.00',
    shippingCost: null,
    scheduledPrepayOptionId: null,
    scheduledPrepayOption: null,
    skipRecords: [],
    feeTemplates: [],
    subscription: makeSub(),
    ...overrides,
  };
}

function makeHistoryRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    active: false,
    startDate: '2023-01-01',
    cancellationDate: '2023-12-31',
    cancellationReason: null,
    subscription: makeSub(),
    ...overrides,
  };
}

describe('SubscriptionsService — query methods', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();

    service = new SubscriptionsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,        // RenewalCronService
      {} as any,        // CountryFeeSnapshotCronService
      {} as any,        // UploadService
      { incrementSubscriberCount: jest.fn(), decrementSubscriberCount: jest.fn() } as any,
      { markStatsStale: jest.fn() } as any,
      { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any,
    );
  });

  describe('getMySubscriptions', () => {
    it('returns active subscriptions with subscription details', async () => {
      const entry = makeEntryRow({ active: true });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID, true);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(ENTRY_ID);
      expect(result[0].active).toBe(true);
      expect(result[0].subscription.id).toBe(SUB_ID);
    });

    it('returns cancelled subscriptions', async () => {
      const entry = makeEntryRow({
        active: false,
        cancellationDate: '2024-06-30',
        nextRenewalDate: null,
      });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID, false);

      expect(result).toHaveLength(1);
      expect(result[0].active).toBe(false);
      expect(result[0].cancellationDate).toBe('2024-06-30');
    });

    it('returns all subscriptions when no filter given', async () => {
      const active = makeEntryRow({ active: true });
      const cancelled = makeEntryRow({
        id: 'entry-q-2',
        active: false,
        cancellationDate: '2024-06-30',
        nextRenewalDate: null,
      });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([active, cancelled]);

      const result = await service.getMySubscriptions(USER_ID);
      expect(result).toHaveLength(2);
    });

    it('does not include membershipHistory field on each entry', async () => {
      const entry = makeEntryRow({ active: true, startDate: '2024-01-01' });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID);
      expect(result[0]).not.toHaveProperty('membershipHistory');
    });

    it('returns empty array when user has no subscriptions', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);
      const result = await service.getMySubscriptions(USER_ID);
      expect(result).toEqual([]);
    });

    it('includes nextRenewalDate from stored value', async () => {
      const renewalDate = new Date('2025-02-01');
      const entry = makeEntryRow({ nextRenewalDate: renewalDate });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID);
      expect(result[0].nextRenewalDate).toBe(renewalDate.toISOString());
    });

    it('includes computed nextRenewalAmount', async () => {
      const entry = makeEntryRow({ basePrice: '20.00', shippingCost: '5.00', costCurrency: 'GBP' });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID);
      expect(parseFloat(result[0].nextRenewalAmount ?? '0')).toBe(25);
    });

    it('exposes isBundleSubscription on the subscription so the frontend can render bundle UI', async () => {
      const entry = makeEntryRow({
        subscription: makeSub({ isBundleSubscription: true, intervalMonths: 3, startingMonth: 1 }),
      });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

      const result = await service.getMySubscriptions(USER_ID);
      expect(result[0].subscription.isBundleSubscription).toBe(true);
      expect(result[0].subscription.intervalMonths).toBe(3);
    });

    // Prepaid entries — nextRenewalAmount and the "price changing" notice must reflect the
    // resolver's fresh price, not the price frozen on the scheduledPrepayOption FK at whenever
    // the user last selected it. Real-world case: an "Illumicrate Box" subscriber joined before
    // a (non-grandfathered) 3-month prepay price increase — their upcoming renewal should both
    // charge and *display* the new price, not the one they're currently paying.
    describe('prepaid entries', () => {
      const OLD_OPTION = { id: 'opt-old', months: 3, currency: 'GBP', price: { toString: () => '84.00' }, validFrom: null, validUntil: '2026-08-01T00:00:00Z', grandfatheredPrice: false };
      const NEW_OPTION = { id: 'opt-new', months: 3, currency: 'GBP', price: { toString: () => '111.00' }, validFrom: '2026-08-01T00:00:00Z', validUntil: null, grandfatheredPrice: false };

      it('flags nextRenewalPriceChanged and shows the new price when the resolved prepay price differs from the FK price', async () => {
        const entry = makeEntryRow({
          startDate: '2026-07-22',
          nextRenewalDate: new Date('2026-11-01'),
          costCurrency: 'GBP',
          basePrice: null,
          shippingCost: null,
          scheduledPrepayOptionId: OLD_OPTION.id, // stale FK — still points at the option they joined under
          scheduledPrepayOption: { price: OLD_OPTION.price, currency: OLD_OPTION.currency, months: OLD_OPTION.months },
          subscription: makeSub({ prepayOptions: [OLD_OPTION, NEW_OPTION] }),
        });
        (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

        const result = await service.getMySubscriptions(USER_ID);

        expect(result[0].nextRenewalPriceChanged).toBe(true);
        expect(result[0].nextRenewalNewPrice).toBe('111.00');
        expect(parseFloat(result[0].nextRenewalAmount ?? '0')).toBe(111);
      });

      it('does not flag a price change when the resolved price matches the current one (no options changed)', async () => {
        const entry = makeEntryRow({
          startDate: '2026-07-22',
          nextRenewalDate: new Date('2026-11-01'),
          costCurrency: 'GBP',
          basePrice: null,
          shippingCost: null,
          scheduledPrepayOptionId: OLD_OPTION.id,
          scheduledPrepayOption: { price: OLD_OPTION.price, currency: OLD_OPTION.currency, months: OLD_OPTION.months },
          subscription: makeSub({ prepayOptions: [OLD_OPTION] }), // no successor option at all
        });
        (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

        const result = await service.getMySubscriptions(USER_ID);

        expect(result[0].nextRenewalPriceChanged).toBe(false);
        expect(result[0].nextRenewalNewPrice).toBeNull();
        expect(parseFloat(result[0].nextRenewalAmount ?? '0')).toBe(84);
      });

      it('does not flag a price change for a subscriber grandfathered onto the old price', async () => {
        const GRANDFATHERED_NEW = { ...NEW_OPTION, grandfatheredPrice: true };
        const entry = makeEntryRow({
          startDate: '2026-07-22', // predates the change -> grandfathered
          nextRenewalDate: new Date('2026-11-01'),
          costCurrency: 'GBP',
          basePrice: null,
          shippingCost: null,
          scheduledPrepayOptionId: OLD_OPTION.id,
          scheduledPrepayOption: { price: OLD_OPTION.price, currency: OLD_OPTION.currency, months: OLD_OPTION.months },
          subscription: makeSub({ prepayOptions: [OLD_OPTION, GRANDFATHERED_NEW] }),
        });
        (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

        const result = await service.getMySubscriptions(USER_ID);

        expect(result[0].nextRenewalPriceChanged).toBe(false);
        expect(parseFloat(result[0].nextRenewalAmount ?? '0')).toBe(84);
      });

      // Real bug found in production testing: comparing against scheduledPrepayOption.price (the
      // FK's own option) instead of the live billing period's frozen baseAmount gets this exactly
      // backwards whenever the FK is stale/mismatched — e.g. an entry whose FK already points at
      // the new option (set some other way than a fresh resolve) while the currently-paid period
      // was actually billed at the old price, or vice versa.
      it('does not flag a change when the FK points at a grandfathered-excluded option, even though its own price differs from the resolved one', async () => {
        const GRANDFATHERED_NEW = { ...NEW_OPTION, grandfatheredPrice: true };
        const entry = makeEntryRow({
          startDate: '2026-07-22', // predates the change -> grandfathered onto OLD regardless of the FK
          nextRenewalDate: new Date('2026-11-01'),
          costCurrency: 'GBP',
          basePrice: null,
          shippingCost: null,
          scheduledPrepayOptionId: GRANDFATHERED_NEW.id, // stale/mismatched FK — points at the NEW option
          scheduledPrepayOption: { price: GRANDFATHERED_NEW.price, currency: GRANDFATHERED_NEW.currency, months: GRANDFATHERED_NEW.months },
          billingPeriods: [{ baseAmount: { toString: () => '84.00' } }], // what they're actually currently paying
          subscription: makeSub({ prepayOptions: [OLD_OPTION, GRANDFATHERED_NEW] }),
        });
        (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

        const result = await service.getMySubscriptions(USER_ID);

        expect(result[0].nextRenewalPriceChanged).toBe(false);
        expect(parseFloat(result[0].nextRenewalAmount ?? '0')).toBe(84);
      });

      it('flags a real change even when the stale FK price already happens to match the resolved one', async () => {
        const entry = makeEntryRow({
          startDate: '2026-07-22',
          nextRenewalDate: new Date('2026-11-01'),
          costCurrency: 'GBP',
          basePrice: null,
          shippingCost: null,
          scheduledPrepayOptionId: NEW_OPTION.id, // FK already points at the new (non-grandfathered) option
          scheduledPrepayOption: { price: NEW_OPTION.price, currency: NEW_OPTION.currency, months: NEW_OPTION.months },
          billingPeriods: [{ baseAmount: { toString: () => '84.00' } }], // but they're still actually paying the old price
          subscription: makeSub({ prepayOptions: [OLD_OPTION, NEW_OPTION] }),
        });
        (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

        const result = await service.getMySubscriptions(USER_ID);

        expect(result[0].nextRenewalPriceChanged).toBe(true);
        expect(result[0].nextRenewalNewPrice).toBe('111.00');
      });

      // Real bug found in production: nextBoxMonth was derived from storedRenewalDate (the next
      // BILLING date), which for a prepaid entry only fires once per multi-month period and can be
      // months away mid-period. Boxes still ship every month within an already-paid period, so
      // "Next Box" must be computed on the plain monthly cadence, independent of the prepay billing
      // cycle — otherwise it skips straight to the box tied to the far-future re-bill instead of the
      // next one actually shipping.
      it('computes nextBoxMonth from the plain monthly cadence, not the far-future prepay renewal date', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-08-23T12:00:00Z'));
        try {
          const entry = makeEntryRow({
            startDate: '2026-07-22',
            renewalDay: 1,
            nextRenewalDate: new Date('2026-11-01'), // next re-bill, 3-month prepay period just used up
            scheduledPrepayOptionId: OLD_OPTION.id,
            scheduledPrepayOption: { price: OLD_OPTION.price, currency: OLD_OPTION.currency, months: OLD_OPTION.months },
            subscription: makeSub({ renewalDay: 1, prepayOptions: [OLD_OPTION] }),
          });
          (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([entry]);

          const result = await service.getMySubscriptions(USER_ID);

          expect(result[0].nextRenewalDate).toBe(new Date('2026-11-01').toISOString());
          expect(result[0].nextBoxMonth).toEqual({ year: 2026, month: 9 });
        } finally {
          jest.useRealTimers();
        }
      });
    });
  });

  describe('getNextBoxPreview', () => {
    function monthRecord(year: number, month: number, opts: {
      theme?: string | null; isSpoiler?: boolean; bookTitle?: string;
    } = {}) {
      return {
        year, month,
        theme: opts.theme ?? null,
        isSpoiler: opts.isSpoiler ?? false,
        books: [{
          isMainBook: true,
          book: { title: opts.bookTitle ?? `Book ${year}-${month}`, authors: [{ author: { name: 'Author X' } }] },
          edition: { additionalImages: ['img.jpg'] },
        }],
      };
    }

    it('non-bundle: returns just the requested month, unchanged', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValue(makeSub() as any);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([
        monthRecord(2026, 4, { bookTitle: 'April Book' }),
      ]);

      const result = await service.getNextBoxPreview(USER_ID, SUB_SLUG, 2026, 4);

      expect(result).toMatchObject({ year: 2026, month: 4, endYear: 2026, endMonth: 4, isBundleSubscription: false });
      expect(result!.books).toHaveLength(1);
      expect(result!.books[0].title).toBe('April Book');
    });

    it('bundle: merges books from all 3 months of the bundle, not just the requested one', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValue(
        makeSub({ isBundleSubscription: true, intervalMonths: 3, startingMonth: 1 }) as any,
      );
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([
        monthRecord(2026, 4, { bookTitle: 'April Book' }),
        monthRecord(2026, 5, { bookTitle: 'May Book' }),
        monthRecord(2026, 6, { bookTitle: 'June Book' }),
      ]);

      const result = await service.getNextBoxPreview(USER_ID, SUB_SLUG, 2026, 4);

      expect(result).toMatchObject({ year: 2026, month: 4, endYear: 2026, endMonth: 6, isBundleSubscription: true, intervalMonths: 3 });
      expect(result!.books.map((b) => b.title)).toEqual(['April Book', 'May Book', 'June Book']);
    });

    it('bundle: resolves the whole bundle even when called with a non-first month', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValue(
        makeSub({ isBundleSubscription: true, intervalMonths: 3, startingMonth: 1 }) as any,
      );
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([
        monthRecord(2026, 4, { bookTitle: 'April Book' }),
        monthRecord(2026, 5, { bookTitle: 'May Book' }),
        monthRecord(2026, 6, { bookTitle: 'June Book' }),
      ]);

      // Called with June (the last month of the Apr-Jun bundle) — must still resolve to the whole bundle.
      const result = await service.getNextBoxPreview(USER_ID, SUB_SLUG, 2026, 6);

      expect(result).toMatchObject({ year: 2026, month: 4, endYear: 2026, endMonth: 6 });
      expect(result!.books).toHaveLength(3);
    });

    it('bundle: isSpoiler is true if ANY covered month is marked as spoiler', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValue(
        makeSub({ isBundleSubscription: true, intervalMonths: 3, startingMonth: 1 }) as any,
      );
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([
        monthRecord(2026, 4, { isSpoiler: false }),
        monthRecord(2026, 5, { isSpoiler: true }),
        monthRecord(2026, 6, { isSpoiler: false }),
      ]);

      const result = await service.getNextBoxPreview(USER_ID, SUB_SLUG, 2026, 4);
      expect(result!.isSpoiler).toBe(true);
    });

    it('returns null when no months exist in range', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValue(makeSub() as any);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.getNextBoxPreview(USER_ID, SUB_SLUG, 2026, 4);
      expect(result).toBeNull();
    });
  });

  describe('getOrphanedMembershipHistory', () => {
    it('returns empty array when no orphaned records', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getOrphanedMembershipHistory(USER_ID);
      expect(result).toEqual([]);
    });

    it('returns orphaned inactive entries grouped by subscription', async () => {
      const SUB_ID_2 = 'sub-q-2';
      const records = [
        makeHistoryRecord(HISTORY_ID_1, { subscriptionId: SUB_ID }),
        makeHistoryRecord(HISTORY_ID_2, { subscriptionId: SUB_ID }),
        makeHistoryRecord('hist-q-3', {
          subscriptionId: SUB_ID_2,
          subscription: { ...makeSub(), id: SUB_ID_2 },
        }),
      ];
      (prisma.userSubscriptionEntry.findMany as jest.Mock)
        .mockResolvedValueOnce(records)
        .mockResolvedValueOnce([]);

      const result = await service.getOrphanedMembershipHistory(USER_ID);

      expect(result).toHaveLength(2);
      const group1 = result.find(g => g.subscription.id === SUB_ID);
      expect(group1?.records).toHaveLength(2);
      const group2 = result.find(g => g.subscription.id === SUB_ID_2);
      expect(group2?.records).toHaveLength(1);
    });

    it('queries inactive entries for the user', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getOrphanedMembershipHistory(USER_ID);

      expect(prisma.userSubscriptionEntry.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { userId: USER_ID, active: false },
        }),
      );
      expect(prisma.userSubscriptionEntry.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { userId: USER_ID, active: true },
        }),
      );
    });
  });

  describe('getMySubscriptionEntry', () => {
    it('returns entry for subscribed user', async () => {
      const entry = {
        id: ENTRY_ID,
        active: true,
        startDate: '2024-01-01',
        nextRenewalDate: new Date('2025-02-01'),
        feeTemplates: [],
        skipRecords: [],
        subscription: makeSub(),
      };
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);

      const result = await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(ENTRY_ID);
    });

    it('returns null for non-subscribed user', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);
      expect(result).toBeNull();
    });

    it('uses userId and subscriptionId with active:true to find entry', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);

      expect(prisma.userSubscriptionEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, subscriptionId: SUB_ID, active: true },
        }),
      );
    });

    it('includes nextRenewalDate as ISO string', async () => {
      const renewalDate = new Date('2025-03-01');
      const entry = {
        id: ENTRY_ID,
        active: true,
        startDate: '2024-01-01',
        nextRenewalDate: renewalDate,
        feeTemplates: [],
        skipRecords: [],
      };
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(entry);

      const result = await service.getMySubscriptionEntry(USER_ID, SUB_SLUG);
      expect(result?.nextRenewalDate).toBe(renewalDate.toISOString());
    });
  });

  describe('updateMyEntryCosts', () => {
    function setupForUpdate(entryOverrides: Record<string, unknown> = {}) {
      const sub = makeSub();
      const entry = { id: ENTRY_ID, userId: USER_ID, subscriptionId: SUB_ID, active: true, ...entryOverrides };
      jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock)
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce({
          ...entry,
          feeTemplates: [],
          skipRecords: [],
          nextRenewalDate: new Date('2025-02-01'),
        });
      (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValueOnce(entry);
      return { sub, entry };
    }

    it('updates basePrice on the entry', async () => {
      setupForUpdate();
      await service.updateMyEntryCosts(USER_ID, SUB_SLUG, { basePrice: '25.00' });
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ basePrice: '25.00' }),
        }),
      );
    });

    it('updates shippingCost on the entry', async () => {
      setupForUpdate();
      await service.updateMyEntryCosts(USER_ID, SUB_SLUG, { shippingCost: '3.50' });
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ shippingCost: '3.50' }),
        }),
      );
    });

    it('updates costCurrency on the entry', async () => {
      setupForUpdate();
      await service.updateMyEntryCosts(USER_ID, SUB_SLUG, { costCurrency: 'USD' });
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ costCurrency: 'USD' }),
        }),
      );
    });

    it('replaces fee templates when provided', async () => {
      setupForUpdate();
      (prisma.userSubscriptionEntryFeeTemplate.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
      (prisma.userSubscriptionEntryFeeTemplate.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      await service.updateMyEntryCosts(USER_ID, SUB_SLUG, {
        linkedFeeTemplates: [{ templateId: 'tmpl-1', customAmount: 5 }],
      });

      expect(prisma.userSubscriptionEntryFeeTemplate.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { subscriptionEntryId: ENTRY_ID } }),
      );
      expect(prisma.userSubscriptionEntryFeeTemplate.createMany).toHaveBeenCalled();
    });

    it('throws NotFoundException when user has no entry', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.updateMyEntryCosts(USER_ID, SUB_SLUG, { basePrice: '25.00' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('clears fee templates when empty array provided', async () => {
      setupForUpdate();
      (prisma.userSubscriptionEntryFeeTemplate.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      await service.updateMyEntryCosts(USER_ID, SUB_SLUG, { linkedFeeTemplates: [] });

      expect(prisma.userSubscriptionEntryFeeTemplate.deleteMany).toHaveBeenCalled();
      expect(prisma.userSubscriptionEntryFeeTemplate.createMany).not.toHaveBeenCalled();
    });
  });
});
