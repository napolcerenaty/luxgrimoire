/**
 * Tests for price-change-aware pricing in the renewal cron:
 *  1. addBooksForSubscriptionMonth — price change applied at / before / after renewal month
 *  2. addBooksForSubscriptionMonth — content stream variant: month from parent, price from child sub
 *  3. retroactivelyAddBookForSubscribers — content stream: child sub subscribers receive book
 *  4. retroactivelyAddBookForSubscribers — content stream: both direct + child subscribers receive book
 *
 * Note: retroactive backfill does NOT resolve pricing (books are linked to existing purchase groups);
 * price-change pricing tests live exclusively in the addBooksForSubscriptionMonth section.
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { RenewalCronService } from './renewal.cron';

jest.mock('../../common/utils/renewal-date.util', () => ({
  refreshNextRenewalDate: jest.fn().mockResolvedValue(undefined),
  computeNextRenewalDate: jest.requireActual('../../common/utils/renewal-date.util').computeNextRenewalDate,
  computePastRenewalDates: jest.requireActual('../../common/utils/renewal-date.util').computePastRenewalDates,
  renewalMonthFromBoxMonth: jest.requireActual('../../common/utils/renewal-date.util').renewalMonthFromBoxMonth,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const YEAR = 2025;
const MONTH = 5; // May
const RENEWAL_DATE = new Date(Date.UTC(2025, 4, 1)); // May 1 2025

const BASE_ENTRY = {
  id: 'entry-1',
  userId: 'user-1',
  subscriptionId: 'sub-1',
  costCurrency: 'USD' as string | null,
  basePrice: { toString: () => '30' },
  shippingCost: { toString: () => '5' },
};

const MONTH_BOOKS = [{ bookId: 'book-1', editionId: 'edition-1', signatureType: null }];

function makePriceChange(effectiveYear: number, effectiveMonth: number, price: string, currency = 'USD') {
  return { effectiveYear, effectiveMonth, newBasePrice: { toString: () => price }, currency };
}

// ─── Shared setup helpers ─────────────────────────────────────────────────────

/** Stub subscription.findUnique for addBooksForSubscriptionMonth */
function stubSubLookup(
  prisma: DeepMockProxy<PrismaService>,
  parentSubscriptionId: string | null = null,
) {
  (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
    isCombo: false,
    parentSubscriptionId,
    comboComponents: [],
  });
}

