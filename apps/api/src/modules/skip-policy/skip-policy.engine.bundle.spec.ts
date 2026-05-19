/**
 * Tests for bundle subscription skip recording in SkipPolicyEngine.
 *
 * Business rule (bundle skip semantics):
 *   - A "bundle" subscription ships multiple months as ONE package.
 *   - Skipping a bundle = skipping the ENTIRE next package (N months).
 *   - This counts as exactly 1 skip (regardless of intervalMonths).
 *   - The skip is recorded on the FIRST BOX MONTH of the bundle window.
 *   - offset=0: first box month = renewal month (April for Q2 when startingMonth=1)
 *   - offset>0: first box month = renewal month + offset (May for April renewal, offset=1)
 *
 * Example (CALENDAR_YEAR, maxSkips=2, quarterly bundle starting Jan, offset=0):
 *   now = Feb 15 2025 (in Q1 = Jan-Mar)
 *   → target to skip = April 2025 (Q2 start, the next bundle)
 *   → recordSkip(2025, 4): creates 1 skip record, skipsInWindow=1
 *   → next renewal = July 2025 (Q3)
 *   → skip Q3 (July): skipsInWindow=2, canSkip=false (limit reached)
 *   → 2 bundles skipped = 2 skips (NOT 6 months = 2 skips)
 *
 * Verification:
 *   - recordSkip creates exactly 1 userSkipRecord (not intervalMonths records)
 *   - skipsInWindow increments by 1 per bundle skip
 *   - refreshNextRenewalDate converts box month to renewal month correctly
 *   - getStatus target month = next bundle start (not mid-bundle calendar month)
 */

import { SkipPolicyEngine } from './skip-policy.engine';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Fake time ────────────────────────────────────────────────────────────────

/** Feb 15 2025 — user is inside Q1 bundle (Jan-Mar) */
const FIXED_NOW = new Date('2025-02-15T12:00:00Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makePolicy(type: string, opts: { maxSkips?: number | null; maxConsecutive?: number | null; windowMonths?: number | null; allowUnskip?: boolean } = {}) {
  return {
    type,
    maxSkips: opts.maxSkips ?? null,
    maxConsecutive: opts.maxConsecutive ?? null,
    windowMonths: opts.windowMonths ?? null,
    allowUnskip: opts.allowUnskip ?? false,
    notes: null, skipHow: null, unskipHow: null, unskipNotes: null,
    skipDeadlineDaysBefore: 3,
    unskipDeadlineDaysBefore: 0,
    eligibleBillingTypes: null,
  };
}

/** Minimal subscription object for a quarterly bundle (intervalMonths=3, startingMonth=1) */
function makeQuarterlyBundleSubscription(overrides: {
  renewalMonthOffset?: number;
  startingMonth?: number;
  intervalMonths?: number;
  policy?: ReturnType<typeof makePolicy> | null;
  skipRecords?: Array<{ id: string; month: { year: number; month: number }; windowKey?: string; series: null }>;
} = {}) {
  const policy = overrides.policy !== undefined ? overrides.policy : makePolicy('CALENDAR_YEAR', { maxSkips: 2 });
  return {
    id: 'sub-1',
    slug: 'test-bundle-sub',
    renewalDay: 1,
    renewalMonthOffset: overrides.renewalMonthOffset ?? 0,
    intervalMonths: overrides.intervalMonths ?? 3,
    startingMonth: overrides.startingMonth ?? 1,
    isBundleSubscription: true,
    isCombo: false,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: false,
    startDate: null,
    skipPolicy: policy,
    comboComponents: [],
    userEntries: [
      {
        id: 'entry-1',
        userId: 'user-1',
        subscriptionId: 'sub-1',
        firstSkipDate: null as Date | null,
        startDate: '2025-01-01',
        renewalDay: null,
        prepaidMonths: 1,
        skipRecords: overrides.skipRecords ?? [],
      },
    ],
  };
}

/** A subscriptionMonth record for the first box month of a bundle */
function makeBundleMonth(year: number, month: number, id?: string) {
  return { id: id ?? `sm-${year}-${month}`, year, month, seriesId: null };
}

