/**
 * Unit tests for refreshNextRenewalDate.
 *
 * Key behaviours tested:
 *  1. renewalDayUserSet=false → fixed day from settings (history-aware)
 *  2. renewalDayUserSet=true  → entry's own renewalDay
 *  3. Two-step resolution: settings resolved for the TARGET MONTH of the next
 *     renewal (not for the current calendar month) — so calling refreshNextRenewalDate
 *     right after processing a same-day renewal still picks up future-month settings.
 *  4. Filter semantics: the function always refreshes; the caller decides which
 *     entries to pass (tested indirectly via "called after same-month renewal").
 *
 * Fixed "now": 2025-06-15T12:00:00Z
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { refreshNextRenewalDate } from './renewal-date.util';

const FIXED_NOW = new Date('2025-06-15T12:00:00Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<{
  id: string;
  active: boolean;
  startDate: string;
  renewalDay: number | null;
  prepaidMonths: number;
  scheduledPrepayOptionId: string | null;
  scheduledPrepayOption: { months: number } | null;
  skipRecords: any[];
  subscription: any;
}> = {}) {
  return {
    id: 'entry-1',
    active: true,
    startDate: '2024-01-15',
    renewalDay: 20,              // entry's own sign-up day (used when renewalDayUserSet=true)
    prepaidMonths: 1,
    scheduledPrepayOptionId: null,
    scheduledPrepayOption: null,
    skipRecords: [],
    subscription: null,
    ...overrides,
  };
}

function makeSub(overrides: Partial<{
  id: string;
  renewalDay: number | null;
  renewalDayUserSet: boolean;
  intervalMonths: number;
  startingMonth: number | null;
  paymentOnStartup: boolean;
  renewalMonthOffset: number;
  signupIncludesCurrentMonth: boolean;
  settingsHistory: any[];
}> = {}) {
  return {
    id: 'sub-1',
    renewalDay: 1,               // fixed day on the subscription
    renewalDayUserSet: false,
    intervalMonths: 1,
    startingMonth: null,
    paymentOnStartup: false,
    renewalMonthOffset: 0,
    signupIncludesCurrentMonth: false,
    settingsHistory: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('refreshNextRenewalDate — renewalDay resolution', () => {
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValue({});
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('fixed mode (renewalDayUserSet=false): uses subscription renewalDay, ignores entry renewalDay', async () => {
    // Sub has fixed day 1, entry has day 20. now=Jun 15, day 1 already passed → Jul 1 2025
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({ renewalDay: 20, subscription: makeSub({ renewalDay: 1, renewalDayUserSet: false }) }),
    );

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 6, 1)) }, // Jul 1
    });
  });

  it('user-date mode (renewalDayUserSet=true): uses entry renewalDay, ignores subscription renewalDay', async () => {
    // Sub has day 1 fallback, but renewalDayUserSet=true → use entry day 20
    // now=Jun 15, day 20 is upcoming → Jun 20 2025
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({ renewalDay: 20, subscription: makeSub({ renewalDay: 1, renewalDayUserSet: true }) }),
    );

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 5, 20)) }, // Jun 20
    });
  });

  it('user-date mode: falls back to day 1 when entry.renewalDay is null', async () => {
    // entry.renewalDay=null → default to 1; day 1 passed in June → Jul 1
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({ renewalDay: null, subscription: makeSub({ renewalDay: 15, renewalDayUserSet: true }) }),
    );

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 6, 1)) }, // Jul 1
    });
  });

  it('settings history: most-recent applicable record wins over subscription defaults', async () => {
    // Sub default: renewalDay=1. History from Jan 2025: renewalDay=10.
    // Rough candidate uses base (day 1) → Jul 2025. Resolve for Jul → history record applies → day 10.
    // Jun 10 already passed, so computeNextRenewalDate(10,...) → Jul 10 2025
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        renewalDay: 20,
        subscription: makeSub({
          renewalDay: 1,
          renewalDayUserSet: false,
          settingsHistory: [{
            effectiveFrom: new Date('2025-01-01'),
            renewalDay: 10,
            renewalDayUserSet: false,
            paymentOnStartup: false,
            signupIncludesCurrentMonth: false,
            renewalMonthOffset: 0,
          }],
        }),
      }),
    );

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 6, 10)) }, // Jul 10
    });
  });

  // ── TWO-STEP resolution tests ─────────────────────────────────────────────

  it('two-step: when called right after same-day renewal, resolves for NEXT month and picks up future settings', async () => {
    // Scenario: now = Jun 18 (renewal just processed on Jun 18).
    // Sub base: renewalDay=1. History from Jul 1: renewalDay=15 (effectiveFrom = 2025-07-01).
    // Step 1: rough candidate with base (day 1): Jul 1 (Jun 1 already passed).
    // Step 2: resolve for July → history record (Jul 1) applies → renewalDay=15.
    // Final: computeNextRenewalDate(15,...) from Jun 18 → Jul 15 2025.
    // (Without 2-step, would resolve for June → old settings → Jul 1, then cron processes
    //  Jul 1, THEN sets Jul 15, giving two renewals in July ❌)
    jest.setSystemTime(new Date('2025-06-18T14:00:00Z'));

    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        renewalDay: 20,
        subscription: makeSub({
          renewalDay: 1,
          renewalDayUserSet: false,
          settingsHistory: [{
            effectiveFrom: new Date('2025-07-01'),
            renewalDay: 15,
            renewalDayUserSet: false,
            paymentOnStartup: false,
            signupIncludesCurrentMonth: false,
            renewalMonthOffset: 0,
          }],
        }),
      }),
    );

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 6, 15)) }, // Jul 15 ✓
    });
  });

  it('two-step: upcoming renewal this month — still resolves for this month', async () => {
    // now=Jun 15, renewalDay=20 (day 20 still upcoming in June).
    // Rough candidate = Jun 20 → resolve for June.
    // History from Jul 1 (future) → NOT applicable for June → old settings → renewalDay=1.
    // But wait: sub fixed day=20, no history applicable → Jun 20 2025.
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        renewalDay: 5,
        subscription: makeSub({
          renewalDay: 20,
          renewalDayUserSet: false,
          settingsHistory: [{
            effectiveFrom: new Date('2025-07-01'),
            renewalDay: 10,
            renewalDayUserSet: false,
            paymentOnStartup: false,
            signupIncludesCurrentMonth: false,
            renewalMonthOffset: 0,
          }],
        }),
      }),
    );

    await refreshNextRenewalDate(prisma, 'entry-1');

    // Rough candidate = Jun 20 (day 20 not yet passed); resolve for Jun → no applicable history
    // (Jul 1 > Jun 30) → base settings → renewalDay=20 → Jun 20 2025
    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 5, 20)) }, // Jun 20
    });
  });

  it('switch from user-date to fixed-date: picks up new fixed day via two-step', async () => {
    // History: from Jun 2025 → renewalDayUserSet=false, renewalDay=5.
    // entry.renewalDay=20. Base (current sub) says renewalDayUserSet=false, renewalDay=5.
    // Rough candidate: computeNextRenewalDate(5,...) from Jun 15 → Jun 5 passed → Jul 5.
    // Resolve for Jul → history from Jun 2025 applies → renewalDay=5, userSet=false → Jul 5 2025.
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        renewalDay: 20,
        subscription: makeSub({
          renewalDay: 5,
          renewalDayUserSet: false,
          settingsHistory: [
            {
              effectiveFrom: new Date('2024-01-01'),
              renewalDay: null,
              renewalDayUserSet: true,
              paymentOnStartup: false,
              signupIncludesCurrentMonth: false,
              renewalMonthOffset: 0,
            },
            {
              effectiveFrom: new Date('2025-06-01'),
              renewalDay: 5,
              renewalDayUserSet: false,
              paymentOnStartup: false,
              signupIncludesCurrentMonth: false,
              renewalMonthOffset: 0,
            },
          ],
        }),
      }),
    );

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 6, 5)) }, // Jul 5
    });
  });

  it('inactive entry: sets nextRenewalDate to null regardless of renewal mode', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({ active: false, subscription: makeSub() }),
    );

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: null },
    });
  });

  it('entry not found: returns without error', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(refreshNextRenewalDate(prisma, 'entry-missing')).resolves.toBeUndefined();
    expect(prisma.userSubscriptionEntry.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// paymentOnStartup — paidUpFrontDate first-eligible month computation
//
// Bug: the old code used `renewalPassedThisMonth = !signupIncludesCurrentMonth && renewalDay < joinDay`
// which is always false when signupIncludesCurrentMonth=true, causing firstEligibleMonth=joinMonth.
// For a bimonthly sub (odd months) this found July instead of May as the "already paid" box,
// making computeNextRenewalDate skip July → returned September instead of July 15.
//
// Fix: mirror getEligibleMonths — renewalAlreadyHappened = joinDay >= renewalDay.
// If not happened: lastBillingMonth = joinMonth - 1.
// If signupIncludesCurrentMonth=false: firstEligibleMonth = lastBillingMonth + 1.
// ---------------------------------------------------------------------------

describe('refreshNextRenewalDate — paymentOnStartup paidUpFrontDate regression', () => {
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValue({});
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([]);
  });

  // ── Exact Enchantasy regression ────────────────────────────────────────────
  // bimonthly, renewalDay=15, signupIncludesCurrentMonth=true, paymentOnStartup=true
  // startDate=01.06.2026, now=13.07.2026
  // joinDay=1 < renewalDay=15 → renewal NOT happened → lastBillingMonth=May
  // firstEligibleMonth=May → DB finds May → paidUpFrontDate=May 15
  // computeNextRenewalDate skips May (already in past), July 15 > now(Jul 13) → returns Jul 15 ✓
  // (buggy code: firstEligibleMonth=June → DB finds July → paidUpFrontDate=Jul 15 → skips July → Sep 15 ✗)

  it('bimonthly regression: joinDay=1 < renewalDay=15, includes=true → next renewal is Jul 15, not Sep 15', async () => {
    jest.setSystemTime(new Date('2026-07-13T10:00:00Z'));

    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        startDate: '2026-06-01',
        renewalDay: null,  // null because sub has fixed renewalDay (not user-set)
        subscription: {
          ...makeSub({
            renewalDay: 15,
            renewalDayUserSet: false,
            intervalMonths: 2,
            startingMonth: 7,   // bimonthly aligned to odd months (Jul, Sep, Nov...)
            paymentOnStartup: true,
            signupIncludesCurrentMonth: true,
            renewalMonthOffset: 0,
          }),
          id: 'sub-enchantasy',
          startDate: '2024-07-01',
        },
      }),
    );
    // DB returns May 2026 (the correct first box month for joinDay=1, renewalDay=15)
    (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue({ year: 2026, month: 5 });

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2026, 6, 15)) }, // Jul 15 ✓
    });
  });

  // ── Monthly, joinDay < renewalDay, signupIncludesCurrentMonth=true ─────────
  // startDate=01.07.2025, renewalDay=15, now=13.07.2025
  // joinDay=1 < 15 → lastBillingMonth=June → firstEligibleMonth=June
  // DB returns June → paidUpFrontDate=Jun 15 → computeNextRenewalDate skips June
  // July 15 > now(Jul 13) → returns Jul 15

  it('monthly: joinDay=1 < renewalDay=15, includes=true → next renewal is Jul 15', async () => {
    jest.setSystemTime(new Date('2025-07-13T10:00:00Z'));

    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        startDate: '2025-07-01',
        renewalDay: null,
        subscription: {
          ...makeSub({
            renewalDay: 15,
            renewalDayUserSet: false,
            intervalMonths: 1,
            startingMonth: null,
            paymentOnStartup: true,
            signupIncludesCurrentMonth: true,
            renewalMonthOffset: 0,
          }),
          id: 'sub-1',
          startDate: null,
        },
      }),
    );
    // DB returns June 2025 — the correct first eligible box month (May billing → June as first = no, wait:
    // joinDay=1 < 15 → lastBillingMonth=June (Jul-1). firstEligibleMonth=June. DB returns June.
    (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue({ year: 2025, month: 6 });

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 6, 15)) }, // Jul 15
    });
  });

  // ── Monthly, joinDay > renewalDay, signupIncludesCurrentMonth=true ─────────
  // startDate=20.07.2025, renewalDay=15, now=21.07.2025
  // joinDay=20 >= 15 → renewalAlreadyHappened → lastBillingMonth=July → firstEligibleMonth=July
  // DB returns July → paidUpFrontDate=Jul 15 → skip July → next renewal = Aug 15

  it('monthly: joinDay=20 >= renewalDay=15, includes=true → next renewal is Aug 15', async () => {
    jest.setSystemTime(new Date('2025-07-21T10:00:00Z'));

    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        startDate: '2025-07-20',
        renewalDay: null,
        subscription: {
          ...makeSub({
            renewalDay: 15,
            renewalDayUserSet: false,
            intervalMonths: 1,
            startingMonth: null,
            paymentOnStartup: true,
            signupIncludesCurrentMonth: true,
            renewalMonthOffset: 0,
          }),
          id: 'sub-1',
          startDate: null,
        },
      }),
    );
    // DB returns July 2025 (joinDay=20 >= 15 → lastBillingMonth=July)
    (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue({ year: 2025, month: 7 });

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 7, 15)) }, // Aug 15
    });
  });

  // ── Monthly, joinDay < renewalDay, signupIncludesCurrentMonth=false ────────
  // startDate=01.07.2025, renewalDay=15, now=13.07.2025
  // joinDay=1 < 15 → lastBillingMonth=June. !includes → firstEligibleMonth=July
  // DB returns July → paidUpFrontDate=Jul 15 → skip July → next renewal = Aug 15

  it('monthly: joinDay=1 < renewalDay=15, includes=false → next renewal is Aug 15', async () => {
    jest.setSystemTime(new Date('2025-07-13T10:00:00Z'));

    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        startDate: '2025-07-01',
        renewalDay: null,
        subscription: {
          ...makeSub({
            renewalDay: 15,
            renewalDayUserSet: false,
            intervalMonths: 1,
            startingMonth: null,
            paymentOnStartup: true,
            signupIncludesCurrentMonth: false,
            renewalMonthOffset: 0,
          }),
          id: 'sub-1',
          startDate: null,
        },
      }),
    );
    // DB returns July 2025 (lastBillingMonth=June, !includes → +1 = July)
    (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue({ year: 2025, month: 7 });

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 7, 15)) }, // Aug 15
    });
  });

  // ── Year boundary: joinDay < renewalDay, join Jan 1 ───────────────────────
  // startDate=01.01.2026, renewalDay=15, now=13.01.2026
  // joinDay=1 < 15 → lastBillingMonth=Dec 2025 → firstEligibleMonth=Dec 2025
  // DB returns Dec 2025 → paidUpFrontDate=Dec 15, 2025 (past) → skip Dec
  // Jan 15 2026 > now(Jan 13) → next renewal = Jan 15 2026

  it('year boundary: joinDay=1 < renewalDay=15, join Jan 1, includes=true → next renewal is Jan 15', async () => {
    jest.setSystemTime(new Date('2026-01-13T10:00:00Z'));

    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        startDate: '2026-01-01',
        renewalDay: null,
        subscription: {
          ...makeSub({
            renewalDay: 15,
            renewalDayUserSet: false,
            intervalMonths: 1,
            startingMonth: null,
            paymentOnStartup: true,
            signupIncludesCurrentMonth: true,
            renewalMonthOffset: 0,
          }),
          id: 'sub-1',
          startDate: null,
        },
      }),
    );
    // DB returns Dec 2025 (year wraps back: Jan-1 = Dec 2025)
    (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue({ year: 2025, month: 12 });

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2026, 0, 15)) }, // Jan 15 2026
    });
  });
});

// ---------------------------------------------------------------------------
// Company-wide month skip (SubscriptionMonthSkip) — merged alongside the
// entry's own personal skipRecords, never replacing them.
// Fixed "now" (module-level): 2025-06-15T12:00:00Z. Default sub: renewalDay=1,
// offset=0, no skips → next renewal is Jul 1 2025 (day 1 already passed in June).
// ---------------------------------------------------------------------------

describe('refreshNextRenewalDate — company-wide month skip', () => {
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValue({});
  });

  it('company-wide skip alone shifts the renewal forward one month', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({ subscription: makeSub() }),
    );
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([{ year: 2025, month: 7 }]);

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 7, 1)) }, // Aug 1 (Jul skipped)
    });
  });

  it('a company skip and an overlapping personal skip in the same month do not double-shift', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        subscription: makeSub(),
        skipRecords: [{ month: { year: 2025, month: 7 } }],
      }),
    );
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([{ year: 2025, month: 7 }]);

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 7, 1)) }, // still Aug 1, not Sep
    });
  });

  it('a company skip and a personal skip in different months both apply', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        subscription: makeSub(),
        skipRecords: [{ month: { year: 2025, month: 8 } }],
      }),
    );
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([{ year: 2025, month: 7 }]);

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 8, 1)) }, // Sep 1 — both Jul & Aug skipped
    });
  });

  it('a newly-joined entry still correctly skips a month that was already company-skipped before it joined', async () => {
    // Joins Jun 20, just before the already-skipped Jul — proves the company skip isn't
    // something only pre-existing entries pick up; a brand-new join respects it too, since
    // refreshNextRenewalDate always reads the current skip rows fresh, not a snapshot from join time.
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({ startDate: '2025-06-20', skipRecords: [], subscription: makeSub() }),
    );
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([{ year: 2025, month: 7 }]);

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 7, 1)) }, // Aug 1, not Jul
    });
  });

  it('looks up company skips by the entry\'s own subscriptionId, no parent/variant resolution', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({ subscription: makeSub({ id: 'sub-42' }) }),
    );
    (prisma.subscriptionMonthSkip.findMany as jest.Mock).mockResolvedValue([]);

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.subscriptionMonthSkip.findMany).toHaveBeenCalledWith({
      where: { subscriptionId: 'sub-42', undoneAt: null },
      select: { year: true, month: true },
    });
  });
});
