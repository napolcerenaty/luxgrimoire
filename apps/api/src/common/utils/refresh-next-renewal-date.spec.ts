/**
 * Unit tests for refreshNextRenewalDate.
 *
 * Focuses on the renewalDay resolution logic:
 *  - renewalDayUserSet=false → use subscription's fixed renewalDay (from effectiveSettings)
 *  - renewalDayUserSet=true  → use entry's own renewalDay
 *  - settings history is respected (most-recent applicable record wins)
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
    renewalDay: 20,              // user's own day (used when renewalDayUserSet=true)
    prepaidMonths: 1,
    scheduledPrepayOptionId: null,
    scheduledPrepayOption: null,
    skipRecords: [],
    subscription: null,
    ...overrides,
  };
}

function makeSubscription(overrides: Partial<{
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
    // Default: update succeeds
    (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValue({});
  });

  it('fixed date mode (renewalDayUserSet=false): uses subscription renewalDay, ignores entry renewalDay', async () => {
    // Sub has fixed day 1, entry has day 20 (user's own day)
    // With fixed mode → renewal should land on day 1 (Jul 1 2025)
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        renewalDay: 20,
        subscription: makeSubscription({ renewalDay: 1, renewalDayUserSet: false }),
      }),
    );

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 6, 1)) }, // Jul 1 2025
    });
  });

  it('user-date mode (renewalDayUserSet=true): uses entry renewalDay, ignores subscription renewalDay', async () => {
    // Sub has day 1 as fallback, but renewalDayUserSet=true → use entry day 20
    // now = Jun 15, day 20 is still upcoming this month → Jun 20 2025
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        renewalDay: 20,
        subscription: makeSubscription({ renewalDay: 1, renewalDayUserSet: true }),
      }),
    );

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 5, 20)) }, // Jun 20 2025
    });
  });

  it('user-date mode: falls back to day 1 when entry.renewalDay is null', async () => {
    // Entry has no renewalDay set (null) — should default to 1
    // now = Jun 15, day 1 already passed this month → Jul 1 2025
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        renewalDay: null,
        subscription: makeSubscription({ renewalDay: 15, renewalDayUserSet: true }),
      }),
    );

    await refreshNextRenewalDate(prisma, 'entry-1');

    expect(prisma.userSubscriptionEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { nextRenewalDate: new Date(Date.UTC(2025, 6, 1)) }, // Jul 1 2025
    });
  });

  it('settings history: most recent record before current month wins over subscription defaults', async () => {
    // Sub currently shows renewalDay=1, but history says: from Jan 2025 → renewalDay=10
    // Effective for Jun 2025 → day 10 (fixed mode)
    // Jun 10 already passed (now=Jun 15) → Jul 10 2025
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        renewalDay: 20, // entry's own day — ignored in fixed mode
        subscription: makeSubscription({
          renewalDay: 1,         // current sub default
          renewalDayUserSet: false,
          settingsHistory: [
            {
              effectiveFrom: new Date('2025-01-01'),
              renewalDay: 10,
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
      data: { nextRenewalDate: new Date(Date.UTC(2025, 6, 10)) }, // Jul 10 2025
    });
  });

  it('settings history: switch from user-date to fixed-date picks up new fixed day', async () => {
    // History: from May 2025 → renewalDayUserSet=false, renewalDay=5
    // Previously was user-date (entry.renewalDay=20). Now fixed mode → day 5.
    // Jun 5 already passed (now=Jun 15) → Jul 5 2025
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        renewalDay: 20,
        subscription: makeSubscription({
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
              effectiveFrom: new Date('2025-05-01'),
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
      data: { nextRenewalDate: new Date(Date.UTC(2025, 6, 5)) }, // Jul 5 2025
    });
  });

  it('settings history: switch from fixed-date to user-date uses entry renewalDay', async () => {
    // History: until Apr 2025 was fixed day 1; from Jun 2025 → userSet=true
    // Entry has renewalDay=20; now=Jun 15 → Jun 20 2025
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        renewalDay: 20,
        subscription: makeSubscription({
          renewalDay: null,
          renewalDayUserSet: true,
          settingsHistory: [
            {
              effectiveFrom: new Date('2024-01-01'),
              renewalDay: 1,
              renewalDayUserSet: false,
              paymentOnStartup: false,
              signupIncludesCurrentMonth: false,
              renewalMonthOffset: 0,
            },
            {
              effectiveFrom: new Date('2025-06-01'),
              renewalDay: null,
              renewalDayUserSet: true,
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
      data: { nextRenewalDate: new Date(Date.UTC(2025, 5, 20)) }, // Jun 20 2025
    });
  });

  it('inactive entry: sets nextRenewalDate to null regardless of renewal mode', async () => {
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
      makeEntry({
        active: false,
        subscription: makeSubscription({ renewalDayUserSet: false }),
      }),
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
