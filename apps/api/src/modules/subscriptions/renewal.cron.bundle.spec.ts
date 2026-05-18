/**
 * Tests for RenewalCronService — bundle subscription handling.
 *
 * Bundle business rules:
 *   - isBundleSubscription=true → processOneRenewal calls addBooksForBundleMonths
 *   - addBooksForBundleMonths collects books from ALL months in the renewal window
 *     [bundleStartMonth, bundleStartMonth + intervalMonths - 1]
 *   - Skip is checked on the FIRST BOX MONTH only; a single skip blocks the whole bundle
 *   - If the first month record doesn't exist in DB → skip check is skipped (no record = no skip)
 *   - A month that has no record in DB → contributes 0 books (not an error)
 *   - A month that exists but has an empty books array → contributes 0 books
 *   - If allBooks.length === 0 after scanning all months → return early (no purchase group)
 *   - Creates exactly ONE purchase group per bundle, titled "Subscription Bundle – YYYY/MM"
 *   - retroactivelyAddBookForSubscribers for bundle subs uses separate code path:
 *     • checks skip on first month of the bundle (renewalDate + offset)
 *     • links new book to the existing bundle purchase group (keyed by bundle title)
 */

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

const FIXED_NOW = new Date('2025-04-15T12:00:00Z'); // inside Q2 bundle (Apr-Jun)