/** Stub subscriptionMonth.findUnique to return one book month */
function stubMonthWithBooks(prisma: DeepMockProxy<PrismaService>, monthBooks = MONTH_BOOKS) {
  (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({
    id: 'month-1',
    signatureType: null,
    books: monthBooks,
  });
}

/** Stub no billing periods (falls through to price-change resolution) */
function stubNoBillingPeriods(prisma: DeepMockProxy<PrismaService>) {
  (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({
    billingPeriods: [],
  });
}

/** Stub purchase group creation */
function stubGroupCreation(prisma: DeepMockProxy<PrismaService>) {
  (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce(null);
  (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'group-1' });
  (prisma.userSubscriptionEntryFeeTemplate.findMany as jest.Mock).mockResolvedValueOnce([]);
  (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
  (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({});
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('RenewalCronService — price changes', () => {
  let service: RenewalCronService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new RenewalCronService(prisma, { markStatsStale: jest.fn() } as any);
    jest.clearAllMocks();
    (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValue(null);
    // Default: no combo links (avoids "comboLinks is not iterable" in retroactive path)
    (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValue([]);
  });

  // ─── addBooksForSubscriptionMonth — price-change pricing ─────────────────

  describe('addBooksForSubscriptionMonth — price-change pricing', () => {
    it('applies a price change that is effective at the renewal month', async () => {
      stubSubLookup(prisma);
      stubMonthWithBooks(prisma);
      stubNoBillingPeriods(prisma);
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([
        makePriceChange(2025, 5, '45.00'), // exactly the renewal month
      ]);
      stubGroupCreation(prisma);

      await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

      const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.totalAmount).toBe(45);
    });

    it('applies a price change that is effective before the renewal month', async () => {
      stubSubLookup(prisma);
      stubMonthWithBooks(prisma);
      stubNoBillingPeriods(prisma);
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([
        makePriceChange(2025, 3, '40.00'), // March — before May renewal
      ]);
      stubGroupCreation(prisma);

      await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

      const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.totalAmount).toBe(40);
    });

    it('applies the most recent applicable price change when multiple exist', async () => {
      stubSubLookup(prisma);
      stubMonthWithBooks(prisma);
      stubNoBillingPeriods(prisma);
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([
        makePriceChange(2025, 1, '35.00'), // January
        makePriceChange(2025, 4, '42.00'), // April — most recent before May
      ]);
      stubGroupCreation(prisma);

      await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

      const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.totalAmount).toBe(42); // April change wins over January
    });

    it('does not apply a price change that takes effect after the renewal month', async () => {
      stubSubLookup(prisma);
      stubMonthWithBooks(prisma);
      stubNoBillingPeriods(prisma);
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([
        makePriceChange(2025, 8, '50.00'), // August — future relative to May
      ]);
      stubGroupCreation(prisma);

      await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

      const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.totalAmount).toBe(30); // falls back to entry.basePrice
    });

    it('uses entry.basePrice when no price changes exist', async () => {
      stubSubLookup(prisma);
      stubMonthWithBooks(prisma);
      stubNoBillingPeriods(prisma);
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);
      stubGroupCreation(prisma);

      await service.addBooksForSubscriptionMonth(BASE_ENTRY, YEAR, MONTH, RENEWAL_DATE);

      const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.totalAmount).toBe(30);
    });
  });

  // ─── addBooksForSubscriptionMonth — content stream (variant) ─────────────

  describe('addBooksForSubscriptionMonth — content stream variant', () => {
    it('reads month from parent content stream but looks up price change on the child subscription', async () => {
      const childEntry = { ...BASE_ENTRY, subscriptionId: 'sub-child' };

      // Child sub has parentSubscriptionId → month lives on parent
      stubSubLookup(prisma, 'sub-parent');
      stubMonthWithBooks(prisma);
      stubNoBillingPeriods(prisma);
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([
        makePriceChange(2025, 3, '38.00'), // effective March, applies to May renewal
      ]);
      stubGroupCreation(prisma);

      await service.addBooksForSubscriptionMonth(childEntry, YEAR, MONTH, RENEWAL_DATE);

      // Month was fetched from parent subscription
      expect(prisma.subscriptionMonth.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subscriptionId_year_month: expect.objectContaining({ subscriptionId: 'sub-parent' }),
          }),
        }),
      );

      // Price change was queried on the child sub, not the parent
      expect(prisma.subscriptionPriceChange.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ subscriptionId: 'sub-child' }),
        }),
      );

      // Price change was applied
      const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.totalAmount).toBe(38);
    });

    it('content stream variant falls back to entry.basePrice when no applicable price change', async () => {
      const childEntry = { ...BASE_ENTRY, subscriptionId: 'sub-child' };

      stubSubLookup(prisma, 'sub-parent');
      stubMonthWithBooks(prisma);
      stubNoBillingPeriods(prisma);
      // Price change is in the future relative to renewal month
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([
        makePriceChange(2025, 9, '55.00'),
      ]);
      stubGroupCreation(prisma);

      await service.addBooksForSubscriptionMonth(childEntry, YEAR, MONTH, RENEWAL_DATE);

      const createCall = (prisma.userPurchaseGroup.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.totalAmount).toBe(30); // entry.basePrice fallback
    });
  });

  // ─── retroactivelyAddBookForSubscribers — content stream ─────────────────

  describe('retroactivelyAddBookForSubscribers — content stream', () => {
    const monthRecord = { id: 'month-1', year: 2025, month: 3, signatureType: null }; // March 2025
    const renewalDateMarch = new Date(Date.UTC(2025, 2, 1));

    it('adds book to child sub subscribers when a book is retroactively added to a content stream month', async () => {
      // Content stream has one child sub
      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'sub-child', renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 },
      ]);
      // Direct sub (the content stream itself)
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        renewalMonthOffset: 0,
        isBundleSubscription: false,
        intervalMonths: 1,
      });
      // Content stream has no direct subscribers
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);
      // Child sub has one active subscriber
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-child', userId: 'user-child', costCurrency: 'USD' },
      ]);
      // Renewal record exists for child subscriber
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({ renewalDate: renewalDateMarch });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);
      // Idempotency check — no existing book entry
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({});

      await service.retroactivelyAddBookForSubscribers(
        'sub-parent',
        monthRecord,
        { bookId: 'book-1', editionId: 'edition-1', signatureType: null },
      );

      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-child',
            bookId: 'book-1',
            editionId: 'edition-1',
          }),
        }),
      );
    });

    it('adds book to both direct and child sub subscribers when both exist', async () => {
      // Content stream has one child sub
      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'sub-child', renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 },
      ]);
      // Direct sub
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        renewalMonthOffset: 0,
        isBundleSubscription: false,
        intervalMonths: 1,
      });
      // Direct subscriber
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-direct', userId: 'user-direct', costCurrency: 'USD' },
      ]);
      // Child subscriber
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-child', userId: 'user-child', costCurrency: 'USD' },
      ]);

      // Renewal records for both
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock)
        .mockResolvedValueOnce({ renewalDate: renewalDateMarch })  // direct
        .mockResolvedValueOnce({ renewalDate: renewalDateMarch }); // child

      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({});

      await service.retroactivelyAddBookForSubscribers(
        'sub-parent',
        monthRecord,
        { bookId: 'book-1', editionId: 'edition-1', signatureType: null },
      );

      // Both users should have had a book entry created
      const createCalls = (prisma.userBookEntry.create as jest.Mock).mock.calls;
      const userIds = createCalls.map((c) => c[0].data.userId);
      expect(userIds).toContain('user-direct');
      expect(userIds).toContain('user-child');
    });

    it('skips child sub subscribers if they have no renewal record for that month', async () => {
      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'sub-child', renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 },
      ]);
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        renewalMonthOffset: 0,
        isBundleSubscription: false,
        intervalMonths: 1,
      });
      // No direct subscribers
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);
      // Child subscriber
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-child', userId: 'user-child', costCurrency: 'USD' },
      ]);
      // No renewal record → should be skipped
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await service.retroactivelyAddBookForSubscribers(
        'sub-parent',
        monthRecord,
        { bookId: 'book-1', editionId: 'edition-1', signatureType: null },
      );

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });
  });
});
