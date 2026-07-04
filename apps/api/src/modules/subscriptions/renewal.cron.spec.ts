import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { RenewalCronService } from './renewal.cron';
import { refreshNextRenewalDate } from '../../common/utils/renewal-date.util';

jest.mock('../../common/utils/renewal-date.util', () => ({
  refreshNextRenewalDate: jest.fn().mockResolvedValue(undefined),
  renewalMonthFromBoxMonth: jest.requireActual('../../common/utils/renewal-date.util').renewalMonthFromBoxMonth,
  computeNextRenewalDate: jest.requireActual('../../common/utils/renewal-date.util').computeNextRenewalDate,
  computePastRenewalDates: jest.requireActual('../../common/utils/renewal-date.util').computePastRenewalDates,
}));

const FIXED_NOW = new Date('2025-03-15T12:00:00Z');

describe('RenewalCronService', () => {
  let service: RenewalCronService;
  let prisma: DeepMockProxy<PrismaService>;

  const renewalDate = new Date(Date.UTC(2025, 2, 1)); // March 1 2025

  const baseEntry = {
    id: 'entry-1',
    userId: 'user-1',
    subscriptionId: 'sub-1',
    costCurrency: 'USD' as string | null,
    nextRenewalDate: renewalDate,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    prisma = mockDeep<PrismaService>();
    service = new RenewalCronService(prisma, { markStatsStale: jest.fn() } as any);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('scheduleRenewal integration after renewal', () => {
    it('calls scheduledReminders.scheduleRenewal after processOneRenewal', async () => {
      const scheduleRenewalMock = jest.fn().mockResolvedValue(undefined);
      const serviceWithReminders = new RenewalCronService(
        prisma,
        { markStatsStale: jest.fn() } as any,
        { scheduleRenewal: scheduleRenewalMock } as any,
      );

      (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValueOnce({ id: 'r-sched' });
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await (serviceWithReminders as any).processOneRenewal(baseEntry);

      expect(scheduleRenewalMock).toHaveBeenCalledWith('entry-1');
    });

    it('still processes renewal if scheduledReminders is not injected', async () => {
      (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValueOnce({ id: 'r-no-sched' });
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce(null);

      // Default service has no scheduledReminders — should not throw
      await expect((service as any).processOneRenewal(baseEntry)).resolves.not.toThrow();
      expect(prisma.userSubscriptionRenewal.create).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // processOneRenewal (private — accessed via `(service as any)`)
  // -------------------------------------------------------------------------

  describe('processOneRenewal', () => {
    it('skips book-add when a renewal record already exists (idempotency)', async () => {
      (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'r1' });

      await (service as any).processOneRenewal(baseEntry);

      expect(prisma.userSubscriptionRenewal.create).not.toHaveBeenCalled();
      expect(refreshNextRenewalDate).toHaveBeenCalledWith(prisma, 'entry-1');
    });

    it('creates renewal record and adds books when no existing record', async () => {
      (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValueOnce({ id: 'r2' });
      // addBooksForSubscriptionMonth returns early when month is not found
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await (service as any).processOneRenewal(baseEntry);

      expect(prisma.userSubscriptionRenewal.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          entryId: 'entry-1',
          renewalDate,
          source: 'cron',
        },
      });
      expect(refreshNextRenewalDate).toHaveBeenCalledWith(prisma, 'entry-1');
    });
  });

  // -------------------------------------------------------------------------
  // addBooksForSubscriptionMonth
  // -------------------------------------------------------------------------

  describe('addBooksForSubscriptionMonth', () => {
    beforeEach(() => {
      // Default mocks for createPurchaseGroupAndBooks internals
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null); // not a combo
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue({ billingPeriods: [] });
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValue({ id: 'pg-1' });
      (prisma.userSubscriptionEntryFeeTemplate.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'book-entry-1' });
      (prisma.ownershipStatusHistory.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it('returns early when no subscription month record exists', async () => {
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await service.addBooksForSubscriptionMonth(baseEntry, 2025, 3, renewalDate);

      expect(prisma.userSkipRecord.findUnique).not.toHaveBeenCalled();
      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('returns early when subscription month has no books', async () => {
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'month-1',
        signatureType: null,
        books: [],
      });

      await service.addBooksForSubscriptionMonth(baseEntry, 2025, 3, renewalDate);

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('returns early when user has an active skip for the month', async () => {
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'month-1',
        signatureType: null,
        books: [{ bookId: 'book-1', editionId: 'edition-1', signatureType: null }],
      });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce({ undoneAt: null });

      await service.addBooksForSubscriptionMonth(baseEntry, 2025, 3, renewalDate);

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('upserts book entries for each book when no active skip exists', async () => {
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'month-1',
        signatureType: null,
        books: [{ bookId: 'book-1', editionId: 'edition-1', signatureType: null }],
      });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await service.addBooksForSubscriptionMonth(baseEntry, 2025, 3, renewalDate);

      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            bookId: 'book-1',
            editionId: 'edition-1',
          }),
        }),
      );
    });

    it('records PREORDER ownership history with renewal date when book entry is created', async () => {
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'month-1',
        signatureType: null,
        books: [{ bookId: 'book-1', editionId: 'edition-1', signatureType: null }],
      });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await service.addBooksForSubscriptionMonth(baseEntry, 2025, 3, renewalDate);

      expect(prisma.ownershipStatusHistory.createMany).toHaveBeenCalledWith({
        data: [{ userBookEntryId: 'book-entry-1', status: 'PREORDER', changedAt: renewalDate }],
      });
    });

    it('does not record ownership history when book entry already exists', async () => {
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'month-1',
        signatureType: null,
        books: [{ bookId: 'book-1', editionId: 'edition-1', signatureType: null }],
      });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'existing-entry' });

      await service.addBooksForSubscriptionMonth(baseEntry, 2025, 3, renewalDate);

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
      expect(prisma.ownershipStatusHistory.createMany).not.toHaveBeenCalled();
    });

    it('skips individual books where bookId or editionId is null', async () => {
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'month-1',
        signatureType: null,
        books: [
          { bookId: null, editionId: 'edition-1', signatureType: null },
          { bookId: 'book-2', editionId: null, signatureType: null },
        ],
      });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await service.addBooksForSubscriptionMonth(baseEntry, 2025, 3, renewalDate);

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // retroactivelyAddBookForSubscribers
  // -------------------------------------------------------------------------

  describe('retroactivelyAddBookForSubscribers', () => {
    const monthRecord = { id: 'month-1', year: 2025, month: 3, signatureType: null };

    beforeEach(() => {
      // retroactivelyAddBookForSubscribers always fetches childSubs and directSub first;
      // default to no children and a basic direct sub so tests don't need to repeat this.
      (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        renewalMonthOffset: 0,
        isBundleSubscription: false,
        intervalMonths: 1,
      });
      // Default: no combo links (avoids "comboLinks is not iterable")
      (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValue([]);
      // Default book entry mocks
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'book-entry-1' });
      (prisma.ownershipStatusHistory.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it('returns early when book.editionId is null', async () => {
      await service.retroactivelyAddBookForSubscribers(
        'sub-1',
        monthRecord,
        { bookId: 'book-1', editionId: null, signatureType: null },
      );

      expect(prisma.userSubscriptionEntry.findMany).not.toHaveBeenCalled();
    });

    it('returns early when there are no active subscription entries', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);

      await service.retroactivelyAddBookForSubscribers(
        'sub-1',
        monthRecord,
        { bookId: 'book-1', editionId: 'edition-1', signatureType: null },
      );

      expect(prisma.userSubscriptionRenewal.findFirst).not.toHaveBeenCalled();
    });

    it('skips entry when no renewal record exists for that month', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: null },
      ]);
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await service.retroactivelyAddBookForSubscribers(
        'sub-1',
        monthRecord,
        { bookId: 'book-1', editionId: 'edition-1', signatureType: null },
      );

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('skips entry when user has an active skip for the month', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: null },
      ]);
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
        renewalDate,
      });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce({ undoneAt: null });

      await service.retroactivelyAddBookForSubscribers(
        'sub-1',
        monthRecord,
        { bookId: 'book-1', editionId: 'edition-1', signatureType: null },
      );

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('upserts book entry for subscribers who have a renewal and no active skip', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: null },
      ]);
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
        renewalDate,
      });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'book-entry-1' });
      (prisma.ownershipStatusHistory.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.retroactivelyAddBookForSubscribers(
        'sub-1',
        monthRecord,
        { bookId: 'book-1', editionId: 'edition-1', signatureType: null },
      );

      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            bookId: 'book-1',
            editionId: 'edition-1',
          }),
        }),
      );
    });

    it('records PREORDER ownership history with renewal date (non-bundle)', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: null },
      ]);
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({ renewalDate });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await service.retroactivelyAddBookForSubscribers(
        'sub-1',
        monthRecord,
        { bookId: 'book-1', editionId: 'edition-1', signatureType: null },
      );

      expect(prisma.ownershipStatusHistory.createMany).toHaveBeenCalledWith({
        data: [{ userBookEntryId: 'book-entry-1', status: 'PREORDER', changedAt: renewalDate }],
      });
    });

    it('does not record ownership history when book entry already exists (retroactive)', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: null },
      ]);
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({ renewalDate });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'existing-entry' });

      await service.retroactivelyAddBookForSubscribers(
        'sub-1',
        monthRecord,
        { bookId: 'book-1', editionId: 'edition-1', signatureType: null },
      );

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
      expect(prisma.ownershipStatusHistory.createMany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // processRenewals (cron entry point)
  // -------------------------------------------------------------------------

  describe('processRenewals', () => {
    it('queries entries with nextRenewalDate <= start of today and processes each', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([baseEntry]);
      const processOneSpy = jest
        .spyOn(service as any, 'processOneRenewal')
        .mockResolvedValue(undefined);

      await service.processRenewals();

      // todayStart should be midnight UTC of FIXED_NOW = 2025-03-15T00:00:00Z
      const expectedCutoff = new Date(Date.UTC(2025, 2, 15, 0, 0, 0, 0));
      expect(prisma.userSubscriptionEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            active: true,
            nextRenewalDate: { lte: expectedCutoff },
          },
        }),
      );
      expect(processOneSpy).toHaveBeenCalledWith(baseEntry);
    });

    it('continues processing remaining entries even when one entry throws', async () => {
      const entry2 = { ...baseEntry, id: 'entry-2' };
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        baseEntry,
        entry2,
      ]);
      const processOneSpy = jest
        .spyOn(service as any, 'processOneRenewal')
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);

      await expect(service.processRenewals()).resolves.not.toThrow();
      expect(processOneSpy).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // addBooksForSubscriptionMonth — combo with content stream variant component
  // -------------------------------------------------------------------------

  describe('addBooksForSubscriptionMonth — combo with content stream variant component', () => {
    const VARIANT_ID = 'variant-comp';
    const PARENT_ID = 'parent-stream';

    beforeEach(() => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue({ billingPeriods: [] });
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValue({ id: 'pg-1' });
      (prisma.userSubscriptionEntryFeeTemplate.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'book-entry-1' });
      (prisma.ownershipStatusHistory.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it('fetches books from the parent stream when a combo component is a content stream variant', async () => {
      // The subscription itself is a combo; one of its components is a content stream variant
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        isCombo: true,
        parentSubscriptionId: null,
        comboComponents: [{ componentId: VARIANT_ID }],
      });

      // resolveEffectiveComponentIds: variant maps to its parent stream
      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: VARIANT_ID, parentSubscriptionId: PARENT_ID },
      ]);

      // Months found on PARENT_ID — the content stream parent
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([
        { books: [{ bookId: 'bk-1', editionId: 'ed-1', signatureType: null }] },
      ]);

      await service.addBooksForSubscriptionMonth(baseEntry, 2025, 3, renewalDate);

      // subscriptionMonth.findMany must be called with PARENT_ID, not VARIANT_ID
      const [call] = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls;
      expect(call[0].where.subscriptionId.in).toEqual([PARENT_ID]);
      expect(call[0].where.subscriptionId.in).not.toContain(VARIANT_ID);

      // Book was added to the user's collection
      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bookId: 'bk-1', editionId: 'ed-1' }),
        }),
      );
    });

    it('returns early when no books exist on the parent stream for that month', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        isCombo: true,
        parentSubscriptionId: null,
        comboComponents: [{ componentId: VARIANT_ID }],
      });
      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: VARIANT_ID, parentSubscriptionId: PARENT_ID },
      ]);
      // No months found on the parent stream
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([]);

      await service.addBooksForSubscriptionMonth(baseEntry, 2025, 3, renewalDate);

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('uses component ID directly when combo component is a regular subscription (no parentSubscriptionId)', async () => {
      const REGULAR_COMP_ID = 'regular-comp';
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        isCombo: true,
        parentSubscriptionId: null,
        comboComponents: [{ componentId: REGULAR_COMP_ID }],
      });
      // No parentSubscriptionId → effective ID = same ID
      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: REGULAR_COMP_ID, parentSubscriptionId: null },
      ]);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([
        { books: [{ bookId: 'bk-2', editionId: 'ed-2', signatureType: null }] },
      ]);

      await service.addBooksForSubscriptionMonth(baseEntry, 2025, 3, renewalDate);

      const [call] = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls;
      expect(call[0].where.subscriptionId.in).toEqual([REGULAR_COMP_ID]);

      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bookId: 'bk-2', editionId: 'ed-2' }),
        }),
      );
    });
  });
});
