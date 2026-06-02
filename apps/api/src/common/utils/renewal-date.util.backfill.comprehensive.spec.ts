/**
 * Comprehensive tests for backfillRenewalHistory
 *
 * Covers:
 *  – All subscription interval types: monthly, bimonthly, quarterly, semi-annual, annual
 *  – Monthly bundle subscription (intervalMonths=2, isBundleSubscription flag irrelevant to backfill)
 *  – Without skips / with single skip / with multiple historical skips
 *  – Skips with renewalMonthOffset (box month ≠ renewal month)
 *  – Active entries
 *  – Cancelled entries (active=false — backfill runs regardless)
 *  – Default subscription currency (note: backfillRenewalHistory creates renewal records only;
 *    price/currency live in createPurchaseGroupAndBooks — tested in renewal.cron.price-change.spec.ts)
 *  – startDate in YYYY-MM-DD and YYYY-MM format
 *  – renewalDay != 1
 *  – No past dates → $transaction not called
 *  – Idempotency: upsert is a no-op when record already exists
 *  – Custom startingMonth alignment for multi-month intervals
 *  – Historical skips from multiple years back
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { backfillRenewalHistory } from './renewal-date.util';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Snapshot "now" as April 1, 2025 UTC */
const FIXED_NOW = new Date('2025-04-01T00:00:00Z');

function d(isoDate: string) {
  return new Date(isoDate);
}

type SettingsHistoryRecord = {
  effectiveFrom: Date;
  renewalDay: number | null;
  renewalDayUserSet: boolean;
  paymentOnStartup: boolean;
  signupIncludesCurrentMonth: boolean;
  renewalMonthOffset: number;
};