describe('RenewalCronService — bundle subscriptions', () => {
  let service: RenewalCronService;
  let prisma: DeepMockProxy<PrismaService>;

  /** April 1 2025 renewal (Q2 start for quarterly bundle, offset=0) */
  const aprilRenewalDate = new Date(Date.UTC(2025, 3, 1));

  /** Base bundle entry — quarterly, no offset */
  const bundleEntry = {
    id: 'entry-1',
    userId: 'user-1',
    subscriptionId: 'sub-bundle',
    costCurrency: 'GBP' as string | null,
    basePrice: { toString: () => '50.00' },
    shippingCost: null,
    nextRenewalDate: aprilRenewalDate,
    subscription: {
      renewalMonthOffset: 0,
      isBundleSubscription: true,
      intervalMonths: 3,
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    prisma = mockDeep<PrismaService>();
    service = new RenewalCronService(prisma);
    jest.clearAllMocks();

    // Default mocks for createPurchaseGroupAndBooks internals (shared by most tests)
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({ parentSubscriptionId: null });
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue({ billingPeriods: [] });
    (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValue({ id: 'pg-bundle-1' });
    (prisma.userSubscriptionEntryFeeTemplate.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({});
    // retroactivelyAddBookForSubscribers: no combo links by default
    (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => jest.useRealTimers());

  // =========================================================================
  // processOneRenewal — routes to addBooksForBundleMonths
  // =========================================================================

  describe('processOneRenewal — bundle routing', () => {
    it('calls addBooksForBundleMonths (not addBooksForSubscriptionMonth) for bundle entry', async () => {
      (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValue({});

      const bundleSpy = jest.spyOn(service as any, 'addBooksForBundleMonths').mockResolvedValue(undefined);
      const normalSpy = jest.spyOn(service as any, 'addBooksForSubscriptionMonth').mockResolvedValue(undefined);

      await (service as any).processOneRenewal(bundleEntry);

      expect(bundleSpy).toHaveBeenCalledWith(
        bundleEntry,
        2025, 4,          // year=2025, month=4 (bundleStartMonth, offset=0)
        3,                // intervalMonths
        aprilRenewalDate,
      );
      expect(normalSpy).not.toHaveBeenCalled();
    });

    it('bundle with offset=1: box start month = renewal month + 1', async () => {
      const entryWithOffset = {
        ...bundleEntry,
        subscription: { renewalMonthOffset: 1, isBundleSubscription: true, intervalMonths: 3 },
      };
      (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValue({});

      const bundleSpy = jest.spyOn(service as any, 'addBooksForBundleMonths').mockResolvedValue(undefined);

      await (service as any).processOneRenewal(entryWithOffset);

      // April renewal + offset=1 → May box start
      expect(bundleSpy).toHaveBeenCalledWith(
        entryWithOffset,
        2025, 5,  // May = bundleStart
        3,
        aprilRenewalDate,
      );
    });

    it('bundle with offset=2 and November renewal: bundle start wraps to January next year', async () => {
      const novRenewal = new Date(Date.UTC(2025, 10, 1)); // Nov 1 2025
      const entryNov = {
        ...bundleEntry,
        nextRenewalDate: novRenewal,
        subscription: { renewalMonthOffset: 2, isBundleSubscription: true, intervalMonths: 3 },
      };
      (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValue({});

      const bundleSpy = jest.spyOn(service as any, 'addBooksForBundleMonths').mockResolvedValue(undefined);
      await (service as any).processOneRenewal(entryNov);

      // Nov (month=11) + offset=2 = 13 → wraps to Jan 2026
      expect(bundleSpy).toHaveBeenCalledWith(entryNov, 2026, 1, 3, novRenewal);
    });

    it('records renewal and advances nextRenewalDate', async () => {
      (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValue({});
      jest.spyOn(service as any, 'addBooksForBundleMonths').mockResolvedValue(undefined);

      await (service as any).processOneRenewal(bundleEntry);

      expect(prisma.userSubscriptionRenewal.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', entryId: 'entry-1', renewalDate: aprilRenewalDate, source: 'cron' },
      });
      expect(refreshNextRenewalDate).toHaveBeenCalledWith(prisma, 'entry-1');
    });

    it('skips addBooksForBundleMonths (idempotency) when renewal record already exists', async () => {
      (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'r-existing' });
      const bundleSpy = jest.spyOn(service as any, 'addBooksForBundleMonths').mockResolvedValue(undefined);

      await (service as any).processOneRenewal(bundleEntry);

      expect(prisma.userSubscriptionRenewal.create).not.toHaveBeenCalled();
      expect(bundleSpy).not.toHaveBeenCalled();
      expect(refreshNextRenewalDate).toHaveBeenCalledWith(prisma, 'entry-1'); // still advances
    });
  });

  // =========================================================================
  // addBooksForBundleMonths — skip logic
  // =========================================================================

  describe('addBooksForBundleMonths — skip check on first month', () => {
    it('returns early when first month has an active skip (whole bundle blocked)', async () => {
      // First month (April) record exists; skip record exists and is not undone
      (prisma.subscriptionMonth.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'sm-apr' })  // first month lookup (skip check)
      ;
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce({ undoneAt: null });

      await (service as any).addBooksForBundleMonths(bundleEntry, 2025, 4, 3, aprilRenewalDate);

      // No books collected, no purchase group created
      expect(prisma.userPurchaseGroup.create).not.toHaveBeenCalled();
      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('proceeds when first month skip record has been undone', async () => {
      (prisma.subscriptionMonth.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'sm-apr' })   // skip check
        // Subsequent calls for the 3-month window:
        .mockResolvedValueOnce({ id: 'sm-apr', books: [{ bookId: 'b1', editionId: 'e1', signatureType: null }] })
        .mockResolvedValueOnce({ id: 'sm-may', books: [] })
        .mockResolvedValueOnce(null); // June: no record
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce({ undoneAt: new Date() }); // undone

      await (service as any).addBooksForBundleMonths(bundleEntry, 2025, 4, 3, aprilRenewalDate);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'Subscription Bundle – 2025/04' }),
        }),
      );
    });

    it('proceeds without skip check when first month record does NOT exist in DB', async () => {
      // The window: April, May, June (intervalMonths=3)
      // - Skip check: April findUnique → null (no record → skip check bypassed)
      // - Loop call 1 (April): null
      // - Loop call 2 (May): record with 1 book
      // - Loop call 3 (June): record with 1 book
      (prisma.subscriptionMonth.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)   // skip check: first month not in DB
        .mockResolvedValueOnce(null)   // loop i=0 (April): no record
        .mockResolvedValueOnce({ id: 'sm-may', books: [{ bookId: 'b1', editionId: 'e1', signatureType: null }] })
        .mockResolvedValueOnce({ id: 'sm-jun', books: [{ bookId: 'b2', editionId: 'e2', signatureType: null }] });

      await (service as any).addBooksForBundleMonths(bundleEntry, 2025, 4, 3, aprilRenewalDate);

      // No skip check was called (firstMonthRecord was null)
      expect(prisma.userSkipRecord.findUnique).not.toHaveBeenCalled();
      // Books from May and June were added
      expect(prisma.userPurchaseGroup.create).toHaveBeenCalled();
      expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // addBooksForBundleMonths — month presence / empty books
  // =========================================================================

  describe('addBooksForBundleMonths — missing/empty months', () => {
    /** Helper: mock a standard quarterly bundle starting April 2025 */
    function mockBundleWindow(months: Array<{
      year: number; month: number;
      record: null | { id: string; books: Array<{ bookId: string; editionId: string; signatureType: null }> };
    }>) {
      // First call: skip check on first month (April) → no skip
      (prisma.subscriptionMonth.findUnique as jest.Mock)
        .mockResolvedValueOnce(months[0].record ? { id: months[0].record.id } : null);
      if (months[0].record) {
        (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null); // no skip
      }
      // Subsequent calls: loop over all months
      for (const m of months) {
        (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce(m.record);
      }
    }

    it('returns early when ALL months in the bundle have no records', async () => {
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValue(null); // all lookups → null
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValue(null);

      await (service as any).addBooksForBundleMonths(bundleEntry, 2025, 4, 3, aprilRenewalDate);

      expect(prisma.userPurchaseGroup.create).not.toHaveBeenCalled();
    });

    it('returns early when all months exist but ALL have empty books arrays', async () => {
      const emptyMonth = (id: string) => ({ id, books: [] });
      (prisma.subscriptionMonth.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'sm-apr' })  // skip check
        .mockResolvedValueOnce(emptyMonth('sm-apr'))  // loop: April
        .mockResolvedValueOnce(emptyMonth('sm-may'))  // loop: May
        .mockResolvedValueOnce(emptyMonth('sm-jun')); // loop: June
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await (service as any).addBooksForBundleMonths(bundleEntry, 2025, 4, 3, aprilRenewalDate);

      expect(prisma.userPurchaseGroup.create).not.toHaveBeenCalled();
    });

    it('adds books from months that exist; silently skips months with no record', async () => {
      // April: no record; May: 1 book; June: no record
      (prisma.subscriptionMonth.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)  // skip check: April not in DB
        .mockResolvedValueOnce(null)  // loop April: not in DB
        .mockResolvedValueOnce({ id: 'sm-may', books: [{ bookId: 'b1', editionId: 'e1', signatureType: null }] }) // May
        .mockResolvedValueOnce(null); // June: not in DB

      await (service as any).addBooksForBundleMonths(bundleEntry, 2025, 4, 3, aprilRenewalDate);

      // Only May's book → creates purchase group with 1 book
      expect(prisma.userPurchaseGroup.create).toHaveBeenCalled();
      expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(1);
    });

    it('adds books from months that exist; silently skips months with empty books array', async () => {
      // April: empty; May: empty; June: 2 books
      (prisma.subscriptionMonth.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'sm-apr' })   // skip check
        .mockResolvedValueOnce({ id: 'sm-apr', books: [] })    // loop April
        .mockResolvedValueOnce({ id: 'sm-may', books: [] })    // loop May
        .mockResolvedValueOnce({
          id: 'sm-jun',
          books: [
            { bookId: 'b1', editionId: 'e1', signatureType: null },
            { bookId: 'b2', editionId: 'e2', signatureType: null },
          ],
        });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null); // no skip

      await (service as any).addBooksForBundleMonths(bundleEntry, 2025, 4, 3, aprilRenewalDate);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalled();
      expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(2);
    });

    it('collects books from ALL 3 months into a single purchase group', async () => {
      (prisma.subscriptionMonth.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'sm-apr' })  // skip check
        .mockResolvedValueOnce({ id: 'sm-apr', books: [{ bookId: 'b1', editionId: 'e1', signatureType: null }] })
        .mockResolvedValueOnce({ id: 'sm-may', books: [{ bookId: 'b2', editionId: 'e2', signatureType: null }] })
        .mockResolvedValueOnce({ id: 'sm-jun', books: [{ bookId: 'b3', editionId: 'e3', signatureType: null }] });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await (service as any).addBooksForBundleMonths(bundleEntry, 2025, 4, 3, aprilRenewalDate);

      // Exactly ONE purchase group with the bundle title
      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Subscription Bundle – 2025/04',
            currency: 'GBP',
          }),
        }),
      );
      // 3 separate userBookEntry.create calls (one per book)
      expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(3);
    });

    it('purchase group title uses bundle start month (padded), not individual book months', async () => {
      // Bimonthly bundle starting January (offset=0): Jan+Feb
      const janRenewal = new Date(Date.UTC(2025, 0, 1));
      const bimonthlyEntry = {
        ...bundleEntry,
        nextRenewalDate: janRenewal,
        subscription: { renewalMonthOffset: 0, isBundleSubscription: true, intervalMonths: 2 },
      };
      (prisma.subscriptionMonth.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'sm-jan' })  // skip check
        .mockResolvedValueOnce({ id: 'sm-jan', books: [{ bookId: 'b1', editionId: 'e1', signatureType: null }] })
        .mockResolvedValueOnce({ id: 'sm-feb', books: [{ bookId: 'b2', editionId: 'e2', signatureType: null }] });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await (service as any).addBooksForBundleMonths(bimonthlyEntry, 2025, 1, 2, janRenewal);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'Subscription Bundle – 2025/01' }),
        }),
      );
    });

    it('month iteration wraps correctly: Dec→Jan next year (annual bundle ending Dec)', async () => {
      // Annual bundle starting Jan 2025: covers Jan–Dec 2025
      const janRenewal = new Date(Date.UTC(2025, 0, 1));
      const annualEntry = {
        ...bundleEntry,
        nextRenewalDate: janRenewal,
        subscription: { renewalMonthOffset: 0, isBundleSubscription: true, intervalMonths: 12 },
      };

      // Mock: skip check null (no first month record), then 12 months
      // For simplicity: only Dec has a book, others return null
      const calls: Array<null | { id: string; books: any[] }> = [null]; // skip check: Jan not in DB
      for (let m = 1; m <= 11; m++) calls.push(null); // Jan–Nov: no record
      calls.push({ id: 'sm-dec', books: [{ bookId: 'b12', editionId: 'e12', signatureType: null }] }); // Dec

      let callCount = 0;
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockImplementation(() =>
        Promise.resolve(calls[callCount++] ?? null),
      );

      await (service as any).addBooksForBundleMonths(annualEntry, 2025, 1, 12, janRenewal);

      expect(prisma.userPurchaseGroup.create).toHaveBeenCalled();
      expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // addBooksForBundleMonths — idempotency (purchase group already exists)
  // =========================================================================

  describe('addBooksForBundleMonths — idempotency', () => {
    it('reuses existing purchase group when run twice for the same bundle', async () => {
      const existingGroup = { id: 'pg-existing' };
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValue(existingGroup);

      (prisma.subscriptionMonth.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'sm-apr' })  // skip check
        .mockResolvedValueOnce({ id: 'sm-apr', books: [{ bookId: 'b1', editionId: 'e1', signatureType: null }] })
        .mockResolvedValueOnce(null) // May
        .mockResolvedValueOnce(null); // June
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await (service as any).addBooksForBundleMonths(bundleEntry, 2025, 4, 3, aprilRenewalDate);

      expect(prisma.userPurchaseGroup.create).not.toHaveBeenCalled();
      expect(prisma.userBookEntry.create).toHaveBeenCalled(); // still adds book to existing group
    });
  });

  // =========================================================================
  // retroactivelyAddBookForSubscribers — bundle subscription path
  // =========================================================================

  describe('retroactivelyAddBookForSubscribers — bundle subscription', () => {
    /** April subscription month (Q2 first box, offset=0) */
    const aprilMonthRecord = { id: 'sm-april', year: 2025, month: 4, signatureType: null };
    const bookToAdd = { bookId: 'b-new', editionId: 'e-new', signatureType: null };

    beforeEach(() => {
      // Default: no children, direct sub is a bundle (quarterly, offset=0)
      (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]); // no child subs
    });

    it('adds book to existing bundle group when renewal exists and no skip', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        renewalMonthOffset: 0,
        isBundleSubscription: true,
        intervalMonths: 3,
      }); // directSub

      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: 'GBP' },
      ]);
      // Renewal in the bundle window: Apr renewal date (monthStart=Jan, monthEnd=Apr for interval=3)
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
        renewalDate: aprilRenewalDate,
      });
      // Bundle first month record for skip check: April (renewalDate + offset=0)
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'sm-april' });
      // No skip
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);
      // Existing bundle purchase group
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'pg-bundle-1' });
      // Book not yet in collection
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({});

      await service.retroactivelyAddBookForSubscribers('sub-bundle', aprilMonthRecord, bookToAdd);

      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            bookId: 'b-new',
            editionId: 'e-new',
            purchaseGroupId: 'pg-bundle-1',
          }),
        }),
      );
    });

    it('skips entry when first month of bundle has an active skip', async () => {
      (prisma.subscription.findUnique as jest.Mock)
        .mockResolvedValueOnce({ renewalMonthOffset: 0, isBundleSubscription: true, intervalMonths: 3 });

      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: 'GBP' },
      ]);
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
        renewalDate: aprilRenewalDate,
      });
      // Bundle first month record exists
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'sm-april' });
      // Active skip on first month → block whole bundle
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce({ undoneAt: null });

      await service.retroactivelyAddBookForSubscribers('sub-bundle', aprilMonthRecord, bookToAdd);

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('proceeds without skip check when bundle first month record does not exist', async () => {
      (prisma.subscription.findUnique as jest.Mock)
        .mockResolvedValueOnce({ renewalMonthOffset: 0, isBundleSubscription: true, intervalMonths: 3 });

      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: 'GBP' },
      ]);
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
        renewalDate: aprilRenewalDate,
      });
      // Bundle first month record doesn't exist in DB → skip check bypassed
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce(null);
      // No skip check expected — but still continues
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce(null); // no existing group
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({});

      await service.retroactivelyAddBookForSubscribers('sub-bundle', aprilMonthRecord, bookToAdd);

      // Skip check NOT called (no first month record)
      expect(prisma.userSkipRecord.findUnique).not.toHaveBeenCalled();
      // Book is still added (no block)
      expect(prisma.userBookEntry.create).toHaveBeenCalled();
    });

    it('does not add book when user has no renewal record in the bundle window', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        renewalMonthOffset: 0,
        isBundleSubscription: true,
        intervalMonths: 3,
      });

      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: 'GBP' },
      ]);
      // No renewal in the window
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await service.retroactivelyAddBookForSubscribers('sub-bundle', aprilMonthRecord, bookToAdd);

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('bundle with offset=1: computes correct bundle start month for skip check', async () => {
      // offset=1, monthly record being added is May (box month for Q2)
      // renewalDate = April (Q2 renewal), bundleStart = April + offset=1 = May
      const mayMonthRecord = { id: 'sm-may', year: 2025, month: 5, signatureType: null };

      (prisma.subscription.findUnique as jest.Mock)
        .mockResolvedValueOnce({ renewalMonthOffset: 1, isBundleSubscription: true, intervalMonths: 3 });

      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: 'GBP' },
      ]);
      // Renewal date = April 1 (renewal for Q2)
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
        renewalDate: aprilRenewalDate,
      });
      // Bundle first month: April (renewalDate=Apr) + offset=1 = May
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'sm-may' });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({});

      await service.retroactivelyAddBookForSubscribers('sub-bundle', mayMonthRecord, bookToAdd);

      // Verify skip was checked on May (bStartMonth = April + 1 = May)
      const skipCheckCall = (prisma.subscriptionMonth.findUnique as jest.Mock).mock.calls[0][0];
      expect(skipCheckCall.where.subscriptionId_year_month.month).toBe(5); // May
    });

    it('does not add book when it already exists in user collection', async () => {
      (prisma.subscription.findUnique as jest.Mock)
        .mockResolvedValueOnce({ renewalMonthOffset: 0, isBundleSubscription: true, intervalMonths: 3 });

      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: 'GBP' },
      ]);
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
        renewalDate: aprilRenewalDate,
      });
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'sm-april' });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
      // Book ALREADY exists
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'existing-entry' });

      await service.retroactivelyAddBookForSubscribers('sub-bundle', aprilMonthRecord, bookToAdd);

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('links new book to purchase group with null id when no existing group found', async () => {
      (prisma.subscription.findUnique as jest.Mock)
        .mockResolvedValueOnce({ renewalMonthOffset: 0, isBundleSubscription: true, intervalMonths: 3 });

      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: 'GBP' },
      ]);
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
        renewalDate: aprilRenewalDate,
      });
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'sm-april' });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);
      // No existing group found (bundle not yet created — edge case)
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({});

      await service.retroactivelyAddBookForSubscribers('sub-bundle', aprilMonthRecord, bookToAdd);

      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchaseGroupId: null, // no group → null
          }),
        }),
      );
    });

    it('returns early when book has no editionId', async () => {
      await service.retroactivelyAddBookForSubscribers('sub-bundle', aprilMonthRecord, {
        bookId: 'b-new',
        editionId: null,
        signatureType: null,
      });

      // Nothing should be touched
      expect(prisma.subscription.findMany).not.toHaveBeenCalled();
      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('adds book to ALL users who have active entries for the bundle', async () => {
      // Two users are subscribed to the same bundle
      (prisma.subscription.findUnique as jest.Mock)
        .mockResolvedValueOnce({ renewalMonthOffset: 0, isBundleSubscription: true, intervalMonths: 3 })
        .mockResolvedValueOnce({ parentSubscriptionId: null }) // effectiveSubId for user-1
        .mockResolvedValueOnce({ parentSubscriptionId: null }); // effectiveSubId for user-2

      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'entry-1', userId: 'user-1', costCurrency: 'GBP' },
        { id: 'entry-2', userId: 'user-2', costCurrency: 'USD' },
      ]);

      // Both users had a renewal in the bundle window
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock)
        .mockResolvedValueOnce({ renewalDate: aprilRenewalDate })
        .mockResolvedValueOnce({ renewalDate: aprilRenewalDate });

      // Both have first month record, no skips
      (prisma.subscriptionMonth.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'sm-april' })
        .mockResolvedValueOnce({ id: 'sm-april' });
      (prisma.userSkipRecord.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (prisma.userPurchaseGroup.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'pg-1' })
        .mockResolvedValueOnce({ id: 'pg-2' });
      (prisma.userBookEntry.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await service.retroactivelyAddBookForSubscribers('sub-bundle', aprilMonthRecord, bookToAdd);

      expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(2);
      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
      );
      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-2' }) }),
      );
    });

    it('content stream: book added to child BUNDLE sub subscribers', async () => {
      // subscriptionId is a content stream (non-bundle parent).
      // It has one bundle child sub. The admin adds a book to the content stream.
      // retroactivelyAddBookForSubscribers should add it to bundle child subscribers.
      const childBundleSubId = 'child-bundle-sub';

      // childSubs query returns the bundle child
      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: childBundleSubId, renewalMonthOffset: 0, isBundleSubscription: true, intervalMonths: 3 },
      ]);

      // directSub is the content stream (non-bundle — no direct subscribers in this test)
      (prisma.subscription.findUnique as jest.Mock)
        .mockResolvedValueOnce({ renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 }) // directSub
        .mockResolvedValueOnce({ parentSubscriptionId: null }); // effectiveSubId for child

      // Content stream itself has no direct active entries
      (prisma.userSubscriptionEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // content stream direct entries: none
        .mockResolvedValueOnce([{ id: 'entry-child-1', userId: 'user-bundle', costCurrency: 'GBP' }]); // child entries

      // Child user had a renewal in the Q2 window
      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
        renewalDate: aprilRenewalDate,
      });
      // Bundle first month record and no skip
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'sm-april' });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'pg-child-bundle' });
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await service.retroactivelyAddBookForSubscribers('content-stream', aprilMonthRecord, bookToAdd);

      expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(1);
      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-bundle',
            purchaseGroupId: 'pg-child-bundle',
          }),
        }),
      );
    });

    it('content stream: skips child bundle subscriber who skipped the bundle', async () => {
      const childBundleSubId = 'child-bundle-sub';

      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: childBundleSubId, renewalMonthOffset: 0, isBundleSubscription: true, intervalMonths: 3 },
      ]);
      (prisma.subscription.findUnique as jest.Mock)
        .mockResolvedValueOnce({ renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 })
        .mockResolvedValueOnce({ parentSubscriptionId: null });

      (prisma.userSubscriptionEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'entry-child-1', userId: 'user-bundle', costCurrency: 'GBP' }]);

      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
        renewalDate: aprilRenewalDate,
      });
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'sm-april' });
      // Active skip on bundle first month → block
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce({ undoneAt: null });

      await service.retroactivelyAddBookForSubscribers('content-stream', aprilMonthRecord, bookToAdd);

      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    // =========================================================================
    // Bug fix: effectiveSubId — content stream with bundle child
    // =========================================================================
    it('[bug fix] skip check uses content-stream months, not child bundle months', async () => {
      // subscriptionId = content stream; child bundle sub uses the content stream's months.
      // Before fix: effectiveSubId was set to child.id → looked up months on the wrong sub.
      // After fix: effectiveSubId = subscriptionId (content stream) always.
      const childBundleSubId = 'child-bundle-sub';
      const contentStreamId = 'content-stream';

      (prisma.subscription.findMany as jest.Mock).mockResolvedValueOnce([
        { id: childBundleSubId, renewalMonthOffset: 0, isBundleSubscription: true, intervalMonths: 3 },
      ]);
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        renewalMonthOffset: 0,
        isBundleSubscription: false,
        intervalMonths: 1,
      }); // directSub = content stream (no bundle)

      (prisma.userSubscriptionEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // content stream direct entries: none
        .mockResolvedValueOnce([{ id: 'entry-child-1', userId: 'user-bundle', costCurrency: 'GBP' }]);

      (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
        renewalDate: aprilRenewalDate,
      });
      (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'sm-april' });
      (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'pg-bundle' });
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await service.retroactivelyAddBookForSubscribers(contentStreamId, aprilMonthRecord, bookToAdd);

      // Skip check MUST use contentStreamId (subscriptionId parameter), not child bundle id
      const skipMonthCall = (prisma.subscriptionMonth.findUnique as jest.Mock).mock.calls[0][0];
      expect(skipMonthCall.where.subscriptionId_year_month.subscriptionId).toBe(contentStreamId);
      expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(1);
    });

    // =========================================================================
    // Bug fix: combo subscriptions — retroactive add
    // =========================================================================
    describe('retroactivelyAddBookForSubscribers — combo subscription', () => {
      const aprilMonthRecord = { id: 'sm-april', year: 2025, month: 4, signatureType: null };
      const bookToAdd = { bookId: 'b-combo', editionId: 'e-combo', signatureType: null };

      it('adds book to combo subscriber when component month is added', async () => {
        // subscriptionId = component sub; combo-sub has this component
        (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]); // no child subs
        (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
          renewalMonthOffset: 0,
          isBundleSubscription: false,
          intervalMonths: 1,
        }); // direct sub

        // No direct subscribers
        (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([]);

        // Combo link: combo-sub includes component-sub
        (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValueOnce([
          { comboId: 'combo-sub' },
        ]);
        // Combo sub offset
        (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ renewalMonthOffset: 0 });
        // Combo subscriber
        (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([
          { id: 'entry-combo-1', userId: 'user-combo', costCurrency: 'USD' },
        ]);
        // Combo user had a renewal in April
        (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
          id: 'renewal-1',
        });
        // Existing purchase group for April
        (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'pg-april' });
        // Book not yet in collection
        (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

        await service.retroactivelyAddBookForSubscribers('component-sub', aprilMonthRecord, bookToAdd);

        expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              userId: 'user-combo',
              bookId: 'b-combo',
              editionId: 'e-combo',
              purchaseGroupId: 'pg-april',
            }),
          }),
        );
      });

      it('does not add book to combo subscriber when no renewal exists in the month window', async () => {
        (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.subscription.findUnique as jest.Mock)
          .mockResolvedValueOnce({ renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 })
          .mockResolvedValueOnce({ renewalMonthOffset: 0 }); // combo sub offset

        (prisma.userSubscriptionEntry.findMany as jest.Mock)
          .mockResolvedValueOnce([]) // direct
          .mockResolvedValueOnce([{ id: 'entry-combo-1', userId: 'user-combo', costCurrency: 'USD' }]);

        (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValueOnce([
          { comboId: 'combo-sub' },
        ]);
        // No renewal in window
        (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce(null);

        await service.retroactivelyAddBookForSubscribers('component-sub', aprilMonthRecord, bookToAdd);

        expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
      });

      it('does not add book when already in combo subscriber collection', async () => {
        (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.subscription.findUnique as jest.Mock)
          .mockResolvedValueOnce({ renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 })
          .mockResolvedValueOnce({ renewalMonthOffset: 0 });

        (prisma.userSubscriptionEntry.findMany as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'entry-combo-1', userId: 'user-combo', costCurrency: 'USD' }]);

        (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValueOnce([
          { comboId: 'combo-sub' },
        ]);
        (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'r1' });
        (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
        // Book ALREADY in collection
        (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'existing-1' });

        await service.retroactivelyAddBookForSubscribers('component-sub', aprilMonthRecord, bookToAdd);

        expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
      });

      it('combo sub with offset=1: uses correct renewal window (March renewal for April box)', async () => {
        // component month = April (box), combo sub has offset=1
        // renewalMonth = April - 1 = March → look for renewal in March window
        const marchRenewalDate = new Date(Date.UTC(2025, 2, 1));

        (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.subscription.findUnique as jest.Mock)
          .mockResolvedValueOnce({ renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 })
          .mockResolvedValueOnce({ renewalMonthOffset: 1 }); // combo sub has offset=1

        (prisma.userSubscriptionEntry.findMany as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'entry-combo-1', userId: 'user-combo', costCurrency: 'USD' }]);

        (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValueOnce([
          { comboId: 'combo-sub' },
        ]);
        // Renewal in March window
        (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mockResolvedValueOnce({
          id: 'r1',
          renewalDate: marchRenewalDate,
        });
        (prisma.userPurchaseGroup.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'pg-march' });
        (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);

        await service.retroactivelyAddBookForSubscribers('component-sub', aprilMonthRecord, bookToAdd);

        // Verify renewal was looked up in March window (offset=1 → renewalMonth = 4-1 = 3)
        const renewalQuery = (prisma.userSubscriptionRenewal.findFirst as jest.Mock).mock.calls[0][0];
        const windowStart: Date = renewalQuery.where.renewalDate.gte;
        expect(windowStart.getUTCMonth()).toBe(2); // March = index 2
        expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ userId: 'user-combo', purchaseGroupId: 'pg-march' }),
          }),
        );
      });

      it('handles multiple combo subs containing the same component', async () => {
        // Two different combo subs both include the same component
        (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.subscription.findUnique as jest.Mock)
          .mockResolvedValueOnce({ renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 })
          .mockResolvedValueOnce({ renewalMonthOffset: 0 }) // combo-1 offset
          .mockResolvedValueOnce({ renewalMonthOffset: 0 }); // combo-2 offset

        (prisma.userSubscriptionEntry.findMany as jest.Mock)
          .mockResolvedValueOnce([]) // direct
          .mockResolvedValueOnce([{ id: 'entry-c1', userId: 'user-a', costCurrency: 'USD' }])
          .mockResolvedValueOnce([{ id: 'entry-c2', userId: 'user-b', costCurrency: 'USD' }]);

        (prisma.subscriptionComboComponent.findMany as jest.Mock).mockResolvedValueOnce([
          { comboId: 'combo-1' },
          { comboId: 'combo-2' },
        ]);

        (prisma.userSubscriptionRenewal.findFirst as jest.Mock)
          .mockResolvedValueOnce({ id: 'r1' })
          .mockResolvedValueOnce({ id: 'r2' });

        (prisma.userPurchaseGroup.findFirst as jest.Mock)
          .mockResolvedValueOnce({ id: 'pg-a' })
          .mockResolvedValueOnce({ id: 'pg-b' });

        (prisma.userBookEntry.findFirst as jest.Mock)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);

        await service.retroactivelyAddBookForSubscribers('component-sub', aprilMonthRecord, bookToAdd);

        expect(prisma.userBookEntry.create).toHaveBeenCalledTimes(2);
        expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ userId: 'user-a' }) }),
        );
        expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ userId: 'user-b' }) }),
        );
      });
    });
  });

  // =========================================================================
  // processRenewals — integration: bundle entries are discovered and processed
  // =========================================================================

  describe('processRenewals — picks up bundle entries', () => {
    it('processes bundle subscription entries found in the due-entries query', async () => {
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([bundleEntry]);
      const spy = jest.spyOn(service as any, 'processOneRenewal').mockResolvedValue(undefined);

      await service.processRenewals();

      expect(spy).toHaveBeenCalledWith(bundleEntry);
    });

    it('processes both bundle and non-bundle entries in the same run', async () => {
      const normalEntry = {
        ...bundleEntry,
        id: 'entry-2',
        subscription: { renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 },
      };
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([bundleEntry, normalEntry]);
      const spy = jest.spyOn(service as any, 'processOneRenewal').mockResolvedValue(undefined);

      await service.processRenewals();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith(bundleEntry);
      expect(spy).toHaveBeenCalledWith(normalEntry);
    });

    it('continues processing remaining entries when bundle entry fails', async () => {
      const normalEntry = { ...bundleEntry, id: 'entry-2', subscription: null };
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValueOnce([bundleEntry, normalEntry]);
      const spy = jest.spyOn(service as any, 'processOneRenewal')
        .mockRejectedValueOnce(new Error('bundle exploded'))
        .mockResolvedValueOnce(undefined);

      await expect(service.processRenewals()).resolves.not.toThrow();
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
