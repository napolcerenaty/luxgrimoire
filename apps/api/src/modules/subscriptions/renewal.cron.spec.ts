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
    service = new RenewalCronService(prisma);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
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
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({});
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
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({});

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
});