/** Build a mock entry. Merge with overrides at any depth by hand. */
function makeEntry(overrides: {
  id?: string;
  userId?: string;
  active?: boolean;
  startDate?: string | null;
  renewalDay?: number | null;
  skipRecords?: Array<{ month: { year: number; month: number } }>;
  subscription?: {
    renewalDay?: number;
    renewalDayUserSet?: boolean;
    intervalMonths?: number;
    startingMonth?: number | null;
    renewalMonthOffset?: number;
    settingsHistory?: SettingsHistoryRecord[];
  };
} = {}) {
  return {
    id: overrides.id ?? 'entry-1',
    userId: overrides.userId ?? 'user-1',
    active: overrides.active ?? true,
    startDate: overrides.startDate !== undefined ? overrides.startDate : '2024-01-01',
    renewalDay: overrides.renewalDay ?? null,
    skipRecords: overrides.skipRecords ?? [],
    subscription: {
      renewalDay: 1,
      renewalDayUserSet: false,
      intervalMonths: 1,
      startingMonth: null,
      renewalMonthOffset: 0,
      settingsHistory: [],
      ...(overrides.subscription ?? {}),
    },
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('backfillRenewalHistory', () => {
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    prisma = mockDeep<PrismaService>();
    jest.clearAllMocks();
    // Default: $transaction resolves to empty array
    (prisma.$transaction as jest.Mock).mockResolvedValue([]);
    // Default: upsert returns a resolved promise (so inline map works)
    (prisma.userSubscriptionRenewal.upsert as jest.Mock).mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Guard: early returns ───────────────────────────────────────────────────

  describe('early returns', () => {
    it('returns early when entry is not found', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await backfillRenewalHistory(prisma, 'entry-x');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns early when entry has no startDate', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: null }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns early when no past dates are generated (subscription just started)', async () => {
      // startDate = March 25 2025; renewalDay=1 → Mar 1 < startDate, Apr 1 >= now → 0 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2025-03-25' }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── Monthly subscription ───────────────────────────────────────────────────

  describe('monthly subscription (intervalMonths=1)', () => {
    it('backfills 15 monthly dates from Jan 2024 to Mar 2025', async () => {
      // startDate=2024-01-01, now=2025-04-01, renewalDay=1
      // Expected: Jan 1 2024 … Mar 1 2025 (15 months)
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(makeEntry());

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(15);

      // Verify upsert was called with correct create payload for Jan 2024
      expect(prisma.userSubscriptionRenewal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entryId_renewalDate: { entryId: 'entry-1', renewalDate: d('2024-01-01T00:00:00Z') } },
          create: {
            userId: 'user-1',
            entryId: 'entry-1',
            renewalDate: d('2024-01-01T00:00:00Z'),
            source: 'backfill',
          },
          update: {},
        }),
      );

      // Last date: Mar 1 2025
      expect(prisma.userSubscriptionRenewal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entryId_renewalDate: { entryId: 'entry-1', renewalDate: d('2025-03-01T00:00:00Z') } },
        }),
      );
    });

    it('uses entry.renewalDay when renewalDayUserSet=true (user-date mode)', async () => {
      // entry.renewalDay=15; startDate=2025-01-01; now=2025-04-01
      // Jan 15 2025, Feb 15 2025, Mar 15 2025 = 3 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2025-01-01', renewalDay: 15, subscription: { renewalDayUserSet: true } }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(3);

      expect(prisma.userSubscriptionRenewal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entryId_renewalDate: { entryId: 'entry-1', renewalDate: d('2025-01-15T00:00:00Z') } },
        }),
      );
      expect(prisma.userSubscriptionRenewal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entryId_renewalDate: { entryId: 'entry-1', renewalDate: d('2025-03-15T00:00:00Z') } },
        }),
      );
    });

    it('uses subscription.renewalDay=1 as fallback when entry.renewalDay is null', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2025-01-01', renewalDay: null }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      // Jan 1, Feb 1, Mar 1 = 3 dates
      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(3);
    });

    it('only includes dates >= startDate (startDate later than interval start)', async () => {
      // startDate=2024-03-15, renewalDay=1
      // Mar 1 2024 < startDate; Apr 1 2024 >= startDate → included from Apr 2024
      // Apr 2024 … Mar 2025 = 12 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2024-03-15' }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(12); // Apr 2024 – Mar 2025
    });

    it('excludes dates >= now (Apr 1 2025 is not in past)', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2025-03-01' }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      // Mar 1 2025 is in the past; Apr 1 2025 >= now → break
      expect(txCall).toHaveLength(1);
      expect(prisma.userSubscriptionRenewal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entryId_renewalDate: { entryId: 'entry-1', renewalDate: d('2025-03-01T00:00:00Z') } },
        }),
      );
    });
  });

  // ── Monthly with skips ─────────────────────────────────────────────────────

  describe('monthly — with skips', () => {
    it('excludes a skipped month from the backfill', async () => {
      // Skip Jan 2025
      const entry = makeEntry({
        skipRecords: [{ month: { year: 2025, month: 1 } }],
        startDate: '2025-01-01',
      });
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);

      await backfillRenewalHistory(prisma, 'entry-1');

      // Feb 1 2025, Mar 1 2025 (Jan skipped)
      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(2);

      // Ensure Jan 2025 was NOT upserted
      const upsertCalls = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls;
      const upsertedDates = upsertCalls.map((c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString());
      expect(upsertedDates).not.toContain('2025-01-01T00:00:00.000Z');
    });

    it('excludes multiple skips including one from a prior year', async () => {
      // Skip Nov 2024 and Feb 2025
      const entry = makeEntry({
        skipRecords: [
          { month: { year: 2024, month: 11 } },
          { month: { year: 2025, month: 2 } },
        ],
        startDate: '2024-10-01',
      });
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);

      await backfillRenewalHistory(prisma, 'entry-1');

      const upsertCalls = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls;
      const upsertedDates = upsertCalls.map((c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString());

      expect(upsertedDates).not.toContain('2024-11-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2025-02-01T00:00:00.000Z');
      // Oct, Dec 2024; Jan, Mar 2025 = 4 dates
      expect(upsertedDates).toHaveLength(4);
    });

    it('handles skips with renewalMonthOffset (box month → renewal month conversion)', async () => {
      // renewalMonthOffset=1: box Feb 2025 → renewal Jan 2025
      // Skip record is stored as box month Feb 2025
      const entry = makeEntry({
        skipRecords: [{ month: { year: 2025, month: 2 } }], // box month
        startDate: '2025-01-01',
        subscription: {
          renewalDay: 1,
          intervalMonths: 1,
          startingMonth: null,
          renewalMonthOffset: 1,
        },
      });
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);

      await backfillRenewalHistory(prisma, 'entry-1');

      // Renewal months: Jan 2025, Feb 2025, Mar 2025
      // Box Feb = renewal Jan → Jan 2025 excluded
      const upsertCalls = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls;
      const upsertedDates = upsertCalls.map((c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString());

      expect(upsertedDates).not.toContain('2025-01-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-02-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-03-01T00:00:00.000Z');
      expect(upsertedDates).toHaveLength(2);
    });

    it('handles skips from multiple years back (backfill scenario)', async () => {
      // Long-running subscription: started Jan 2023
      // Skips: Mar 2023, Sep 2023, Jan 2024, Jun 2024
      jest.setSystemTime(new Date('2025-04-01T00:00:00Z'));
      const entry = makeEntry({
        startDate: '2023-01-01',
        skipRecords: [
          { month: { year: 2023, month: 3 } },
          { month: { year: 2023, month: 9 } },
          { month: { year: 2024, month: 1 } },
          { month: { year: 2024, month: 6 } },
        ],
      });
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);

      await backfillRenewalHistory(prisma, 'entry-1');

      const upsertCalls = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls;
      const upsertedDates = upsertCalls.map((c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString());

      // Total: Jan 2023 – Mar 2025 = 27 months – 4 skips = 23 dates
      expect(upsertedDates).toHaveLength(23);

      // Skipped months not present
      expect(upsertedDates).not.toContain('2023-03-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2023-09-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2024-01-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2024-06-01T00:00:00.000Z');
    });
  });

  // ── Active vs Cancelled entries ───────────────────────────────────────────

  describe('active vs cancelled entries', () => {
    it('backfills an active entry normally', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ active: true, startDate: '2025-01-01' }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(3); // Jan, Feb, Mar 2025
    });

    it('backfills a cancelled (active=false) entry — active flag does not block backfill', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ active: false, startDate: '2025-01-01' }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      // Same 3 dates; backfillRenewalHistory has no early-return on active=false
      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(3);
    });

    it('cancelled entry with skips: skipped months excluded', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          active: false,
          startDate: '2025-01-01',
          skipRecords: [{ month: { year: 2025, month: 2 } }],
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const upsertCalls = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls;
      // Jan 2025, Mar 2025 = 2 dates (Feb skipped)
      expect(upsertCalls).toHaveLength(2);
    });
  });

  // ── startDate format variants ─────────────────────────────────────────────

  describe('startDate format variants', () => {
    it('parses YYYY-MM-DD format correctly', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2025-02-15' }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      // Feb 1 2025 < startDate (Feb 15) → excluded; Mar 1 2025 >= startDate → included
      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(1);
      expect(prisma.userSubscriptionRenewal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entryId_renewalDate: { entryId: 'entry-1', renewalDate: d('2025-03-01T00:00:00Z') } },
        }),
      );
    });

    it('parses YYYY-MM format (no day component — defaults to day 1)', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2025-02' }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      // startDate = Feb 1 2025; Feb 1 >= startDate → included
      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(2); // Feb 1 + Mar 1 2025
    });
  });

  // ── Bimonthly subscription (intervalMonths=2) ─────────────────────────────

  describe('bimonthly subscription (intervalMonths=2)', () => {
    it('backfills only aligned months — startingMonth=1 gives Jan, Mar, May, …', async () => {
      // startDate=2024-01-01, now=2025-04-01, intervalMonths=2, startingMonth=1
      // Aligned: Jan, Mar, May, Jul, Sep, Nov 2024; Jan, Mar 2025 = 8 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          subscription: { renewalDay: 1, intervalMonths: 2, startingMonth: 1, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(8);

      const upsertCalls = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls;
      const upsertedDates = upsertCalls.map((c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString());

      expect(upsertedDates).toContain('2024-01-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-03-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-03-01T00:00:00.000Z');
      // Non-aligned months must NOT appear
      expect(upsertedDates).not.toContain('2024-02-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2024-04-01T00:00:00.000Z');
    });

    it('bimonthly startingMonth=2 gives Feb, Apr, Jun, …', async () => {
      // startDate=2024-02-01, startingMonth=2
      // Aligned: Feb, Apr, Jun, Aug, Oct, Dec 2024; Feb 2025 = 7 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2024-02-01',
          subscription: { renewalDay: 1, intervalMonths: 2, startingMonth: 2, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(7);

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).toContain('2024-02-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-04-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2024-01-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2024-03-01T00:00:00.000Z');
    });

    it('bimonthly with a skip — skipped aligned month excluded', async () => {
      // Skip Mar 2025 (aligned)
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          skipRecords: [{ month: { year: 2025, month: 3 } }],
          subscription: { renewalDay: 1, intervalMonths: 2, startingMonth: 1, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(7); // 8 - 1 skipped

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).not.toContain('2025-03-01T00:00:00.000Z');
    });
  });

  // ── Monthly bundle subscription (intervalMonths=2, isBundleSubscription flag irrelevant here) ──

  describe('monthly bundle subscription (intervalMonths=2, startingMonth=1)', () => {
    it('backfills only renewal months — same logic as bimonthly', async () => {
      // Monthly bundle with intervalMonths=2 behaves identically to bimonthly in backfill
      // Jan, Mar, May, Jul, Sep, Nov 2024; Jan, Mar 2025 = 8 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          subscription: { renewalDay: 1, intervalMonths: 2, startingMonth: 1, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(8);
    });

    it('monthly bundle with skip — bundle skip (first month) excluded from renewal dates', async () => {
      // Skip Jan 2025 (the first month of the Jan-Feb 2025 bundle)
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          skipRecords: [{ month: { year: 2025, month: 1 } }],
          subscription: { renewalDay: 1, intervalMonths: 2, startingMonth: 1, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(7); // Jan 2025 renewal skipped

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).not.toContain('2025-01-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-03-01T00:00:00.000Z');
    });
  });

  // ── Quarterly subscription (intervalMonths=3) ─────────────────────────────

  describe('quarterly subscription (intervalMonths=3)', () => {
    it('backfills aligned quarterly months — startingMonth=1 gives Jan, Apr, Jul, Oct', async () => {
      // startDate=2024-01-01, now=2025-04-01
      // Aligned: Jan, Apr, Jul, Oct 2024; Jan 2025 = 5 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          subscription: { renewalDay: 1, intervalMonths: 3, startingMonth: 1, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(5);

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).toContain('2024-01-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-04-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-07-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-10-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-01-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2024-02-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2024-03-01T00:00:00.000Z');
    });

    it('quarterly startingMonth=2 gives Feb, May, Aug, Nov alignment', async () => {
      // startDate=2024-02-01, startingMonth=2
      // Aligned: Feb, May, Aug, Nov 2024; Feb 2025 = 5 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2024-02-01',
          subscription: { renewalDay: 1, intervalMonths: 3, startingMonth: 2, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(5);

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).toContain('2024-02-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-05-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-08-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-11-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-02-01T00:00:00.000Z');
    });

    it('quarterly with a skip excludes the skipped quarter', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          skipRecords: [{ month: { year: 2024, month: 7 } }], // Skip Jul 2024 quarter
          subscription: { renewalDay: 1, intervalMonths: 3, startingMonth: 1, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(4); // 5 - 1

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).not.toContain('2024-07-01T00:00:00.000Z');
    });
  });

  // ── Semi-annual subscription (intervalMonths=6) ───────────────────────────

  describe('semi-annual subscription (intervalMonths=6)', () => {
    it('backfills every 6 months — Jan and Jul', async () => {
      // startDate=2024-01-01, now=2025-04-01, startingMonth=1
      // Aligned: Jan 2024 (offset=0), Jul 2024 (offset=6→0), Jan 2025 (offset=12→0) = 3 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          subscription: { renewalDay: 1, intervalMonths: 6, startingMonth: 1, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(3);

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).toContain('2024-01-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-07-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-01-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2024-04-01T00:00:00.000Z');
    });

    it('semi-annual with a skip — skipped semi-annual excluded', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          skipRecords: [{ month: { year: 2024, month: 7 } }],
          subscription: { renewalDay: 1, intervalMonths: 6, startingMonth: 1, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(2); // Jul 2024 skipped

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).not.toContain('2024-07-01T00:00:00.000Z');
    });
  });

  // ── Annual subscription (intervalMonths=12) ───────────────────────────────

  describe('annual subscription (intervalMonths=12)', () => {
    it('backfills one record per year — Jan 2024 and Jan 2025', async () => {
      // startDate=2024-01-01, now=2025-04-01, startingMonth=1, intervalMonths=12
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          subscription: { renewalDay: 1, intervalMonths: 12, startingMonth: 1, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(2);

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).toContain('2024-01-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-01-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2024-06-01T00:00:00.000Z');
    });

    it('annual with a skip — skipped year excluded', async () => {
      // Skip Jan 2024
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          skipRecords: [{ month: { year: 2024, month: 1 } }],
          subscription: { renewalDay: 1, intervalMonths: 12, startingMonth: 1, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(1); // Jan 2025 only

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).not.toContain('2024-01-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-01-01T00:00:00.000Z');
    });

    it('annual subscription started mid-year — only aligns from startingMonth', async () => {
      // startingMonth=7 (July), startDate=2023-07-01, now=2025-04-01
      // Aligned: Jul 2023, Jul 2024 = 2 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2023-07-01',
          subscription: { renewalDay: 1, intervalMonths: 12, startingMonth: 7, renewalMonthOffset: 0 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(2);

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).toContain('2023-07-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-07-01T00:00:00.000Z');
    });
  });

  // ── Custom renewalDay ─────────────────────────────────────────────────────

  describe('custom renewalDay', () => {
    it('generates dates on the correct day of month (subscription fixed-day mode)', async () => {
      // renewalDay=15 on subscription, renewalDayUserSet=false → fixed for all subscribers
      // startDate=2025-01-01, now=2025-04-01
      // Jan 15, Feb 15, Mar 15 = 3 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2025-01-01', subscription: { renewalDay: 15 } }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).toContain('2025-01-15T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-02-15T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-03-15T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2025-01-01T00:00:00.000Z');
    });

    it('entry.renewalDay used when renewalDayUserSet=true; subscription.renewalDay ignored', async () => {
      const entry = makeEntry({ startDate: '2025-01-01', renewalDay: 20, subscription: { renewalDayUserSet: true } });
      // subscription.renewalDay is 1, but renewalDayUserSet=true → entry day (20) takes precedence
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);

      await backfillRenewalHistory(prisma, 'entry-1');

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).toContain('2025-01-20T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2025-01-01T00:00:00.000Z');
    });

    it('subscription.renewalDay used for ALL entries when renewalDayUserSet=false', async () => {
      // entry.renewalDay=20 is irrelevant when renewalDayUserSet=false → uses sub.renewalDay=1
      const entry = makeEntry({ startDate: '2025-01-01', renewalDay: 20, subscription: { renewalDayUserSet: false } });
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(entry);

      await backfillRenewalHistory(prisma, 'entry-1');

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).toContain('2025-01-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2025-01-20T00:00:00.000Z');
    });
  });

  // ── Currency note (backfill is currency-agnostic) ─────────────────────────

  describe('currency note — backfill creates renewal records only', () => {
    /**
     * backfillRenewalHistory creates UserSubscriptionRenewal with source='backfill'.
     * It does NOT create purchase groups or resolve prices/currencies.
     *
     * Currency / pricing scenarios for the renewal flow are covered in:
     *  - renewal.cron.price-change.spec.ts (addBooksForSubscriptionMonth — USD, GBP, changed currency)
     *  - renewal.cron.prepaid.spec.ts (billing period pricing)
     *
     * The tests below verify that the upsert payload contains no currency/price fields
     * (as per the schema: UserSubscriptionRenewal has no currency column).
     */
    it('upsert create payload contains only userId, entryId, renewalDate, source', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2025-03-01' }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const firstUpsertCall = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls[0][0];
      expect(firstUpsertCall.create).toEqual({
        userId: 'user-1',
        entryId: 'entry-1',
        renewalDate: d('2025-03-01T00:00:00Z'),
        source: 'backfill',
      });
      // update is a no-op for idempotency
      expect(firstUpsertCall.update).toEqual({});
    });

    it('upsert where clause uses entryId_renewalDate composite key', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2025-03-01' }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const firstUpsertCall = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls[0][0];
      expect(firstUpsertCall.where).toEqual({
        entryId_renewalDate: {
          entryId: 'entry-1',
          renewalDate: d('2025-03-01T00:00:00Z'),
        },
      });
    });
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  describe('idempotency', () => {
    it('calls $transaction with all upserts (upsert update={} is a no-op when record exists)', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2025-01-01' }),
      );
      // Simulate $transaction resolving even when records already exist
      (prisma.$transaction as jest.Mock).mockResolvedValueOnce([{}, {}, {}]);

      await backfillRenewalHistory(prisma, 'entry-1');

      // 3 upsert calls built (Jan, Feb, Mar 2025) — $transaction called once with array of 3
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const txArg = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(txArg)).toBe(true);
      expect(txArg).toHaveLength(3);
    });

    it('is safe to call multiple times with same entryId — no error thrown', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
        makeEntry({ startDate: '2025-01-01' }),
      );
      (prisma.$transaction as jest.Mock).mockResolvedValue([]);

      // Two back-to-back calls
      await expect(backfillRenewalHistory(prisma, 'entry-1')).resolves.toBeUndefined();
      await expect(backfillRenewalHistory(prisma, 'entry-1')).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });

  // ── Transaction structure ─────────────────────────────────────────────────

  describe('transaction structure', () => {
    it('calls $transaction with an array (batch transaction) not a callback', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2025-01-01' }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txArg = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(txArg)).toBe(true);
    });

    it('uses userId from entry in every upsert create payload', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({ userId: 'user-42', startDate: '2025-01-01' }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const upsertCalls = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls;
      for (const call of upsertCalls) {
        expect((call[0].create as { userId: string }).userId).toBe('user-42');
      }
    });
  });

  // ── Bundle subscription with renewalMonthOffset ───────────────────────────
  //
  // When renewalMonthOffset > 0, skip records are stored as BOX months.
  // backfillRenewalHistory calls renewalMonthFromBoxMonth(year, month, -offset)
  // to convert each skip record to its renewal month before passing to
  // computePastRenewalDates.
  //
  // 2-month bundle (intervalMonths=2, startingMonth=1), offset=1:
  //   Renewal months: Jan, Mar, May, Jul, Sep, Nov ...
  //   Box months shift by +1:  first box of Jan bundle = Feb,
  //                            first box of Mar bundle = Apr, etc.
  //
  // startDate=2025-01-01, now=2025-04-01 → past renewal months: Jan 1, Mar 1 = 2 dates

  describe('bundle subscription with renewalMonthOffset', () => {
    it('skip on FIRST box month of Jan bundle (box Feb, offset=1) → Jan renewal excluded → 1 date (Mar only)', async () => {
      // Box Feb 2025 → renewalMonthFromBoxMonth(2025, 2, 1) = {2025, 1} = Jan renewal
      // Skip record stored as month={ year:2025, month:2 } (box month)
      // backfillRenewalHistory converts it to Jan 2025 → Jan renewal excluded
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2025-01-01',
          skipRecords: [{ month: { year: 2025, month: 2 } }], // box Feb → renewal Jan
          subscription: { renewalDay: 1, intervalMonths: 2, startingMonth: 1, renewalMonthOffset: 1 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(1); // only Mar 2025

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).not.toContain('2025-01-01T00:00:00.000Z'); // Jan renewal excluded
      expect(upsertedDates).toContain('2025-03-01T00:00:00.000Z'); // Mar renewal still present
    });

    it('skip on SECOND box month of Jan bundle (box Mar, offset=1) → converted renewal Feb (non-aligned) → no effect → 2 dates', async () => {
      // Box Mar 2025 → renewalMonthFromBoxMonth(2025, 3, 1) = {2025, 2} = Feb renewal
      // Feb is not a renewal month (offset=(2-1)%12=1, 1%2=1 → not aligned)
      // → skip has no effect; Jan and Mar 2025 both present
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2025-01-01',
          skipRecords: [{ month: { year: 2025, month: 3 } }], // box Mar → renewal Feb (non-aligned)
          subscription: { renewalDay: 1, intervalMonths: 2, startingMonth: 1, renewalMonthOffset: 1 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(2); // Jan + Mar 2025

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).toContain('2025-01-01T00:00:00.000Z'); // Jan NOT excluded
      expect(upsertedDates).toContain('2025-03-01T00:00:00.000Z'); // Mar also present
    });

    it('3-month bundle with offset=2: skip first box month of Jan quarter (box Mar, offset=2) → Jan renewal excluded', async () => {
      // 3-month bundle (startingMonth=1, offset=2): renewal Jan → boxes are Mar,Apr,May
      // Box Mar 2025 → renewalMonthFromBoxMonth(2025, 3, 2) = {2025, 1} = Jan renewal
      // startDate=2025-01-01, now=2025-04-01, intervalMonths=3, startingMonth=1
      // Past renewal months: Jan 2025 only (Apr 2025 >= now)
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2025-01-01',
          skipRecords: [{ month: { year: 2025, month: 3 } }], // box Mar → renewal Jan
          subscription: { renewalDay: 1, intervalMonths: 3, startingMonth: 1, renewalMonthOffset: 2 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      // Jan 2025 was the only past renewal, and it was skipped → $transaction NOT called
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('3-month bundle with offset=2: skip second box month (box Apr, offset=2) → converted renewal Feb (non-aligned) → no effect', async () => {
      // Box Apr 2025 → renewalMonthFromBoxMonth(2025, 4, 2) = {2025, 2} = Feb renewal
      // Feb offset=(2-1)%12=1, 1%3=1 → not aligned → no effect
      // Jan 2025 renewal still present
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2025-01-01',
          skipRecords: [{ month: { year: 2025, month: 4 } }], // box Apr → renewal Feb (non-aligned)
          subscription: { renewalDay: 1, intervalMonths: 3, startingMonth: 1, renewalMonthOffset: 2 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(1); // Jan 2025 present

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).toContain('2025-01-01T00:00:00.000Z'); // Jan NOT excluded
    });

    it('longer history with offset=1: 2-month bundle, startDate=2024-01-01, 2 skips on first box months → 6 dates out of 8', async () => {
      // Aligned renewals Jan 2024 – Mar 2025: Jan,Mar,May,Jul,Sep,Nov 2024; Jan,Mar 2025 = 8 dates
      // Skip first box of Mar 2024 bundle (box Apr 2024) → renewal Mar 2024 excluded
      // Skip first box of Sep 2024 bundle (box Oct 2024) → renewal Sep 2024 excluded
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2024-01-01',
          skipRecords: [
            { month: { year: 2024, month: 4 } },  // box Apr → renewal Mar 2024
            { month: { year: 2024, month: 10 } }, // box Oct → renewal Sep 2024
          ],
          subscription: { renewalDay: 1, intervalMonths: 2, startingMonth: 1, renewalMonthOffset: 1 },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const txCall = (prisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
      expect(txCall).toHaveLength(6); // 8 - 2

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );
      expect(upsertedDates).not.toContain('2024-03-01T00:00:00.000Z'); // Mar excluded
      expect(upsertedDates).not.toContain('2024-09-01T00:00:00.000Z'); // Sep excluded
      expect(upsertedDates).toContain('2024-01-01T00:00:00.000Z'); // Jan still present
      expect(upsertedDates).toContain('2025-03-01T00:00:00.000Z'); // Mar 2025 still present
    });
  });

  // ── Settings-history-aware renewalDay resolution ──────────────────────────
  //
  // backfillRenewalHistory fetches settingsHistory from the subscription and
  // uses resolveEffectiveSettings per-month to pick the correct renewalDay.
  //
  // Pattern: sentinel record at epoch holds the OLD settings; a newer record
  // marks when the new settings became effective. Months before the new record
  // use old settings; months on/after use new settings.

  describe('settings-history-aware renewalDay resolution', () => {
    function makeSettingsRecord(
      effectiveFrom: Date,
      overrides: Partial<SettingsHistoryRecord> = {},
    ): SettingsHistoryRecord {
      return {
        effectiveFrom,
        renewalDay: 1,
        renewalDayUserSet: false,
        paymentOnStartup: false,
        signupIncludesCurrentMonth: false,
        renewalMonthOffset: 0,
        ...overrides,
      };
    }

    it('uses old renewalDay before effectiveFrom and new renewalDay on/after effectiveFrom', async () => {
      // Subscription history:
      //   - epoch (new Date(0)):    renewalDay=1,  renewalDayUserSet=false
      //   - 2024-01-01:             renewalDay=15, renewalDayUserSet=false
      //
      // Entry startDate=2023-10-01, renewalDay=null (not user-set mode)
      // now=2025-04-01
      //
      // Expected dates:
      //   Oct 1, Nov 1, Dec 1, 2023        (old settings, day=1)
      //   Jan 15 2024 … Mar 15 2025        (new settings, day=15) = 15 months
      //   Total: 18 dates
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2023-10-01',
          renewalDay: null,
          subscription: {
            renewalDay: 15,       // current fallback (used when history is empty)
            renewalDayUserSet: false,
            settingsHistory: [
              makeSettingsRecord(new Date(0), { renewalDay: 1 }),
              makeSettingsRecord(new Date('2024-01-01'), { renewalDay: 15 }),
            ],
          },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );

      expect(upsertedDates).toHaveLength(18);

      // Pre-change months use day=1
      expect(upsertedDates).toContain('2023-10-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2023-11-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2023-12-01T00:00:00.000Z');

      // Pre-change months do NOT have day=15 dates
      expect(upsertedDates).not.toContain('2023-10-15T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2023-12-15T00:00:00.000Z');

      // Post-change months use day=15
      expect(upsertedDates).toContain('2024-01-15T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-06-15T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-03-15T00:00:00.000Z');

      // Post-change months do NOT have day=1 dates
      expect(upsertedDates).not.toContain('2024-01-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2025-03-01T00:00:00.000Z');
    });

    it('switches from fixed-day mode to user-date mode mid-history', async () => {
      // Subscription history:
      //   - epoch: renewalDay=1, renewalDayUserSet=false  (subscription fixed day)
      //   - 2024-01-01: renewalDay=null, renewalDayUserSet=true (user-date mode)
      //
      // Entry startDate=2023-10-01, renewalDay=10
      //
      // Pre-2024: uses subscription day=1 (fixed-day mode)
      // From 2024: uses entry.renewalDay=10 (user-date mode)
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2023-10-01',
          renewalDay: 10,
          subscription: {
            renewalDay: 1,
            renewalDayUserSet: true, // current fallback (user-date mode is now active)
            settingsHistory: [
              makeSettingsRecord(new Date(0), { renewalDay: 1, renewalDayUserSet: false }),
              makeSettingsRecord(new Date('2024-01-01'), { renewalDay: null, renewalDayUserSet: true }),
            ],
          },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );

      expect(upsertedDates).toHaveLength(18); // same count as before

      // Pre-change months: day=1 (fixed-day mode)
      expect(upsertedDates).toContain('2023-10-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2023-11-01T00:00:00.000Z');
      expect(upsertedDates).toContain('2023-12-01T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2023-10-10T00:00:00.000Z');

      // Post-change months: day=10 (user-date mode, entry.renewalDay=10)
      expect(upsertedDates).toContain('2024-01-10T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-06-10T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-03-10T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2024-01-01T00:00:00.000Z');
    });

    it('uses fallback settings when no history record precedes the target month', async () => {
      // History only has a record from 2025-01-01; months before that use fallback
      // Entry startDate=2024-11-01, renewalDay=null
      // Fallback: renewalDay=5, renewalDayUserSet=false
      //
      // Nov 2024, Dec 2024: no history record precedes → use fallback (day=5)
      // Jan 2025, Feb 2025, Mar 2025: history record effective Jan 1 2025 → day=20
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2024-11-01',
          renewalDay: null,
          subscription: {
            renewalDay: 5,         // fallback
            renewalDayUserSet: false,
            settingsHistory: [
              makeSettingsRecord(new Date('2025-01-01'), { renewalDay: 20, renewalDayUserSet: false }),
            ],
          },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );

      expect(upsertedDates).toHaveLength(5);

      // Pre-history months use fallback day=5
      expect(upsertedDates).toContain('2024-11-05T00:00:00.000Z');
      expect(upsertedDates).toContain('2024-12-05T00:00:00.000Z');

      // Post-history months use settings day=20
      expect(upsertedDates).toContain('2025-01-20T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-02-20T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-03-20T00:00:00.000Z');
    });

    it('user-date mode (renewalDayUserSet=true) throughout entire history uses entry.renewalDay for all months', async () => {
      // All history records have renewalDayUserSet=true
      // Entry renewalDay=7 → all dates should be on the 7th
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(
        makeEntry({
          startDate: '2025-01-01',
          renewalDay: 7,
          subscription: {
            renewalDay: 1,
            renewalDayUserSet: true,
            settingsHistory: [
              makeSettingsRecord(new Date(0), { renewalDay: null, renewalDayUserSet: true }),
            ],
          },
        }),
      );

      await backfillRenewalHistory(prisma, 'entry-1');

      const upsertedDates = (prisma.userSubscriptionRenewal.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0].create as { renewalDate: Date }).renewalDate.toISOString(),
      );

      expect(upsertedDates).toHaveLength(3); // Jan 7, Feb 7, Mar 7 2025
      expect(upsertedDates).toContain('2025-01-07T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-02-07T00:00:00.000Z');
      expect(upsertedDates).toContain('2025-03-07T00:00:00.000Z');
      expect(upsertedDates).not.toContain('2025-01-01T00:00:00.000Z');
    });
  });
});