/**
 * Builds a Prisma mock for recordSkip on a bundle subscription.
 *
 * recordSkip call sequence:
 *   1. subscription.findUnique             (loadContext)
 *   2. userSubscriptionSkipState.findUnique (loadContext)
 *   3. subscriptionMonth.findUnique        (find target month)
 *   4. subscriptionMonth.findUnique        (computeNewConsecutive: prev month)
 *   5. userSkipRecord.upsert              (create skip record)
 *   6. userSubscriptionSkipState.upsert   (update state)
 *   7. userSubscriptionEntry.update       (firstSkipDate)
 *   8. userSkipRecord.findMany            (fresh skip records)
 *   9. userSubscriptionEntry.findUnique   (refreshNextRenewalDate)
 *  10. userSubscriptionEntry.update       (persist nextRenewalDate)
 *
 * Note: computeNewConsecutive returns 1 when prev month record is null (step 4 → null).
 */
function makePrismaForRecordSkip(opts: {
  subscription: ReturnType<typeof makeQuarterlyBundleSubscription>;
  state: { windowKey: string | null; skipsInWindow: number; consecutiveSkips: number; totalSkips: number } | null;
  targetSubMonth: ReturnType<typeof makeBundleMonth>;
  /** Skip records that refreshNextRenewalDate will see (includes the new skip) */
  freshSkipRecordsForRefresh: Array<{ month: { year: number; month: number } }>;
}): PrismaService {
  const upsertedState = {
    userId: 'user-1',
    subscriptionId: 'sub-1',
    windowKey: String(new Date().getFullYear()),
    skipsInWindow: (opts.state?.windowKey === String(new Date().getFullYear()) ? (opts.state.skipsInWindow + 1) : 1),
    consecutiveSkips: 1,
    totalSkips: (opts.state?.totalSkips ?? 0) + 1,
    lastSkipAt: new Date(),
  };

  const entry = opts.subscription.userEntries[0];
  const sub = opts.subscription;
  const refreshEntry = {
    id: entry.id,
    active: true,
    startDate: entry.startDate,
    renewalDay: entry.renewalDay,
    skipRecords: opts.freshSkipRecordsForRefresh,
    subscription: {
      id: sub.id,
      renewalDay: sub.renewalDay,
      intervalMonths: sub.intervalMonths,
      startingMonth: sub.startingMonth,
      paymentOnStartup: sub.paymentOnStartup,
      renewalMonthOffset: sub.renewalMonthOffset,
      signupIncludesCurrentMonth: sub.signupIncludesCurrentMonth,
    },
  };

  const subscriptionMonthFindUnique = jest.fn()
    .mockResolvedValueOnce(opts.targetSubMonth)  // step 3: target month
    .mockResolvedValueOnce(null);                 // step 4: prev month → null → consecutive=1

  return {
    subscription: {
      findUnique: jest.fn().mockResolvedValue(sub),
    },
    userSubscriptionSkipState: {
      findUnique: jest.fn().mockResolvedValue(opts.state),
      upsert: jest.fn().mockResolvedValue(upsertedState),
    },
    subscriptionMonth: {
      findUnique: subscriptionMonthFindUnique,
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    userSkipRecord: {
      upsert: jest.fn().mockResolvedValue({ id: 'skip-1' }),
      findMany: jest.fn().mockResolvedValue(
        opts.freshSkipRecordsForRefresh.map((r, i) => ({
          id: `skip-${i}`,
          month: r.month,
          series: null,
        })),
      ),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    userSubscriptionEntry: {
      findUnique: jest.fn().mockResolvedValue(refreshEntry), // for refreshNextRenewalDate
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

/** Prisma mock for getStatus */
function makePrismaForGetStatus(opts: {
  subscription: ReturnType<typeof makeQuarterlyBundleSubscription>;
  state: { windowKey: string | null; skipsInWindow: number; consecutiveSkips: number; totalSkips: number } | null;
  /** subscriptionMonth.findMany result — only bundle start months */
  upcomingBundleMonths: ReturnType<typeof makeBundleMonth>[];
}): PrismaService {
  return {
    subscription: {
      findUnique: jest.fn().mockResolvedValue(opts.subscription),
    },
    userSubscriptionSkipState: {
      findUnique: jest.fn().mockResolvedValue(opts.state),
    },
    userSubscriptionEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    userSkipRecord: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    subscriptionMonth: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(opts.upcomingBundleMonths),
    },
  } as unknown as PrismaService;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SkipPolicyEngine — bundle subscription skip recording', () => {
  // =========================================================================
  // getStatus — target month for bundle subscriptions
  // now = Feb 15 2025; user is in Q1 (Jan-Mar); subscriptionMonths = only bundle starts
  // =========================================================================

  describe('getStatus — bundle skip target is next bundle start month', () => {
    it('quarterly bundle (interval=3, startingMonth=1): target is April (Q2) when now=Feb 15', async () => {
      // subscriptionMonths: only bundle start months (April, July, October 2025)
      const sub = makeQuarterlyBundleSubscription();
      const prisma = makePrismaForGetStatus({
        subscription: sub,
        state: null,
        upcomingBundleMonths: [
          makeBundleMonth(2025, 4),  // Q2 start → this is the first upcoming bundle month
          makeBundleMonth(2025, 7),  // Q3 start
          makeBundleMonth(2025, 10), // Q4 start
        ],
      });
      const engine = new SkipPolicyEngine(prisma);
      const status = await engine.getStatus('user-1', 'test-bundle-sub');

      // Target month = April 2025 (Q2 first box month / bundle start)
      expect(status.nextDeadline).not.toBeNull();
      expect(status.canSkip).toBe(true);
      expect(status.skipsInWindow).toBe(0);
    });

    it('bimonthly bundle (interval=2, startingMonth=1): target is March when now=Feb 15', async () => {
      // now=Feb 15, nextCalendarMonth=March, offset=0 → candidateMonth=March
      // subscriptionMonths: Mar, May, Jul, Sep, Nov 2025...
      const sub = makeQuarterlyBundleSubscription({ intervalMonths: 2 });
      const prisma = makePrismaForGetStatus({
        subscription: sub,
        state: null,
        upcomingBundleMonths: [
          makeBundleMonth(2025, 3),  // first upcoming bundle start
          makeBundleMonth(2025, 5),
          makeBundleMonth(2025, 7),
        ],
      });
      const engine = new SkipPolicyEngine(prisma);
      const status = await engine.getStatus('user-1', 'test-bundle-sub');

      expect(status.canSkip).toBe(true);
      expect(status.skippedMonths).toHaveLength(0);
    });

    it('after skipping Q2 (April), target becomes Q3 (July)', async () => {
      const sub = makeQuarterlyBundleSubscription({
        skipRecords: [{ id: 'skip-1', month: { year: 2025, month: 4 }, windowKey: '2025', series: null }],
      });
      const prisma = makePrismaForGetStatus({
        subscription: sub,
        state: { windowKey: '2025', skipsInWindow: 1, consecutiveSkips: 1, totalSkips: 1 },
        upcomingBundleMonths: [
          makeBundleMonth(2025, 4), // Q2 — already skipped, filtered out
          makeBundleMonth(2025, 7), // Q3 — first non-skipped
          makeBundleMonth(2025, 10),
        ],
      });
      const engine = new SkipPolicyEngine(prisma);
      const status = await engine.getStatus('user-1', 'test-bundle-sub');

      // April is in skippedSet → candidate skipped → July is next
      expect(status.skippedMonths).toHaveLength(1);
      expect(status.skippedMonths[0]).toEqual({ year: 2025, month: 4 });
      expect(status.skipsInWindow).toBe(1);
      expect(status.canSkip).toBe(true); // maxSkips=2, used 1
    });

    it('after skipping Q2+Q3 (2 skips), canSkip=false (CALENDAR_YEAR maxSkips=2)', async () => {
      const sub = makeQuarterlyBundleSubscription({
        skipRecords: [
          { id: 'skip-1', month: { year: 2025, month: 4 }, windowKey: '2025', series: null },
          { id: 'skip-2', month: { year: 2025, month: 7 }, windowKey: '2025', series: null },
        ],
      });
      const prisma = makePrismaForGetStatus({
        subscription: sub,
        state: { windowKey: '2025', skipsInWindow: 2, consecutiveSkips: 2, totalSkips: 2 },
        upcomingBundleMonths: [makeBundleMonth(2025, 10)],
      });
      const engine = new SkipPolicyEngine(prisma);
      const status = await engine.getStatus('user-1', 'test-bundle-sub');

      expect(status.canSkip).toBe(false); // 2/2 used for the year
      expect(status.skipsInWindow).toBe(2);
      expect(status.skippedMonths).toHaveLength(2);
    });

    it('bundle with offset=1: target is May (first box of Q2) when now=Feb 15', async () => {
      // offset=1: renewal Jan → first box Feb; renewal Apr → first box May
      // nextCalendarMonth=Mar; candidateMonth = Mar+1=Apr; subscriptionMonths start at May
      // Note: offset shifts the subscriptionMonth records to box months: Feb, May, Aug, Nov
      const sub = makeQuarterlyBundleSubscription({ renewalMonthOffset: 1 });
      const prisma = makePrismaForGetStatus({
        subscription: sub,
        state: null,
        upcomingBundleMonths: [
          makeBundleMonth(2025, 5),  // May = first box of Q2 (Apr renewal + 1)
          makeBundleMonth(2025, 8),  // Aug = first box of Q3
          makeBundleMonth(2025, 11), // Nov = first box of Q4
        ],
      });
      const engine = new SkipPolicyEngine(prisma);
      const status = await engine.getStatus('user-1', 'test-bundle-sub');

      expect(status.canSkip).toBe(true);
      expect(status.skippedMonths).toHaveLength(0);
    });
  });

  // =========================================================================
  // recordSkip — one skip record per bundle, skipsInWindow=1
  // =========================================================================

  describe('recordSkip — exactly 1 skip record per bundle', () => {
    it('recordSkip(2025, 4) on quarterly bundle creates exactly 1 userSkipRecord', async () => {
      const sub = makeQuarterlyBundleSubscription();
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: null,
        targetSubMonth: makeBundleMonth(2025, 4),
        freshSkipRecordsForRefresh: [{ month: { year: 2025, month: 4 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 4);

      // Exactly 1 upsert call to userSkipRecord (not 3 for a quarterly bundle)
      expect(prisma.userSkipRecord.upsert).toHaveBeenCalledTimes(1);
      const upsertArg = (prisma.userSkipRecord.upsert as jest.Mock).mock.calls[0][0];
      expect(upsertArg.create.subscriptionMonthId).toBe('sm-2025-4');
    });

    it('skipsInWindow increments by 1 (not by intervalMonths=3)', async () => {
      const sub = makeQuarterlyBundleSubscription();
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: { windowKey: '2025', skipsInWindow: 0, consecutiveSkips: 0, totalSkips: 0 },
        targetSubMonth: makeBundleMonth(2025, 4),
        freshSkipRecordsForRefresh: [{ month: { year: 2025, month: 4 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 4);

      const stateUpsertArg = (prisma.userSubscriptionSkipState.upsert as jest.Mock).mock.calls[0][0];
      // skipsInWindow should increment by 1
      expect(stateUpsertArg.update.skipsInWindow).toEqual({ increment: 1 });
      expect(stateUpsertArg.update.totalSkips).toEqual({ increment: 1 });
    });

    it('second bundle skip (Q3=July): skipsInWindow becomes 2, totalSkips becomes 2', async () => {
      const sub = makeQuarterlyBundleSubscription({
        skipRecords: [{ id: 'skip-1', month: { year: 2025, month: 4 }, series: null }],
      });
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: { windowKey: '2025', skipsInWindow: 1, consecutiveSkips: 1, totalSkips: 1 },
        targetSubMonth: makeBundleMonth(2025, 7),
        freshSkipRecordsForRefresh: [
          { month: { year: 2025, month: 4 } },
          { month: { year: 2025, month: 7 } },
        ],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 7);

      // Still only 1 userSkipRecord.upsert call (one per skip operation)
      expect(prisma.userSkipRecord.upsert).toHaveBeenCalledTimes(1);
      const stateArg = (prisma.userSubscriptionSkipState.upsert as jest.Mock).mock.calls[0][0];
      expect(stateArg.update.skipsInWindow).toEqual({ increment: 1 }); // 1→2
      expect(stateArg.update.totalSkips).toEqual({ increment: 1 }); // 1→2
    });

    it('refreshNextRenewalDate is called after skip (userSubscriptionEntry.findUnique called)', async () => {
      const sub = makeQuarterlyBundleSubscription();
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: null,
        targetSubMonth: makeBundleMonth(2025, 4),
        freshSkipRecordsForRefresh: [{ month: { year: 2025, month: 4 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 4);

      // refreshNextRenewalDate calls userSubscriptionEntry.findUnique (to get the entry + subscription)
      expect(prisma.userSubscriptionEntry.findUnique).toHaveBeenCalled();
      // And then persists the new nextRenewalDate
      expect(prisma.userSubscriptionEntry.update).toHaveBeenCalled();
    });

    it('after skipping Q2 (April, offset=0), refreshNextRenewalDate stores July as nextRenewalDate', async () => {
      // offset=0: skip April (box=renewal month) → skippedMonths=[{2025,4}]
      // computeNextRenewalDate(1, 3, 1, '2025-01-01', [{2025,4}]) → July 1 2025
      jest.setSystemTime(new Date('2025-02-15T12:00:00Z'));

      const sub = makeQuarterlyBundleSubscription();
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: null,
        targetSubMonth: makeBundleMonth(2025, 4),
        freshSkipRecordsForRefresh: [{ month: { year: 2025, month: 4 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 4);

      const updateCalls = (prisma.userSubscriptionEntry.update as jest.Mock).mock.calls;
      // Last update call is from refreshNextRenewalDate — check nextRenewalDate
      const nextRenewalUpdate = updateCalls.find((c) => c[0].data?.nextRenewalDate !== undefined);
      expect(nextRenewalUpdate).toBeDefined();
      const stored = nextRenewalUpdate[0].data.nextRenewalDate as Date;
      // July 1 2025 (Q3 = next quarterly renewal after skipping Q2)
      expect(stored?.getUTCFullYear()).toBe(2025);
      expect(stored?.getUTCMonth() + 1).toBe(7); // July
      expect(stored?.getUTCDate()).toBe(1);
    });

    it('bimonthly bundle (interval=2): skip May 2025 → refreshNextRenewalDate stores July 1', async () => {
      // 2-month bundle, startingMonth=1 (Mar, May, Jul, Sep, Nov aligned from Feb perspective)
      // now=April 15 (inside the Mar-Apr bundle); next bundle = May. Skip May → next = July
      jest.setSystemTime(new Date('2025-04-15T12:00:00Z'));

      const sub = makeQuarterlyBundleSubscription({ intervalMonths: 2 });
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: null,
        targetSubMonth: makeBundleMonth(2025, 5),
        freshSkipRecordsForRefresh: [{ month: { year: 2025, month: 5 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 5);

      const updateCalls = (prisma.userSubscriptionEntry.update as jest.Mock).mock.calls;
      const nextRenewalUpdate = updateCalls.find((c) => c[0].data?.nextRenewalDate !== undefined);
      const stored = nextRenewalUpdate?.[0].data.nextRenewalDate as Date;
      expect(stored?.getUTCFullYear()).toBe(2025);
      expect(stored?.getUTCMonth() + 1).toBe(7); // July
    });
  });

  // =========================================================================
  // Bundle skip with renewalMonthOffset
  // offset=1: first box month = renewal month + 1
  // Quarterly bundle: Q2 renewal = April → first box = May
  // Skip record stored on May (box month) → converted to April (renewal) by refreshNextRenewalDate
  // =========================================================================

  describe('recordSkip with renewalMonthOffset=1', () => {
    it('skip Q2 first box month (May 2025): 1 skip record stored on May', async () => {
      const sub = makeQuarterlyBundleSubscription({ renewalMonthOffset: 1 });
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: null,
        targetSubMonth: makeBundleMonth(2025, 5), // May = Q2 first box (April renewal + offset=1)
        freshSkipRecordsForRefresh: [{ month: { year: 2025, month: 5 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 5);

      expect(prisma.userSkipRecord.upsert).toHaveBeenCalledTimes(1);
      const upsertArg = (prisma.userSkipRecord.upsert as jest.Mock).mock.calls[0][0];
      // Skip stored on May subscriptionMonth (box month)
      expect(upsertArg.create.subscriptionMonthId).toBe('sm-2025-5');
    });

    it('skip May box (offset=1): refreshNextRenewalDate converts to April renewal → next renewal = July', async () => {
      // refreshNextRenewalDate receives freshSkipRecords=[{year:2025,month:5}]
      // with offset=1: renewalMonthFromBoxMonth(2025,5,1) = [2025,4] = April
      // computeNextRenewalDate(1, 3, 1, '2025-01-01', [{year:2025,month:4}]) → July 1 2025
      jest.setSystemTime(new Date('2025-02-15T12:00:00Z'));

      const sub = makeQuarterlyBundleSubscription({ renewalMonthOffset: 1 });
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: null,
        targetSubMonth: makeBundleMonth(2025, 5),
        freshSkipRecordsForRefresh: [{ month: { year: 2025, month: 5 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 5);

      const updateCalls = (prisma.userSubscriptionEntry.update as jest.Mock).mock.calls;
      const nextRenewalUpdate = updateCalls.find((c) => c[0].data?.nextRenewalDate !== undefined);
      const stored = nextRenewalUpdate?.[0].data.nextRenewalDate as Date;
      // Box May 2025 → renewal April → skip April → next renewal July
      expect(stored?.getUTCFullYear()).toBe(2025);
      expect(stored?.getUTCMonth() + 1).toBe(7); // July
    });

    it('skip Q2 (May box, offset=1): skipsInWindow increments by 1 (not 3)', async () => {
      const sub = makeQuarterlyBundleSubscription({ renewalMonthOffset: 1 });
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: { windowKey: '2025', skipsInWindow: 0, consecutiveSkips: 0, totalSkips: 0 },
        targetSubMonth: makeBundleMonth(2025, 5),
        freshSkipRecordsForRefresh: [{ month: { year: 2025, month: 5 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 5);

      const stateArg = (prisma.userSubscriptionSkipState.upsert as jest.Mock).mock.calls[0][0];
      expect(stateArg.update.skipsInWindow).toEqual({ increment: 1 }); // 1 skip, not 3
      expect(stateArg.update.totalSkips).toEqual({ increment: 1 });
    });
  });

  // =========================================================================
  // CALENDAR_YEAR policy limits enforced per bundle (not per month)
  // =========================================================================

  describe('CALENDAR_YEAR policy: limits per bundle (not per month)', () => {
    it('maxSkips=2 for quarterly: can skip 2 bundles (not 2/3 of a bundle)', async () => {
      // First skip → skipsInWindow=1 → still allowed
      const sub1 = makeQuarterlyBundleSubscription({
        policy: makePolicy('CALENDAR_YEAR', { maxSkips: 2 }),
      });
      // Before first skip: state null → skipsInWindow=0, canSkip=true
      const prisma1 = makePrismaForGetStatus({
        subscription: sub1,
        state: null,
        upcomingBundleMonths: [makeBundleMonth(2025, 4), makeBundleMonth(2025, 7), makeBundleMonth(2025, 10)],
      });
      const engine1 = new SkipPolicyEngine(prisma1);
      const status1 = await engine1.getStatus('user-1', 'test-bundle-sub');
      expect(status1.canSkip).toBe(true);
      expect(status1.skipsInWindow).toBe(0);
      expect(status1.maxSkips).toBe(2);

      // After 1 bundle skip: skipsInWindow=1, canSkip=true (still below limit)
      const sub2 = makeQuarterlyBundleSubscription({
        policy: makePolicy('CALENDAR_YEAR', { maxSkips: 2 }),
        skipRecords: [{ id: 'skip-1', month: { year: 2025, month: 4 }, series: null }],
      });
      const prisma2 = makePrismaForGetStatus({
        subscription: sub2,
        state: { windowKey: '2025', skipsInWindow: 1, consecutiveSkips: 1, totalSkips: 1 },
        upcomingBundleMonths: [makeBundleMonth(2025, 7), makeBundleMonth(2025, 10)],
      });
      const engine2 = new SkipPolicyEngine(prisma2);
      const status2 = await engine2.getStatus('user-1', 'test-bundle-sub');
      expect(status2.canSkip).toBe(true);
      expect(status2.skipsInWindow).toBe(1);

      // After 2 bundle skips: skipsInWindow=2, canSkip=false (limit reached)
      const sub3 = makeQuarterlyBundleSubscription({
        policy: makePolicy('CALENDAR_YEAR', { maxSkips: 2 }),
        skipRecords: [
          { id: 'skip-1', month: { year: 2025, month: 4 }, series: null },
          { id: 'skip-2', month: { year: 2025, month: 7 }, series: null },
        ],
      });
      const prisma3 = makePrismaForGetStatus({
        subscription: sub3,
        state: { windowKey: '2025', skipsInWindow: 2, consecutiveSkips: 0, totalSkips: 2 },
        upcomingBundleMonths: [makeBundleMonth(2025, 10)],
      });
      const engine3 = new SkipPolicyEngine(prisma3);
      const status3 = await engine3.getStatus('user-1', 'test-bundle-sub');
      expect(status3.canSkip).toBe(false); // 2/2 used — no more skips allowed
      expect(status3.skipsInWindow).toBe(2);
    });

    it('CALENDAR_YEAR resets at year boundary: skipping Q4 2025 + Q1 2026 = 1 skip each year', async () => {
      // Q4 2025 skipped (windowKey='2025', skipsInWindow=1)
      // Now in 2026 (windowKey='2026'), skipsInWindow should show 0 (new year)
      jest.setSystemTime(new Date('2026-01-10T12:00:00Z'));

      const sub = makeQuarterlyBundleSubscription({
        policy: makePolicy('CALENDAR_YEAR', { maxSkips: 1 }),
        skipRecords: [
          { id: 'skip-1', month: { year: 2025, month: 10 }, series: null }, // Q4 2025 skipped
        ],
      });
      const prisma = makePrismaForGetStatus({
        subscription: sub,
        // State says windowKey='2025' (old year), skipsInWindow=1
        // Engine should detect stale window and show 0 (new year = no skips yet)
        state: { windowKey: '2025', skipsInWindow: 1, consecutiveSkips: 1, totalSkips: 1 },
        upcomingBundleMonths: [makeBundleMonth(2026, 1), makeBundleMonth(2026, 4), makeBundleMonth(2026, 7)],
      });
      const engine = new SkipPolicyEngine(prisma);
      const status = await engine.getStatus('user-1', 'test-bundle-sub');

      // The stale-state correction: currentWindowKey='2026' ≠ state.windowKey='2025' → skipsInWindow=0
      expect(status.skipsInWindow).toBe(0);
      expect(status.canSkip).toBe(true); // maxSkips=1, new year window = 0 used
    });
  });

  // =========================================================================
  // Bundle skip counter — 1 per bundle regardless of interval
  // =========================================================================

  describe('skip counter is 1 per bundle skip, not per month', () => {
    it('skipping 1 quarterly bundle (3 months) = 1 skip (not 3)', async () => {
      const sub = makeQuarterlyBundleSubscription({ intervalMonths: 3 });
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: { windowKey: '2025', skipsInWindow: 0, consecutiveSkips: 0, totalSkips: 0 },
        targetSubMonth: makeBundleMonth(2025, 4),
        freshSkipRecordsForRefresh: [{ month: { year: 2025, month: 4 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 4);

      // Verify that userSkipRecord.upsert was called ONCE (1 skip, not 3)
      expect(prisma.userSkipRecord.upsert).toHaveBeenCalledTimes(1);

      // And the state increment is +1, not +3
      const stateArg = (prisma.userSubscriptionSkipState.upsert as jest.Mock).mock.calls[0][0];
      expect(stateArg.update.skipsInWindow).toEqual({ increment: 1 });
    });

    it('skipping 1 semi-annual bundle (6 months) = 1 skip (not 6)', async () => {
      const sub = makeQuarterlyBundleSubscription({ intervalMonths: 6 });
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: { windowKey: '2025', skipsInWindow: 0, consecutiveSkips: 0, totalSkips: 0 },
        targetSubMonth: makeBundleMonth(2025, 7), // July = semi-annual bundle start (Jan+6)
        freshSkipRecordsForRefresh: [{ month: { year: 2025, month: 7 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 7);

      expect(prisma.userSkipRecord.upsert).toHaveBeenCalledTimes(1);
      const stateArg = (prisma.userSubscriptionSkipState.upsert as jest.Mock).mock.calls[0][0];
      expect(stateArg.update.skipsInWindow).toEqual({ increment: 1 });
      expect(stateArg.update.totalSkips).toEqual({ increment: 1 });
    });

    it('skipping 1 annual bundle (12 months) = 1 skip (not 12)', async () => {
      const sub = makeQuarterlyBundleSubscription({ intervalMonths: 12 });
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: { windowKey: '2025', skipsInWindow: 0, consecutiveSkips: 0, totalSkips: 0 },
        targetSubMonth: makeBundleMonth(2026, 1), // January next year
        freshSkipRecordsForRefresh: [{ month: { year: 2026, month: 1 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2026, 1);

      expect(prisma.userSkipRecord.upsert).toHaveBeenCalledTimes(1);
      const stateArg = (prisma.userSubscriptionSkipState.upsert as jest.Mock).mock.calls[0][0];
      expect(stateArg.update.skipsInWindow).toEqual({ increment: 1 });
    });
  });

  // =========================================================================
  // firstSkipDate is set on first bundle skip
  // =========================================================================

  describe('firstSkipDate set on first bundle skip', () => {
    it('sets firstSkipDate when first skip recorded on a bundle', async () => {
      const sub = makeQuarterlyBundleSubscription(); // firstSkipDate: null in entry
      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: null,
        targetSubMonth: makeBundleMonth(2025, 4),
        freshSkipRecordsForRefresh: [{ month: { year: 2025, month: 4 } }],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 4);

      const updateCalls = (prisma.userSubscriptionEntry.update as jest.Mock).mock.calls;
      const firstSkipDateUpdate = updateCalls.find((c) => c[0].data?.firstSkipDate !== undefined);
      expect(firstSkipDateUpdate).toBeDefined();
      expect(firstSkipDateUpdate![0].data.firstSkipDate).toBeInstanceOf(Date);
    });

    it('does NOT set firstSkipDate again when second skip recorded', async () => {
      // Simulate entry already having firstSkipDate set
      const sub = makeQuarterlyBundleSubscription({
        skipRecords: [{ id: 'skip-1', month: { year: 2025, month: 4 }, series: null }],
      });
      // Inject firstSkipDate into the entry
      sub.userEntries[0].firstSkipDate = new Date('2025-04-01');

      const prisma = makePrismaForRecordSkip({
        subscription: sub,
        state: { windowKey: '2025', skipsInWindow: 1, consecutiveSkips: 1, totalSkips: 1 },
        targetSubMonth: makeBundleMonth(2025, 7),
        freshSkipRecordsForRefresh: [
          { month: { year: 2025, month: 4 } },
          { month: { year: 2025, month: 7 } },
        ],
      });
      const engine = new SkipPolicyEngine(prisma);
      await engine.recordSkip('user-1', 'test-bundle-sub', 2025, 7);

      const updateCalls = (prisma.userSubscriptionEntry.update as jest.Mock).mock.calls;
      const firstSkipDateUpdates = updateCalls.filter((c) => c[0].data?.firstSkipDate !== undefined);
      // Should NOT update firstSkipDate a second time
      expect(firstSkipDateUpdates).toHaveLength(0);
    });
  });
});
