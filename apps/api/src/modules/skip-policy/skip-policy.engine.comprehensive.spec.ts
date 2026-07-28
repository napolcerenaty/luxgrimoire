/**
 * Comprehensive unit tests for SkipPolicyEngine covering every policy type,
 * window-expiry logic, stale-state correction, combo aggregation, series
 * counting, consecutive-skip detection, and multi-year backfill scenarios.
 *
 * Public methods (getStatus, recomputeState) are tested with a hand-crafted
 * Prisma mock.  Private pure helpers (computeWindowKey, evaluateCanSkip,
 * buildStatus, computeWarnings) are called directly via `(engine as any)`.
 */

import { SkipPolicyEngine } from './skip-policy.engine';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Factory helpers ─────────────────────────────────────────────────────────

type PolicyType =
  | 'NONE'
  | 'UNLIMITED'
  | 'UNLIMITED_MAX_CONSEC'
  | 'CALENDAR_YEAR'
  | 'FROM_FIRST_SKIP'
  | 'FROM_SUB_START';

function makePolicy(
  type: PolicyType,
  opts: {
    maxSkips?: number | null;
    maxConsecutive?: number | null;
    windowMonths?: number | null;
    allowUnskip?: boolean;
    billingType?: string;
  } = {},
) {
  if (type === 'NONE') return null;
  return {
    type,
    billingType: opts.billingType ?? 'ALL',
    maxSkips: opts.maxSkips ?? null,
    maxConsecutive: opts.maxConsecutive ?? null,
    windowMonths: opts.windowMonths ?? null,
    allowUnskip: opts.allowUnskip ?? false,
    notes: null,
    skipHow: null,
    unskipHow: null,
    unskipNotes: null,
    skipDeadlineDaysBefore: 3,
    unskipDeadlineDaysBefore: 0,
  };
}

/** A skip record shaped like what loadContext/recomputeState loads from Prisma. */
function makeRecord(opts: {
  year: number;
  month: number;
  windowKey: string;
  skippedAt?: Date;
  seriesId?: string | null;
  seriesSkipMode?: string | null;
}) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    id: `rec-${opts.year}-${opts.month}`,
    userId: 'user-1',
    userEntryId: 'entry-1',
    subscriptionMonthId: `sm-${opts.year}-${opts.month}`,
    windowKey: opts.windowKey,
    skippedAt: opts.skippedAt ?? new Date(`${opts.year}-${pad(opts.month)}-10T10:00:00Z`),
    undoneAt: null,
    seriesId: opts.seriesId ?? null,
    month: { year: opts.year, month: opts.month },
    series: opts.seriesId ? { skipMode: opts.seriesSkipMode ?? 'INDIVIDUAL' } : null,
  };
}

/**
 * Builds a minimal PrismaService mock that satisfies loadContext + getStatus.
 *
 * loadContext calls:
 *   subscription.findUnique   → full subscription object with userEntries
 *   userSubscriptionSkipState.findUnique → state
 *
 * getStatus additionally calls (for combos):
 *   userSubscriptionEntry.findMany   → component entries
 *   userSkipRecord.findMany          → component skip records
 *
 * getStatus calls for the target-month search:
 *   subscriptionMonth.findMany  → upcoming months
 *   subscriptionMonth.findFirst → first deliverable month (returned as null
 *                                  so first-box protection is disabled)
 */
function makePrismaForGetStatus(opts: {
  policyType: PolicyType;
  maxSkips?: number | null;
  maxConsecutive?: number | null;
  windowMonths?: number | null;
  isCombo?: boolean;
  componentIds?: string[];
  skipRecords?: ReturnType<typeof makeRecord>[];
  firstSkipDate?: Date | null;
  startDate?: string | null;
  renewalDay?: number | null;
  state?: {
    windowKey: string | null;
    skipsInWindow: number;
    consecutiveSkips: number;
    totalSkips: number;
  } | null;
  /** Upcoming subscription months returned by subscriptionMonth.findMany */
  upcomingMonths?: Array<{ id: string; year: number; month: number; seriesId: string | null }>;
  /** Component entries returned by userSubscriptionEntry.findMany (combo only) */
  componentEntries?: Array<{ id: string; firstSkipDate: Date | null }>;
  /** Component skip records returned by userSkipRecord.findMany (combo only) */
  componentSkipRecords?: ReturnType<typeof makeRecord>[];
}): PrismaService {
  const policy = makePolicy(opts.policyType, {
    maxSkips: opts.maxSkips,
    maxConsecutive: opts.maxConsecutive,
    windowMonths: opts.windowMonths,
  });

  const renewalDay = opts.renewalDay ?? null;
  const subscription = {
    id: 'sub-1',
    slug: 'test-sub',
    renewalDay: null,
    renewalMonthOffset: 0,
    isCombo: opts.isCombo ?? false,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: false,
    startDate: null,
    skipPolicies: policy ? [policy] : [],
    comboComponents: (opts.componentIds ?? []).map((id) => ({ componentId: id })),
    userEntries: [
      {
        id: 'entry-1',
        userId: 'user-1',
        subscriptionId: 'sub-1',
        firstSkipDate: opts.firstSkipDate ?? null,
        startDate: opts.startDate ?? '2024-01-01',
        renewalDay,
        prepaidMonths: 1,
        skipRecords: opts.skipRecords ?? [],
      },
    ],
  };

  // Use a far-future month so it is never filtered out and is never the
  // "first deliverable month" (findFirst returns null for that)
  const upcomingMonths = opts.upcomingMonths ?? [
    { id: 'sm-future', year: 9999, month: 6, seriesId: null },
  ];

  return {
    subscription: {
      findUnique: jest.fn().mockResolvedValue(subscription),
    },
    userSubscriptionSkipState: {
      findUnique: jest.fn().mockResolvedValue(
        opts.state !== undefined ? opts.state : null,
      ),
    },
    userSubscriptionEntry: {
      findUnique: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      findMany: jest.fn().mockResolvedValue(opts.componentEntries ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
    userSkipRecord: {
      findMany: jest.fn().mockResolvedValue(opts.componentSkipRecords ?? []),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    subscriptionMonth: {
      // findFirst is used for getFirstDeliverableMonthInfo → null disables protection
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(upcomingMonths),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaService;
}

/** Prisma mock for recomputeState tests. */
function makePrismaForRecompute(records: ReturnType<typeof makeRecord>[]): PrismaService {
  const upsertMock = jest.fn().mockImplementation(({ create, update }: any) =>
    Promise.resolve({ ...create, ...update }),
  );
  return {
    userSubscriptionEntry: {
      findUnique: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'entry-1' }),
    },
    userSkipRecord: {
      findMany: jest.fn().mockResolvedValue(records),
    },
    userSubscriptionSkipState: {
      upsert: upsertMock,
    },
  } as unknown as PrismaService;
}

// Helper: extract the update payload from the upsert call
function getUpsertUpdate(prisma: PrismaService) {
  return (prisma.userSubscriptionSkipState.upsert as jest.Mock).mock.calls[0][0].update;
}

// Helper: extract the create payload from the upsert call
function getUpsertCreate(prisma: PrismaService) {
  return (prisma.userSubscriptionSkipState.upsert as jest.Mock).mock.calls[0][0].create;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SkipPolicyEngine — comprehensive', () => {
  let engine: SkipPolicyEngine;

  beforeEach(() => {
    engine = new SkipPolicyEngine(null as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =========================================================================
  // computeWindowKey
  // =========================================================================

  describe('computeWindowKey', () => {
    const call = (policy: any, state: any, entry: any) =>
      (engine as any).computeWindowKey(policy, state, entry);

    it('returns null when policy is null', () => {
      expect(call(null, null, {})).toBeNull();
    });

    it('returns null for UNLIMITED', () => {
      expect(call({ type: 'UNLIMITED', windowMonths: null }, null, {})).toBeNull();
    });

    it('returns null for UNLIMITED_MAX_CONSEC', () => {
      expect(call({ type: 'UNLIMITED_MAX_CONSEC', windowMonths: null }, null, {})).toBeNull();
    });

    // ── CALENDAR_YEAR ────────────────────────────────────────────────────────

    describe('CALENDAR_YEAR', () => {
      it('returns the current year as a string', () => {
        jest.useFakeTimers().setSystemTime(new Date('2025-06-15T12:00:00Z'));
        expect(call({ type: 'CALENDAR_YEAR', windowMonths: null }, null, {})).toBe('2025');
      });

      it('rolls over to the new year on Jan 1', () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:01Z'));
        expect(call({ type: 'CALENDAR_YEAR', windowMonths: null }, null, {})).toBe('2026');
      });
    });

    // ── FROM_FIRST_SKIP ──────────────────────────────────────────────────────

    describe('FROM_FIRST_SKIP', () => {
      const policy = { type: 'FROM_FIRST_SKIP', windowMonths: 12 };
      const policyPermanent = { type: 'FROM_FIRST_SKIP', windowMonths: null };

      it('returns today when user has never skipped (no firstSkipDate)', () => {
        jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
        expect(
          call(policy, null, { startDate: '2024-01-01', firstSkipDate: null }),
        ).toBe('2025-05-18');
      });

      it('returns firstSkipDate key when state.windowKey is null but window still active', () => {
        // firstSkipDate=2025-01-01, windowMonths=12 → window expires 2026-01-01
        // today=2025-05-18 (inside window) → should return '2025-01-01', NOT today
        jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
        expect(
          call(
            policy,
            { windowKey: null },
            { startDate: '2024-01-01', firstSkipDate: new Date('2025-01-01') },
          ),
        ).toBe('2025-01-01');
      });

      it('returns today when firstSkipDate set but state has no windowKey', () => {
        jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
        expect(
          call(policy, { windowKey: null }, { startDate: '2024-01-01', firstSkipDate: new Date('2024-03-01') }),
        ).toBe('2025-05-18');
      });

      it('returns existing windowKey when window is still active', () => {
        // windowKey = '2025-01-10' → expires 2026-01-10; today = 2025-05-18 (active)
        jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
        expect(
          call(
            policy,
            { windowKey: '2025-01-10' },
            { startDate: '2024-01-01', firstSkipDate: new Date('2025-01-10') },
          ),
        ).toBe('2025-01-10');
      });

      it('returns the active windowKey one day before expiry', () => {
        // windowKey='2024-05-01', expires 2025-05-01; today=2025-04-30
        jest.useFakeTimers().setSystemTime(new Date('2025-04-30T23:59:59Z'));
        expect(
          call(
            policy,
            { windowKey: '2024-05-01' },
            { startDate: '2024-01-01', firstSkipDate: new Date('2024-05-01') },
          ),
        ).toBe('2024-05-01');
      });

      it('returns today the day after the window expires', () => {
        // windowKey='2024-01-10', expires 2025-01-10; today=2025-01-11
        jest.useFakeTimers().setSystemTime(new Date('2025-01-11T00:00:00Z'));
        expect(
          call(
            policy,
            { windowKey: '2024-01-10' },
            { startDate: '2024-01-01', firstSkipDate: new Date('2024-01-10') },
          ),
        ).toBe('2025-01-11');
      });

      it('returns today when window expired over a year ago (backfill scenario)', () => {
        // windowKey='2023-03-01', expired 2024-03-01; today=2026-05-18
        jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
        expect(
          call(
            policy,
            { windowKey: '2023-03-01' },
            { startDate: '2023-01-01', firstSkipDate: new Date('2023-03-01') },
          ),
        ).toBe('2026-05-18');
      });

      it('never rotates when windowMonths is null (permanent window)', () => {
        jest.useFakeTimers().setSystemTime(new Date('2030-01-01T00:00:00Z'));
        expect(
          call(
            policyPermanent,
            { windowKey: '2022-06-01' },
            { startDate: '2022-01-01', firstSkipDate: new Date('2022-06-01') },
          ),
        ).toBe('2022-06-01');
      });
    });

    // ── FROM_SUB_START ───────────────────────────────────────────────────────

    describe('FROM_SUB_START', () => {
      it('returns today when no startDate and no windowMonths', () => {
        jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
        expect(
          call({ type: 'FROM_SUB_START', windowMonths: null }, null, { startDate: null, firstSkipDate: null }),
        ).toBe('2025-05-18');
      });

      it('returns startDate when no windowMonths (permanent window)', () => {
        expect(
          call(
            { type: 'FROM_SUB_START', windowMonths: null },
            null,
            { startDate: '2024-03-01', firstSkipDate: null },
          ),
        ).toBe('2024-03-01');
      });

      it('returns startDate when currently in first window', () => {
        // Sub start 2025-01-01, windowMonths=12 → window 1: 2025-01-01→2026-01-01
        jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
        expect(
          call(
            { type: 'FROM_SUB_START', windowMonths: 12 },
            null,
            { startDate: '2025-01-01', firstSkipDate: null },
          ),
        ).toBe('2025-01-01');
      });

      it('returns window-2 start when in second window', () => {
        // Sub start 2025-01-01 → window 2 starts 2026-01-01; today=2026-05-18
        jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
        expect(
          call(
            { type: 'FROM_SUB_START', windowMonths: 12 },
            null,
            { startDate: '2025-01-01', firstSkipDate: null },
          ),
        ).toBe('2026-01-01');
      });

      it('returns window-4 start for a 3+ year old subscription', () => {
        // Sub start 2023-01-01; windows: W1→2024-01-01, W2→2025-01-01, W3→2026-01-01, W4 active
        jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
        expect(
          call(
            { type: 'FROM_SUB_START', windowMonths: 12 },
            null,
            { startDate: '2023-01-01', firstSkipDate: null },
          ),
        ).toBe('2026-01-01');
      });

      it('handles mid-year start date correctly across windows', () => {
        // Sub start 2024-07-15, windowMonths=12
        // W1: 2024-07-15→2025-07-15; W2: 2025-07-15→2026-07-15 (active on 2025-10-01)
        jest.useFakeTimers().setSystemTime(new Date('2025-10-01T10:00:00Z'));
        expect(
          call(
            { type: 'FROM_SUB_START', windowMonths: 12 },
            null,
            { startDate: '2024-07-15', firstSkipDate: null },
          ),
        ).toBe('2025-07-15');
      });

      it('handles 10-month windows correctly', () => {
        // Sub start 2025-01-01, windowMonths=10
        // W1: 2025-01-01→2025-11-01; W2: 2025-11-01→2026-09-01 (active on 2026-01-01)
        jest.useFakeTimers().setSystemTime(new Date('2026-01-01T10:00:00Z'));
        expect(
          call(
            { type: 'FROM_SUB_START', windowMonths: 10 },
            null,
            { startDate: '2025-01-01', firstSkipDate: null },
          ),
        ).toBe('2025-11-01');
      });
    });
  });

  // =========================================================================
  // evaluateCanSkip — extended edge cases
  // =========================================================================

  describe('evaluateCanSkip — edge cases', () => {
    const call = (policy: any, state: any, prepaid?: number) =>
      (engine as any).evaluateCanSkip(policy, state, prepaid);

    it('PREPAID_WINDOW_SKIP: counts window skip against maxSkips', () => {
      const p = makePolicy('FROM_FIRST_SKIP', { maxSkips: 1 });
      expect(call(p, { skipsInWindow: 0, consecutiveSkips: 0 }, 6)).toBe(true);
      expect(call(p, { skipsInWindow: 1, consecutiveSkips: 0 }, 6)).toBe(false);
    });

    it('billing type restriction is no longer enforced by evaluateCanSkip (handled by selection)', () => {
      const p = makePolicy('FROM_FIRST_SKIP', { maxSkips: 4, billingType: 'MONTHLY' });
      // evaluateCanSkip ignores billing type — a prepaid subscriber under the limit can still skip
      expect(call(p, { skipsInWindow: 0, consecutiveSkips: 0 }, 3)).toBe(true);
      expect(call(p, { skipsInWindow: 0, consecutiveSkips: 0 }, 1)).toBe(true);
    });

    it('null state with window limit → treated as 0 skips (can skip)', () => {
      const p = makePolicy('FROM_FIRST_SKIP', { maxSkips: 4 });
      expect(call(p, null)).toBe(true);
    });

    it('window-based: exactly at limit → cannot skip', () => {
      const p = makePolicy('FROM_FIRST_SKIP', { maxSkips: 4 });
      expect(call(p, { skipsInWindow: 4, consecutiveSkips: 0 })).toBe(false);
    });

    it('window-based: one below limit → can skip', () => {
      const p = makePolicy('FROM_FIRST_SKIP', { maxSkips: 4 });
      expect(call(p, { skipsInWindow: 3, consecutiveSkips: 0 })).toBe(true);
    });

    it('window-based: null maxSkips → unlimited within window', () => {
      const p = makePolicy('FROM_FIRST_SKIP', { maxSkips: null });
      expect(call(p, { skipsInWindow: 999, consecutiveSkips: 0 })).toBe(true);
    });

    it('UNLIMITED_MAX_CONSEC: exactly at limit → cannot skip', () => {
      const p = makePolicy('UNLIMITED_MAX_CONSEC', { maxConsecutive: 3 });
      expect(call(p, { skipsInWindow: 0, consecutiveSkips: 3 })).toBe(false);
    });

    it('UNLIMITED_MAX_CONSEC: null maxConsecutive → unlimited', () => {
      const p = makePolicy('UNLIMITED_MAX_CONSEC', { maxConsecutive: null });
      expect(call(p, { skipsInWindow: 0, consecutiveSkips: 1000 })).toBe(true);
    });
  });

  // =========================================================================
  // getStatus — CALENDAR_YEAR
  // =========================================================================

  describe('getStatus — CALENDAR_YEAR', () => {
    const uid = 'user-1';
    const slug = 'test-sub';

    it('fresh user (no state) → 0/3 used, canSkip=true', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({ policyType: 'CALENDAR_YEAR', maxSkips: 3, state: null });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.policyType).toBe('CALENDAR_YEAR');
      expect(status.skipsInWindow).toBe(0);
      expect(status.maxSkips).toBe(3);
      expect(status.canSkip).toBe(true);
    });

    it('1 of 3 used in current year → canSkip=true, no warnings', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'CALENDAR_YEAR', maxSkips: 3,
        skipRecords: [makeRecord({ year: 2026, month: 2, windowKey: '2026' })],
        state: { windowKey: '2026', skipsInWindow: 1, consecutiveSkips: 0, totalSkips: 1 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(1);
      expect(status.canSkip).toBe(true);
      expect(status.warnings).toHaveLength(0);
    });

    it('2 of 3 used → canSkip=true, "1 skip remaining" warning', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'CALENDAR_YEAR', maxSkips: 3,
        skipRecords: [
          makeRecord({ year: 2026, month: 2, windowKey: '2026' }),
          makeRecord({ year: 2026, month: 4, windowKey: '2026' }),
        ],
        state: { windowKey: '2026', skipsInWindow: 2, consecutiveSkips: 0, totalSkips: 2 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(2);
      expect(status.canSkip).toBe(true);
      expect(status.warnings.some((w) => w.includes('1 skip remaining'))).toBe(true);
    });

    it('3 of 3 used → canSkip=false, exhausted warning', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'CALENDAR_YEAR', maxSkips: 3,
        skipRecords: [
          makeRecord({ year: 2026, month: 2, windowKey: '2026' }),
          makeRecord({ year: 2026, month: 3, windowKey: '2026' }),
          makeRecord({ year: 2026, month: 4, windowKey: '2026' }),
        ],
        state: { windowKey: '2026', skipsInWindow: 3, consecutiveSkips: 0, totalSkips: 3 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(3);
      expect(status.canSkip).toBe(false);
      expect(status.warnings.some((w) => w.includes('all 3'))).toBe(true);
    });

    it('stale state from previous year → skipsInWindow corrected to 0', async () => {
      // state.windowKey='2025', now=2026 → stale: effectiveSkipsInWindow=0
      jest.useFakeTimers().setSystemTime(new Date('2026-03-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'CALENDAR_YEAR', maxSkips: 3,
        skipRecords: [
          makeRecord({ year: 2025, month: 6, windowKey: '2025' }),
          makeRecord({ year: 2025, month: 8, windowKey: '2025' }),
          makeRecord({ year: 2025, month: 10, windowKey: '2025' }),
        ],
        state: { windowKey: '2025', skipsInWindow: 3, consecutiveSkips: 0, totalSkips: 3 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(0);
      expect(status.totalSkips).toBe(3);
      expect(status.canSkip).toBe(true);
    });

    it('backfill: 3 years of skips — only current year counter counts', async () => {
      // 2024: 2 skips (key='2024'), 2025: 3 skips (key='2025'), 2026: 1 skip (key='2026')
      // state.windowKey='2025' (stale) → corrected to 0 for 2026
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'CALENDAR_YEAR', maxSkips: 3,
        skipRecords: [
          makeRecord({ year: 2024, month: 3, windowKey: '2024' }),
          makeRecord({ year: 2024, month: 7, windowKey: '2024' }),
          makeRecord({ year: 2025, month: 2, windowKey: '2025' }),
          makeRecord({ year: 2025, month: 5, windowKey: '2025' }),
          makeRecord({ year: 2025, month: 9, windowKey: '2025' }),
          makeRecord({ year: 2026, month: 2, windowKey: '2026' }),
        ],
        state: { windowKey: '2025', skipsInWindow: 3, consecutiveSkips: 0, totalSkips: 6 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      // stale (2025 ≠ 2026) → reset to 0
      expect(status.skipsInWindow).toBe(0);
      expect(status.totalSkips).toBe(6);
      expect(status.canSkip).toBe(true);
    });

    it('CALENDAR_YEAR skippedMonths shows only current-year records (not all-time)', async () => {
      // Previous years' skips are tracked in skippedSet but hidden from skippedMonths display.
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const skipRecords = [
        makeRecord({ year: 2024, month: 3, windowKey: '2024' }),
        makeRecord({ year: 2025, month: 6, windowKey: '2025' }),
        makeRecord({ year: 2026, month: 2, windowKey: '2026' }),
      ];
      const prisma = makePrismaForGetStatus({
        policyType: 'CALENDAR_YEAR', maxSkips: 3,
        skipRecords,
        state: { windowKey: '2026', skipsInWindow: 1, consecutiveSkips: 0, totalSkips: 3 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      // Only the 2026 record belongs to the current window
      expect(status.skippedMonths).toHaveLength(1);
      expect(status.skippedMonths[0]).toEqual({ year: 2026, month: 2 });
    });
  });

  // =========================================================================
  // getStatus — FROM_FIRST_SKIP
  // =========================================================================

  describe('getStatus — FROM_FIRST_SKIP', () => {
    const uid = 'user-1';
    const slug = 'test-sub';

    it('fresh user (no state, no firstSkipDate) → 0/4, canSkip=true', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        firstSkipDate: null, state: null,
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(0);
      expect(status.totalSkips).toBe(0);
      expect(status.canSkip).toBe(true);
    });

    it('3/4 skips used, window active → canSkip=true, 1-remaining warning', async () => {
      // Window: 2025-11-01 → 2026-11-01, today=2026-05-18 (active)
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        firstSkipDate: new Date('2025-11-01'),
        skipRecords: [
          makeRecord({ year: 2025, month: 11, windowKey: '2025-11-01', skippedAt: new Date('2025-11-10') }),
          makeRecord({ year: 2026, month: 1, windowKey: '2025-11-01', skippedAt: new Date('2026-01-10') }),
          makeRecord({ year: 2026, month: 3, windowKey: '2025-11-01', skippedAt: new Date('2026-03-10') }),
        ],
        state: { windowKey: '2025-11-01', skipsInWindow: 3, consecutiveSkips: 0, totalSkips: 3 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(3);
      expect(status.canSkip).toBe(true);
      expect(status.warnings.some((w) => w.includes('1 skip remaining'))).toBe(true);
    });

    it('4/4 skips exhausted, window active → canSkip=false', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        firstSkipDate: new Date('2025-11-01'),
        skipRecords: [
          makeRecord({ year: 2025, month: 11, windowKey: '2025-11-01' }),
          makeRecord({ year: 2026, month: 1, windowKey: '2025-11-01' }),
          makeRecord({ year: 2026, month: 2, windowKey: '2025-11-01' }),
          makeRecord({ year: 2026, month: 3, windowKey: '2025-11-01' }),
        ],
        state: { windowKey: '2025-11-01', skipsInWindow: 4, consecutiveSkips: 0, totalSkips: 4 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(4);
      expect(status.canSkip).toBe(false);
    });

    it('window expired one day ago → skipsInWindow reset to 0, canSkip=true', async () => {
      // windowKey='2024-01-10', expires 2025-01-10; today=2025-01-18 (>15 so skipWindowOpen=true)
      jest.useFakeTimers().setSystemTime(new Date('2025-01-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        firstSkipDate: new Date('2024-01-10'),
        skipRecords: [
          makeRecord({ year: 2024, month: 3, windowKey: '2024-01-10' }),
          makeRecord({ year: 2024, month: 6, windowKey: '2024-01-10' }),
          makeRecord({ year: 2024, month: 9, windowKey: '2024-01-10' }),
          makeRecord({ year: 2024, month: 12, windowKey: '2024-01-10' }),
        ],
        state: { windowKey: '2024-01-10', skipsInWindow: 4, consecutiveSkips: 0, totalSkips: 4 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(0);
      expect(status.totalSkips).toBe(4);
      expect(status.canSkip).toBe(true);
    });

    it('backfill: 3 windows over 3 years, state stale on window 2, now in window 3', async () => {
      // W1: 2023-01-05→2024-01-05 (4 skips); W2: 2024-01-05→2025-01-05 (3 skips, state.windowKey)
      // Now: 2025-06-01 (W3: 2025-01-05→2026-01-05) → stale → 0
      jest.useFakeTimers().setSystemTime(new Date('2025-06-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        firstSkipDate: new Date('2023-01-05'),
        skipRecords: [
          makeRecord({ year: 2023, month: 2, windowKey: '2023-01-05', skippedAt: new Date('2023-01-05') }),
          makeRecord({ year: 2023, month: 5, windowKey: '2023-01-05', skippedAt: new Date('2023-05-01') }),
          makeRecord({ year: 2023, month: 8, windowKey: '2023-01-05', skippedAt: new Date('2023-08-01') }),
          makeRecord({ year: 2023, month: 11, windowKey: '2023-01-05', skippedAt: new Date('2023-11-01') }),
          makeRecord({ year: 2024, month: 3, windowKey: '2024-01-05', skippedAt: new Date('2024-03-01') }),
          makeRecord({ year: 2024, month: 6, windowKey: '2024-01-05', skippedAt: new Date('2024-06-01') }),
          makeRecord({ year: 2024, month: 9, windowKey: '2024-01-05', skippedAt: new Date('2024-09-01') }),
        ],
        state: { windowKey: '2024-01-05', skipsInWindow: 3, consecutiveSkips: 0, totalSkips: 7 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(0);   // W2 expired, W3 has no skips yet
      expect(status.totalSkips).toBe(7);
      expect(status.canSkip).toBe(true);
    });

    it('permanent window (windowMonths=null) never resets — exhausted stays exhausted', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2030-01-01T00:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: null,
        firstSkipDate: new Date('2020-01-01'),
        skipRecords: [
          makeRecord({ year: 2020, month: 3, windowKey: '2020-01-01' }),
          makeRecord({ year: 2021, month: 5, windowKey: '2020-01-01' }),
          makeRecord({ year: 2022, month: 7, windowKey: '2020-01-01' }),
          makeRecord({ year: 2023, month: 9, windowKey: '2020-01-01' }),
        ],
        state: { windowKey: '2020-01-01', skipsInWindow: 4, consecutiveSkips: 0, totalSkips: 4 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(4);
      expect(status.canSkip).toBe(false);
    });

    it('window still active on last day before expiry → skipsInWindow unchanged', async () => {
      // windowKey='2025-05-17', expires 2026-05-17; today=2026-05-16 (last active day)
      jest.useFakeTimers().setSystemTime(new Date('2026-05-16T23:59:59Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        firstSkipDate: new Date('2025-05-17'),
        skipRecords: [makeRecord({ year: 2025, month: 6, windowKey: '2025-05-17' })],
        state: { windowKey: '2025-05-17', skipsInWindow: 1, consecutiveSkips: 0, totalSkips: 1 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(1);
    });

    it('state.windowKey=null (desynced): stale check skipped, skipsInWindow trusted as-is', async () => {
      // Backfill ran before windowKey was persisted → state.windowKey=null but skipsInWindow=2 is correct.
      // The stale check must NOT reset skipsInWindow to 0 in this case.
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        firstSkipDate: new Date('2025-11-01'),
        skipRecords: [
          makeRecord({ year: 2025, month: 11, windowKey: '2025-11-01' }),
          makeRecord({ year: 2026, month: 5, windowKey: '2025-11-01' }),
        ],
        state: { windowKey: null, skipsInWindow: 2, consecutiveSkips: 0, totalSkips: 2 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(2); // NOT reset to 0
      expect(status.canSkip).toBe(true);
      expect(status.totalSkips).toBe(2);
    });

    it('multi-window backfill: skippedMonths filtered to current window only', async () => {
      // W1 (2024-01-05→2025-01-05): 4 skips — expired; W2 (2025-01-05→2026-01-05): 2 skips — active
      // skippedMonths display should show only W2 skips
      jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        firstSkipDate: new Date('2024-01-05'),
        skipRecords: [
          makeRecord({ year: 2024, month: 3, windowKey: '2024-01-05', skippedAt: new Date('2024-03-05') }),
          makeRecord({ year: 2024, month: 6, windowKey: '2024-01-05', skippedAt: new Date('2024-06-05') }),
          makeRecord({ year: 2024, month: 9, windowKey: '2024-01-05', skippedAt: new Date('2024-09-05') }),
          makeRecord({ year: 2024, month: 12, windowKey: '2024-01-05', skippedAt: new Date('2024-12-05') }),
          makeRecord({ year: 2025, month: 2, windowKey: '2025-01-05', skippedAt: new Date('2025-02-05') }),
          makeRecord({ year: 2025, month: 4, windowKey: '2025-01-05', skippedAt: new Date('2025-04-05') }),
        ],
        state: { windowKey: '2025-01-05', skipsInWindow: 2, consecutiveSkips: 0, totalSkips: 6 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(2);
      expect(status.totalSkips).toBe(6);
      // Display: only W2 (2025) months, not the W1 (2024) ones
      expect(status.skippedMonths).toHaveLength(2);
      expect(status.skippedMonths).toContainEqual({ year: 2025, month: 2 });
      expect(status.skippedMonths).toContainEqual({ year: 2025, month: 4 });
      expect(status.skippedMonths).not.toContainEqual({ year: 2024, month: 3 });
    });
  });

  // =========================================================================
  // getStatus — FROM_SUB_START
  // =========================================================================

  describe('getStatus — FROM_SUB_START', () => {
    const uid = 'user-1';
    const slug = 'test-sub';

    it('first window active: shows correct skip count', async () => {
      // Sub started 2025-01-01, W1 active; 2 skips
      jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_SUB_START', maxSkips: 6, windowMonths: 12,
        startDate: '2025-01-01',
        skipRecords: [
          makeRecord({ year: 2025, month: 2, windowKey: '2025-01-01' }),
          makeRecord({ year: 2025, month: 4, windowKey: '2025-01-01' }),
        ],
        state: { windowKey: '2025-01-01', skipsInWindow: 2, consecutiveSkips: 0, totalSkips: 2 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(2);
      expect(status.canSkip).toBe(true);
    });

    it('first window exhausted → canSkip=false', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_SUB_START', maxSkips: 3, windowMonths: 12,
        startDate: '2025-01-01',
        skipRecords: [
          makeRecord({ year: 2025, month: 2, windowKey: '2025-01-01' }),
          makeRecord({ year: 2025, month: 4, windowKey: '2025-01-01' }),
          makeRecord({ year: 2025, month: 6, windowKey: '2025-01-01' }),
        ],
        state: { windowKey: '2025-01-01', skipsInWindow: 3, consecutiveSkips: 0, totalSkips: 3 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(3);
      expect(status.canSkip).toBe(false);
    });

    it('second window: stale state from W1 reset to 0', async () => {
      // Sub start 2025-01-01; now 2026-05-18 (W2: 2026-01-01→2027-01-01)
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_SUB_START', maxSkips: 6, windowMonths: 12,
        startDate: '2025-01-01',
        skipRecords: [
          makeRecord({ year: 2025, month: 3, windowKey: '2025-01-01' }),
          makeRecord({ year: 2025, month: 7, windowKey: '2025-01-01' }),
          makeRecord({ year: 2025, month: 10, windowKey: '2025-01-01' }),
        ],
        state: { windowKey: '2025-01-01', skipsInWindow: 3, consecutiveSkips: 0, totalSkips: 3 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(0);
      expect(status.totalSkips).toBe(3);
      expect(status.canSkip).toBe(true);
    });

    it('backfill: 3 years of exhausted windows, state stale, now year 4 shows 0', async () => {
      // Sub start 2023-01-01, windowMonths=12, maxSkips=3
      // W1(2023): 3 skips, W2(2024): 3 skips, W3(2025): 3 skips → total 9
      // state.windowKey='2025-01-01' (stale on 2026-05-18)
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_SUB_START', maxSkips: 3, windowMonths: 12,
        startDate: '2023-01-01',
        skipRecords: [
          makeRecord({ year: 2023, month: 3, windowKey: '2023-01-01' }),
          makeRecord({ year: 2023, month: 6, windowKey: '2023-01-01' }),
          makeRecord({ year: 2023, month: 9, windowKey: '2023-01-01' }),
          makeRecord({ year: 2024, month: 2, windowKey: '2024-01-01' }),
          makeRecord({ year: 2024, month: 5, windowKey: '2024-01-01' }),
          makeRecord({ year: 2024, month: 8, windowKey: '2024-01-01' }),
          makeRecord({ year: 2025, month: 1, windowKey: '2025-01-01' }),
          makeRecord({ year: 2025, month: 4, windowKey: '2025-01-01' }),
          makeRecord({ year: 2025, month: 7, windowKey: '2025-01-01' }),
        ],
        state: { windowKey: '2025-01-01', skipsInWindow: 3, consecutiveSkips: 0, totalSkips: 9 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(0);
      expect(status.totalSkips).toBe(9);
      expect(status.canSkip).toBe(true);
    });

    it('no windowMonths (everheart variant): permanent window never resets', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_SUB_START', maxSkips: 4, windowMonths: null,
        startDate: '2023-01-01',
        skipRecords: [
          makeRecord({ year: 2023, month: 3, windowKey: '2023-01-01' }),
          makeRecord({ year: 2024, month: 5, windowKey: '2023-01-01' }),
          makeRecord({ year: 2025, month: 7, windowKey: '2023-01-01' }),
        ],
        state: { windowKey: '2023-01-01', skipsInWindow: 3, consecutiveSkips: 0, totalSkips: 3 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(3);
      expect(status.canSkip).toBe(true); // 3 < 4
    });

    it('10-month window (book-only variant): mid-window shows correct count', async () => {
      // Sub start 2025-03-01, windowMonths=10 → W1: 2025-03-01→2026-01-01
      jest.useFakeTimers().setSystemTime(new Date('2025-09-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_SUB_START', maxSkips: 4, windowMonths: 10,
        startDate: '2025-03-01',
        skipRecords: [
          makeRecord({ year: 2025, month: 5, windowKey: '2025-03-01' }),
          makeRecord({ year: 2025, month: 7, windowKey: '2025-03-01' }),
        ],
        state: { windowKey: '2025-03-01', skipsInWindow: 2, consecutiveSkips: 0, totalSkips: 2 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(2);
      expect(status.canSkip).toBe(true);
    });
  });

  // =========================================================================
  // getStatus — UNLIMITED
  // =========================================================================

  describe('getStatus — UNLIMITED', () => {
    const uid = 'user-1';
    const slug = 'test-sub';

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-15T10:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('always canSkip=true, even with huge skip history', async () => {
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED',
        skipRecords: Array.from({ length: 50 }, (_, i) =>
          makeRecord({ year: 2020 + Math.floor(i / 12), month: (i % 12) + 1, windowKey: '2020-01-01' }),
        ),
        state: { windowKey: null, skipsInWindow: 50, consecutiveSkips: 50, totalSkips: 50 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
      expect(status.maxSkips).toBeNull();
    });

    it('no state → still canSkip=true', async () => {
      const prisma = makePrismaForGetStatus({ policyType: 'UNLIMITED', state: null });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });

    it('no warnings generated', async () => {
      const prisma = makePrismaForGetStatus({ policyType: 'UNLIMITED', state: null });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.warnings).toHaveLength(0);
    });
  });

  // =========================================================================
  // getStatus — UNLIMITED_MAX_CONSEC
  // =========================================================================

  describe('getStatus — UNLIMITED_MAX_CONSEC', () => {
    const uid = 'user-1';
    const slug = 'test-sub';

    it('no state → canSkip=true', async () => {
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED_MAX_CONSEC', maxConsecutive: 3, state: null,
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });

    it('below consecutive limit → canSkip=true, 1-remaining warning', async () => {
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED_MAX_CONSEC', maxConsecutive: 3,
        skipRecords: [
          makeRecord({ year: 2025, month: 1, windowKey: 'none', skippedAt: new Date('2025-01-10') }),
          makeRecord({ year: 2025, month: 2, windowKey: 'none', skippedAt: new Date('2025-02-10') }),
        ],
        state: { windowKey: null, skipsInWindow: 0, consecutiveSkips: 2, totalSkips: 2 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
      expect(status.warnings.some((w) => w.includes('consecutive'))).toBe(true);
    });

    it('at consecutive limit → canSkip=false', async () => {
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED_MAX_CONSEC', maxConsecutive: 3,
        skipRecords: [
          makeRecord({ year: 2025, month: 1, windowKey: 'none', skippedAt: new Date('2025-01-10') }),
          makeRecord({ year: 2025, month: 2, windowKey: 'none', skippedAt: new Date('2025-02-10') }),
          makeRecord({ year: 2025, month: 3, windowKey: 'none', skippedAt: new Date('2025-03-10') }),
        ],
        state: { windowKey: null, skipsInWindow: 0, consecutiveSkips: 3, totalSkips: 3 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(false);
    });

    it('high total skips but consecutive=1 (gap reset) → canSkip=true', async () => {
      // Many old skips, but most recent two are non-adjacent (gap) → live streak = 1
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED_MAX_CONSEC', maxConsecutive: 3,
        skipRecords: [
          makeRecord({ year: 2024, month: 3, windowKey: 'none', skippedAt: new Date('2024-03-10') }),
          makeRecord({ year: 2024, month: 6, windowKey: 'none', skippedAt: new Date('2024-06-10') }), // gap before
          makeRecord({ year: 2025, month: 2, windowKey: 'none', skippedAt: new Date('2025-02-10') }), // gap resets streak
        ],
        state: { windowKey: null, skipsInWindow: 0, consecutiveSkips: 1, totalSkips: 20 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.consecutiveSkips).toBe(1);
      expect(status.canSkip).toBe(true);
    });

    it('null maxConsecutive → unlimited consecutive, canSkip=true always', async () => {
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED_MAX_CONSEC', maxConsecutive: null,
        state: { windowKey: null, skipsInWindow: 0, consecutiveSkips: 999, totalSkips: 999 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });
  });

  // =========================================================================
  // getStatus — combo FROM_FIRST_SKIP aggregation
  // =========================================================================

  describe('getStatus — combo FROM_FIRST_SKIP aggregation', () => {
    const uid = 'user-1';
    const slug = 'combo-sub';

    const compEntry1 = { id: 'comp-e1', firstSkipDate: new Date('2024-11-01') };
    const compEntry2 = { id: 'comp-e2', firstSkipDate: new Date('2024-11-01') };

    it('no state, 3 component skips in current window → shows 3/4', async () => {
      // Window: 2024-11-01→2025-11-01, today=2025-05-18 (active)
      jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        isCombo: true, componentIds: ['comp-sub-1', 'comp-sub-2'],
        skipRecords: [], firstSkipDate: null, state: null,
        componentEntries: [compEntry1, compEntry2],
        componentSkipRecords: [
          makeRecord({ year: 2024, month: 11, windowKey: '2024-11-01', skippedAt: new Date('2024-11-10') }),
          makeRecord({ year: 2025, month: 2, windowKey: '2024-11-01', skippedAt: new Date('2025-02-10') }),
          makeRecord({ year: 2025, month: 4, windowKey: '2024-11-01', skippedAt: new Date('2025-04-10') }),
        ],
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(3);
      expect(status.skippedMonths).toHaveLength(3);
      expect(status.canSkip).toBe(true);
    });

    it('no state, 4 component skips in current window → exhausted, canSkip=false', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        isCombo: true, componentIds: ['comp-sub-1'],
        skipRecords: [], firstSkipDate: null, state: null,
        componentEntries: [compEntry1],
        componentSkipRecords: [
          makeRecord({ year: 2024, month: 11, windowKey: '2024-11-01', skippedAt: new Date('2024-11-10') }),
          makeRecord({ year: 2025, month: 1, windowKey: '2024-11-01', skippedAt: new Date('2025-01-10') }),
          makeRecord({ year: 2025, month: 3, windowKey: '2024-11-01', skippedAt: new Date('2025-03-10') }),
          makeRecord({ year: 2025, month: 5, windowKey: '2024-11-01', skippedAt: new Date('2025-05-10') }),
        ],
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(4);
      expect(status.canSkip).toBe(false);
    });

    it('component skips all in expired window → current window shows 0', async () => {
      // Component first skip: 2024-01-01. W1: 2024-01-01→2025-01-01 (expired)
      // Today: 2025-05-18 (W2: 2025-01-01→2026-01-01). No W2 skips.
      jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        isCombo: true, componentIds: ['comp-sub-1'],
        skipRecords: [], firstSkipDate: null, state: null,
        componentEntries: [{ id: 'comp-e1', firstSkipDate: new Date('2024-01-01') }],
        componentSkipRecords: [
          makeRecord({ year: 2024, month: 3, windowKey: '2024-01-01', skippedAt: new Date('2024-03-01') }),
          makeRecord({ year: 2024, month: 6, windowKey: '2024-01-01', skippedAt: new Date('2024-06-01') }),
          makeRecord({ year: 2024, month: 9, windowKey: '2024-01-01', skippedAt: new Date('2024-09-01') }),
        ],
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(0);
      expect(status.totalSkips).toBe(3);
      expect(status.canSkip).toBe(true);
    });

    it('backfill: 4 skips in W1 (expired) + 2 in W2 (active) → shows 2/4', async () => {
      // W1: 2024-01-05→2025-01-05 (4 skips); W2: 2025-01-05→2026-01-05 (2 skips)
      // Today: 2025-05-18 (W2 active)
      jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        isCombo: true, componentIds: ['comp-sub-1'],
        skipRecords: [], firstSkipDate: null, state: null,
        componentEntries: [{ id: 'comp-e1', firstSkipDate: new Date('2024-01-05') }],
        componentSkipRecords: [
          makeRecord({ year: 2024, month: 2, windowKey: '2024-01-05', skippedAt: new Date('2024-01-05') }),
          makeRecord({ year: 2024, month: 5, windowKey: '2024-01-05', skippedAt: new Date('2024-05-01') }),
          makeRecord({ year: 2024, month: 8, windowKey: '2024-01-05', skippedAt: new Date('2024-08-01') }),
          makeRecord({ year: 2024, month: 11, windowKey: '2024-01-05', skippedAt: new Date('2024-11-01') }),
          makeRecord({ year: 2025, month: 2, windowKey: '2025-01-05', skippedAt: new Date('2025-02-01') }),
          makeRecord({ year: 2025, month: 4, windowKey: '2025-01-05', skippedAt: new Date('2025-04-01') }),
        ],
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(2);
      expect(status.totalSkips).toBe(6);
      expect(status.canSkip).toBe(true);
    });

    it('combo + direct entry skips: same month deduped, extra month merged', async () => {
      // Combo entry has 1 skip (Jan 2025). Component also has Jan 2025 (deduped) + Mar 2025 (new).
      jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        isCombo: true, componentIds: ['comp-sub-1'],
        skipRecords: [
          makeRecord({ year: 2025, month: 1, windowKey: '2025-01-01', skippedAt: new Date('2025-01-10') }),
        ],
        firstSkipDate: new Date('2025-01-10'),
        state: { windowKey: '2025-01-01', skipsInWindow: 1, consecutiveSkips: 0, totalSkips: 1 },
        componentEntries: [{ id: 'comp-e1', firstSkipDate: new Date('2025-01-10') }],
        componentSkipRecords: [
          // Jan 2025 = duplicate of combo direct skip → should be deduped
          makeRecord({ year: 2025, month: 1, windowKey: '2025-01-01', skippedAt: new Date('2025-01-10') }),
          makeRecord({ year: 2025, month: 3, windowKey: '2025-01-01', skippedAt: new Date('2025-03-10') }),
        ],
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      // skippedMonths = Jan 2025 (1 entry, deduped) + Mar 2025 = 2
      expect(status.skippedMonths).toHaveLength(2);
      // state exists → effectiveState = state (skipsInWindow=1 from state)
      expect(status.skipsInWindow).toBe(1);
    });

    it('no component IDs → falls back to combo entry records only', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        isCombo: true, componentIds: [], // empty — no aggregation
        skipRecords: [
          makeRecord({ year: 2025, month: 2, windowKey: '2025-01-01' }),
        ],
        firstSkipDate: new Date('2025-01-01'),
        state: { windowKey: '2025-01-01', skipsInWindow: 1, consecutiveSkips: 0, totalSkips: 1 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(1);
    });

    it('no state, 2 windows: skippedMonths shows only current-window months', async () => {
      // W1 (2024-01-05→2025-01-05): 3 skips — expired; W2 (2025-01-05→2026-01-05): 2 skips — active
      jest.useFakeTimers().setSystemTime(new Date('2025-05-18T10:00:00Z'));
      const prisma = makePrismaForGetStatus({
        policyType: 'FROM_FIRST_SKIP', maxSkips: 4, windowMonths: 12,
        isCombo: true, componentIds: ['comp-sub-1'],
        skipRecords: [], firstSkipDate: null, state: null,
        componentEntries: [{ id: 'comp-e1', firstSkipDate: new Date('2024-01-05') }],
        componentSkipRecords: [
          makeRecord({ year: 2024, month: 3, windowKey: '2024-01-05', skippedAt: new Date('2024-03-05') }),
          makeRecord({ year: 2024, month: 7, windowKey: '2024-01-05', skippedAt: new Date('2024-07-05') }),
          makeRecord({ year: 2024, month: 11, windowKey: '2024-01-05', skippedAt: new Date('2024-11-05') }),
          makeRecord({ year: 2025, month: 2, windowKey: '2025-01-05', skippedAt: new Date('2025-02-05') }),
          makeRecord({ year: 2025, month: 4, windowKey: '2025-01-05', skippedAt: new Date('2025-04-05') }),
        ],
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.skipsInWindow).toBe(2);
      expect(status.totalSkips).toBe(5);
      // Only W2 months shown in display (W1 is expired)
      expect(status.skippedMonths).toHaveLength(2);
      expect(status.skippedMonths).toContainEqual({ year: 2025, month: 2 });
      expect(status.skippedMonths).toContainEqual({ year: 2025, month: 4 });
    });
  });

  // =========================================================================
  // getStatus — NONE policy
  // =========================================================================

  describe('getStatus — NONE policy', () => {
    it('canSkip=false, policyType=NONE regardless of history', async () => {
      const prisma = makePrismaForGetStatus({
        policyType: 'NONE', state: null,
      });
      const status = await new SkipPolicyEngine(prisma).getStatus('user-1', 'test-sub');
      expect(status.policyType).toBe('NONE');
      expect(status.canSkip).toBe(false);
    });
  });

  // =========================================================================
  // recomputeState — state reconstruction from skip records
  // =========================================================================

  describe('recomputeState', () => {
    const invoke = async (records: ReturnType<typeof makeRecord>[], policy?: any) => {
      const prisma = makePrismaForRecompute(records);
      const eng = new SkipPolicyEngine(prisma);
      await (eng as any).recomputeState('user-1', 'sub-1', policy ?? { type: 'FROM_FIRST_SKIP', windowMonths: 12 });
      return getUpsertUpdate(prisma);
    };

    const invokeCreate = async (records: ReturnType<typeof makeRecord>[], policy?: any) => {
      const prisma = makePrismaForRecompute(records);
      const eng = new SkipPolicyEngine(prisma);
      await (eng as any).recomputeState('user-1', 'sub-1', policy ?? { type: 'FROM_FIRST_SKIP', windowMonths: 12 });
      return getUpsertCreate(prisma);
    };

    it('zero records → resets all counters to 0', async () => {
      const update = await invoke([]);
      expect(update.totalSkips).toBe(0);
      expect(update.skipsInWindow).toBe(0);
      expect(update.consecutiveSkips).toBe(0);
    });

    it('single record → total=1, window=1, consecutive=1', async () => {
      const update = await invoke([makeRecord({ year: 2025, month: 3, windowKey: '2025-01-01' })]);
      expect(update.totalSkips).toBe(1);
      expect(update.skipsInWindow).toBe(1);
      expect(update.consecutiveSkips).toBe(1);
    });

    it('3 records same windowKey → skipsInWindow=3', async () => {
      const update = await invoke([
        makeRecord({ year: 2025, month: 2, windowKey: '2025-01-01', skippedAt: new Date('2025-02-01') }),
        makeRecord({ year: 2025, month: 5, windowKey: '2025-01-01', skippedAt: new Date('2025-05-01') }),
        makeRecord({ year: 2025, month: 8, windowKey: '2025-01-01', skippedAt: new Date('2025-08-01') }),
      ]);
      expect(update.totalSkips).toBe(3);
      expect(update.skipsInWindow).toBe(3);
      expect(update.windowKey).toBe('2025-01-01');
    });

    // ── Multi-window backfill ─────────────────────────────────────────────────

    it('backfill: 4 skips in W1 + 2 in W2 → skipsInWindow=2 (latest key)', async () => {
      const update = await invoke([
        makeRecord({ year: 2024, month: 3, windowKey: '2024-01-01', skippedAt: new Date('2024-03-01') }),
        makeRecord({ year: 2024, month: 6, windowKey: '2024-01-01', skippedAt: new Date('2024-06-01') }),
        makeRecord({ year: 2024, month: 9, windowKey: '2024-01-01', skippedAt: new Date('2024-09-01') }),
        makeRecord({ year: 2024, month: 12, windowKey: '2024-01-01', skippedAt: new Date('2024-12-01') }),
        makeRecord({ year: 2025, month: 2, windowKey: '2025-01-05', skippedAt: new Date('2025-02-01') }),
        makeRecord({ year: 2025, month: 5, windowKey: '2025-01-05', skippedAt: new Date('2025-05-01') }),
      ]);
      expect(update.totalSkips).toBe(6);
      expect(update.skipsInWindow).toBe(2);
      expect(update.windowKey).toBe('2025-01-05');
    });

    it('backfill: 3 years of mixed windows → groups by latest windowKey', async () => {
      // W1(2023): 3 skips; W2(2024): 3 skips; W3(2025): 1 skip (latest)
      const update = await invoke([
        makeRecord({ year: 2023, month: 3, windowKey: '2023-01-01', skippedAt: new Date('2023-03-01') }),
        makeRecord({ year: 2023, month: 7, windowKey: '2023-01-01', skippedAt: new Date('2023-07-01') }),
        makeRecord({ year: 2023, month: 11, windowKey: '2023-01-01', skippedAt: new Date('2023-11-01') }),
        makeRecord({ year: 2024, month: 4, windowKey: '2024-01-01', skippedAt: new Date('2024-04-01') }),
        makeRecord({ year: 2024, month: 8, windowKey: '2024-01-01', skippedAt: new Date('2024-08-01') }),
        makeRecord({ year: 2024, month: 12, windowKey: '2024-01-01', skippedAt: new Date('2024-12-01') }),
        makeRecord({ year: 2025, month: 3, windowKey: '2025-01-01', skippedAt: new Date('2025-03-01') }),
      ]);
      expect(update.totalSkips).toBe(7);
      expect(update.skipsInWindow).toBe(1);
      expect(update.windowKey).toBe('2025-01-01');
    });

    // ── Series counting ──────────────────────────────────────────────────────

    it('SERIES_AS_ONE: 3 records same seriesId → logical count = 1', async () => {
      const update = await invoke([
        makeRecord({ year: 2025, month: 3, windowKey: '2025-01-01', seriesId: 'ser-1', seriesSkipMode: 'SERIES_AS_ONE' }),
        makeRecord({ year: 2025, month: 4, windowKey: '2025-01-01', seriesId: 'ser-1', seriesSkipMode: 'SERIES_AS_ONE' }),
        makeRecord({ year: 2025, month: 5, windowKey: '2025-01-01', seriesId: 'ser-1', seriesSkipMode: 'SERIES_AS_ONE' }),
      ]);
      expect(update.totalSkips).toBe(1);
      expect(update.skipsInWindow).toBe(1);
    });

    it('SERIES_ONLY (legacy): 2 records same series → logical count = 1', async () => {
      const update = await invoke([
        makeRecord({ year: 2025, month: 3, windowKey: '2025-01-01', seriesId: 'ser-1', seriesSkipMode: 'SERIES_ONLY' }),
        makeRecord({ year: 2025, month: 4, windowKey: '2025-01-01', seriesId: 'ser-1', seriesSkipMode: 'SERIES_ONLY' }),
      ]);
      expect(update.totalSkips).toBe(1);
    });

    it('SERIES_AS_MANY: 3 records same series → logical count = 3', async () => {
      const update = await invoke([
        makeRecord({ year: 2025, month: 3, windowKey: '2025-01-01', seriesId: 'ser-1', seriesSkipMode: 'SERIES_AS_MANY' }),
        makeRecord({ year: 2025, month: 4, windowKey: '2025-01-01', seriesId: 'ser-1', seriesSkipMode: 'SERIES_AS_MANY' }),
        makeRecord({ year: 2025, month: 5, windowKey: '2025-01-01', seriesId: 'ser-1', seriesSkipMode: 'SERIES_AS_MANY' }),
      ]);
      expect(update.totalSkips).toBe(3);
    });

    it('mix: SERIES_AS_ONE (2 months) + 2 individual = 3 logical skips', async () => {
      const update = await invoke([
        makeRecord({ year: 2025, month: 1, windowKey: '2025-01-01', seriesId: 'ser-1', seriesSkipMode: 'SERIES_AS_ONE' }),
        makeRecord({ year: 2025, month: 2, windowKey: '2025-01-01', seriesId: 'ser-1', seriesSkipMode: 'SERIES_AS_ONE' }),
        makeRecord({ year: 2025, month: 4, windowKey: '2025-01-01' }),
        makeRecord({ year: 2025, month: 6, windowKey: '2025-01-01' }),
      ]);
      expect(update.totalSkips).toBe(3);
      expect(update.skipsInWindow).toBe(3);
    });

    it('two separate SERIES_AS_ONE series → each counts as 1 (total = 2)', async () => {
      const update = await invoke([
        makeRecord({ year: 2025, month: 1, windowKey: '2025-01-01', seriesId: 'ser-A', seriesSkipMode: 'SERIES_AS_ONE' }),
        makeRecord({ year: 2025, month: 2, windowKey: '2025-01-01', seriesId: 'ser-A', seriesSkipMode: 'SERIES_AS_ONE' }),
        makeRecord({ year: 2025, month: 4, windowKey: '2025-01-01', seriesId: 'ser-B', seriesSkipMode: 'SERIES_AS_ONE' }),
        makeRecord({ year: 2025, month: 5, windowKey: '2025-01-01', seriesId: 'ser-B', seriesSkipMode: 'SERIES_AS_ONE' }),
      ]);
      expect(update.totalSkips).toBe(2);
    });

    // ── Consecutive counting ─────────────────────────────────────────────────

    it('3 consecutive months → consecutiveSkips=3', async () => {
      const update = await invoke([
        makeRecord({ year: 2025, month: 3, windowKey: '2025-01-01', skippedAt: new Date('2025-03-01') }),
        makeRecord({ year: 2025, month: 4, windowKey: '2025-01-01', skippedAt: new Date('2025-04-01') }),
        makeRecord({ year: 2025, month: 5, windowKey: '2025-01-01', skippedAt: new Date('2025-05-01') }),
      ]);
      expect(update.consecutiveSkips).toBe(3);
    });

    it('gap in the middle: Jan Feb [gap] Apr May → consecutive=2 (from most-recent run)', async () => {
      const update = await invoke([
        makeRecord({ year: 2025, month: 1, windowKey: '2025-01-01', skippedAt: new Date('2025-01-01') }),
        makeRecord({ year: 2025, month: 2, windowKey: '2025-01-01', skippedAt: new Date('2025-02-01') }),
        // no March
        makeRecord({ year: 2025, month: 4, windowKey: '2025-01-01', skippedAt: new Date('2025-04-01') }),
        makeRecord({ year: 2025, month: 5, windowKey: '2025-01-01', skippedAt: new Date('2025-05-01') }),
      ]);
      expect(update.consecutiveSkips).toBe(2);
    });

    it('year-boundary consecutive: Dec 2024 + Jan 2025 → consecutiveSkips=2', async () => {
      const update = await invoke([
        makeRecord({ year: 2024, month: 12, windowKey: '2024-01-01', skippedAt: new Date('2024-12-01') }),
        makeRecord({ year: 2025, month: 1, windowKey: '2024-01-01', skippedAt: new Date('2025-01-01') }),
      ]);
      expect(update.consecutiveSkips).toBe(2);
    });

    it('non-consecutive isolated skips → consecutiveSkips=1', async () => {
      const update = await invoke([
        makeRecord({ year: 2024, month: 1, windowKey: '2024-01-01', skippedAt: new Date('2024-01-01') }),
        makeRecord({ year: 2024, month: 6, windowKey: '2024-01-01', skippedAt: new Date('2024-06-01') }),
        makeRecord({ year: 2025, month: 3, windowKey: '2025-01-01', skippedAt: new Date('2025-03-01') }),
      ]);
      expect(update.consecutiveSkips).toBe(1);
    });

    it('massive backfill: 36 monthly skips across 3 full years → total=36, consecutive=36', async () => {
      const records: ReturnType<typeof makeRecord>[] = [];
      for (let y = 2023; y <= 2025; y++) {
        for (let m = 1; m <= 12; m++) {
          records.push(makeRecord({
            year: y, month: m, windowKey: `${y}-01-01`,
            skippedAt: new Date(`${y}-${String(m).padStart(2, '0')}-10T10:00:00Z`),
          }));
        }
      }
      const update = await invoke(records);
      expect(update.totalSkips).toBe(36);
      expect(update.consecutiveSkips).toBe(36);
      // Latest windowKey='2025-01-01', months Jan–Dec 2025 = 12 records
      expect(update.skipsInWindow).toBe(12);
      expect(update.windowKey).toBe('2025-01-01');
    });

    // ── create payload (upsert.create) ───────────────────────────────────────

    it('create payload: zero records → windowKey=null', async () => {
      const create = await invokeCreate([]);
      expect(create.windowKey).toBeNull();
    });

    it('create payload: non-zero records → windowKey matches latest window', async () => {
      const create = await invokeCreate([
        makeRecord({ year: 2025, month: 3, windowKey: '2025-01-01', skippedAt: new Date('2025-03-01') }),
        makeRecord({ year: 2025, month: 5, windowKey: '2025-01-01', skippedAt: new Date('2025-05-01') }),
      ]);
      expect(create.windowKey).toBe('2025-01-01');
    });

    it('create payload: multi-window → windowKey is the LATEST window key', async () => {
      const create = await invokeCreate([
        makeRecord({ year: 2024, month: 3, windowKey: '2024-01-01', skippedAt: new Date('2024-03-01') }),
        makeRecord({ year: 2025, month: 2, windowKey: '2025-01-01', skippedAt: new Date('2025-02-01') }),
      ]);
      expect(create.windowKey).toBe('2025-01-01');
    });
  });

  // =========================================================================
  // getStatus — unskip deadline: only show when still actionable
  // =========================================================================

  describe('getStatus — unskip deadline (most recent skip, deadline not yet passed)', () => {
    const uid = 'user-1';
    const slug = 'test-sub';

    /** Build a subscription with renewalDay=5 so computeUnskipDeadline has a concrete date. */
    function makePrismaWithRenewalDay(
      skipRecords: ReturnType<typeof makeRecord>[],
      state: { windowKey: string | null; skipsInWindow: number; consecutiveSkips: number; totalSkips: number } | null,
    ): PrismaService {
      const policy = {
        type: 'UNLIMITED',
        billingType: 'ALL',
        maxSkips: null,
        maxConsecutive: null,
        windowMonths: null,
        allowUnskip: true,
        notes: null,
        skipHow: null,
        unskipHow: 'Email support',
        unskipNotes: null,
        skipDeadlineDaysBefore: 3,
        unskipDeadlineDaysBefore: 0,
      };
      const subscription = {
        id: 'sub-1',
        slug,
        renewalDay: 5,
        renewalMonthOffset: 0,
        isCombo: false,
        paymentOnStartup: false,
        signupIncludesCurrentMonth: false,
        startDate: null,
        skipPolicies: [policy],
        comboComponents: [],
        userEntries: [
          {
            id: 'entry-1',
            userId: uid,
            subscriptionId: 'sub-1',
            firstSkipDate: null,
            startDate: '2024-01-01',
            renewalDay: 5,
            prepaidMonths: 1,
            skipRecords,
          },
        ],
      };
      return {
        subscription: { findUnique: jest.fn().mockResolvedValue(subscription) },
        userSubscriptionSkipState: { findUnique: jest.fn().mockResolvedValue(state) },
        userSubscriptionEntry: {
          findUnique: jest.fn().mockResolvedValue({ id: 'entry-1' }),
          findFirst: jest.fn().mockResolvedValue({ id: 'entry-1' }),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
        },
        userSkipRecord: {
          findMany: jest.fn().mockResolvedValue([]),
          upsert: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn().mockResolvedValue(null),
        },
        subscriptionMonth: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([{ id: 'sm-future', year: 9999, month: 6, seriesId: null, series: null }]),
          findUnique: jest.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaService;
    }

    it('most recent skip has future unskip deadline → nextUnskipDeadline is non-null', async () => {
      // Today: 2026-07-06. Skip for Aug 2026, renewalDay=5, offset=0.
      // Unskip deadline = Aug 5 2026 at 23:59:59 → future → should be non-null.
      jest.useFakeTimers().setSystemTime(new Date('2026-07-06T10:00:00Z'));
      const records = [
        makeRecord({ year: 2026, month: 8, windowKey: '2026', skippedAt: new Date('2026-07-01') }),
      ];
      const prisma = makePrismaWithRenewalDay(records, { windowKey: '2026', skipsInWindow: 1, consecutiveSkips: 1, totalSkips: 1 });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.nextUnskipDeadline).not.toBeNull();
      expect(status.isUnskipPastDeadline).toBe(false);
    });

    it('most recent skip has already-passed unskip deadline → nextUnskipDeadline is null', async () => {
      // Today: 2026-07-06. Skip for May 2026, renewalDay=5, offset=0.
      // Unskip deadline = May 5 2026 (past) → should be null, isUnskipPastDeadline stays false.
      jest.useFakeTimers().setSystemTime(new Date('2026-07-06T10:00:00Z'));
      const records = [
        makeRecord({ year: 2025, month: 11, windowKey: '2025', skippedAt: new Date('2025-11-01') }),
        makeRecord({ year: 2026, month: 5, windowKey: '2026', skippedAt: new Date('2026-05-01') }),
      ];
      const prisma = makePrismaWithRenewalDay(records, { windowKey: '2026', skipsInWindow: 1, consecutiveSkips: 1, totalSkips: 2 });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.nextUnskipDeadline).toBeNull();
      expect(status.isUnskipPastDeadline).toBe(false);
    });

    it('earliest skip deadline passed but latest skip deadline is future → shows latest', async () => {
      // Nov 2025 skip: deadline Nov 5 2025 (past). Aug 2026 skip: deadline Aug 5 2026 (future).
      jest.useFakeTimers().setSystemTime(new Date('2026-07-06T10:00:00Z'));
      const records = [
        makeRecord({ year: 2025, month: 11, windowKey: '2025', skippedAt: new Date('2025-11-01') }),
        makeRecord({ year: 2026, month: 8, windowKey: '2026', skippedAt: new Date('2026-07-01') }),
      ];
      const prisma = makePrismaWithRenewalDay(records, { windowKey: '2026', skipsInWindow: 1, consecutiveSkips: 1, totalSkips: 2 });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.nextUnskipDeadline).not.toBeNull();
      // Deadline for Aug 2026 = Aug 5 2026 → month index 7 (0-based)
      expect(new Date(status.nextUnskipDeadline!).getMonth()).toBe(7);
    });
  });

  // =========================================================================
  // getStatus — consecutive skips: live computation overrides stale DB value
  // =========================================================================

  describe('getStatus — consecutive skips live computation', () => {
    const uid = 'user-1';
    const slug = 'test-sub';

    it('DB has stale high consecutiveSkips but records show streak broken → uses live count', async () => {
      // Skips: Mar 2025, Apr 2025, (gap: May renewed), Jun 2025, Jul 2025
      // Consecutive streak at end = 2 (Jun+Jul). DB stale value = 4.
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T10:00:00Z'));
      const skipRecords = [
        makeRecord({ year: 2025, month: 3, windowKey: '2025', skippedAt: new Date('2025-03-01') }),
        makeRecord({ year: 2025, month: 4, windowKey: '2025', skippedAt: new Date('2025-04-01') }),
        makeRecord({ year: 2025, month: 6, windowKey: '2025', skippedAt: new Date('2025-06-01') }),
        makeRecord({ year: 2025, month: 7, windowKey: '2025', skippedAt: new Date('2025-07-01') }),
      ];
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED_MAX_CONSEC',
        maxConsecutive: 5,
        skipRecords,
        firstSkipDate: new Date('2025-03-01'),
        state: { windowKey: '2025', skipsInWindow: 4, consecutiveSkips: 4, totalSkips: 4 }, // stale: says 4
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      // Live walk-back: Jul←Jun consecutive, Jun←May gap (May not skipped) → streak = 2
      expect(status.consecutiveSkips).toBe(2);
      // maxConsecutive=5, live streak=2 → should still be able to skip, no cancel warning
      expect(status.canSkip).toBe(true);
      expect(status.warnings.some((w) => w.includes('cancel'))).toBe(false);
    });

    it('DB has consecutiveSkips=0 but records show active streak → uses live count', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T10:00:00Z'));
      const skipRecords = [
        makeRecord({ year: 2025, month: 10, windowKey: '2025', skippedAt: new Date('2025-10-01') }),
        makeRecord({ year: 2025, month: 11, windowKey: '2025', skippedAt: new Date('2025-11-01') }),
        makeRecord({ year: 2025, month: 12, windowKey: '2025', skippedAt: new Date('2025-12-01') }),
      ];
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED_MAX_CONSEC',
        maxConsecutive: 5,
        skipRecords,
        firstSkipDate: new Date('2025-10-01'),
        state: { windowKey: '2025', skipsInWindow: 3, consecutiveSkips: 0, totalSkips: 3 }, // stale: says 0
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.consecutiveSkips).toBe(3);
    });

    it('no gap → full streak length used for canSkip evaluation', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T10:00:00Z'));
      const skipRecords = [
        makeRecord({ year: 2025, month: 10, windowKey: '2025', skippedAt: new Date('2025-10-01') }),
        makeRecord({ year: 2025, month: 11, windowKey: '2025', skippedAt: new Date('2025-11-01') }),
        makeRecord({ year: 2025, month: 12, windowKey: '2025', skippedAt: new Date('2025-12-01') }),
      ];
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED_MAX_CONSEC',
        maxConsecutive: 3,
        skipRecords,
        firstSkipDate: new Date('2025-10-01'),
        state: { windowKey: '2025', skipsInWindow: 3, consecutiveSkips: 1, totalSkips: 3 }, // stale: says 1
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      // Live streak = 3, maxConsecutive = 3 → cannot skip
      expect(status.consecutiveSkips).toBe(3);
      expect(status.canSkip).toBe(false);
    });

    // Regression: a renewal (i.e. a decided month with no skip record) after the last skip
    // must reset the streak to 0, even though no explicit "renewal" record exists to break the
    // month-to-month adjacency chain. Requires a configured renewalDay to know which months are
    // already decided vs. still open (see `renewalDay` guard in getStatus).
    it('renewalDay configured, user renewed since last skip → streak resets to 0, no cancel warning', async () => {
      // Skips: Mar, Apr, May 2026 (hit maxConsecutive=3 previously). Then renewed Jun, Jul 2026.
      // Today: Aug 10 2026 (past renewalDay=5) → Jun, Jul, and Aug are all already-decided months
      // with no skip record → the old streak must not carry forward.
      jest.useFakeTimers().setSystemTime(new Date('2026-08-10T10:00:00Z'));
      const skipRecords = [
        makeRecord({ year: 2026, month: 3, windowKey: 'none', skippedAt: new Date('2026-03-10') }),
        makeRecord({ year: 2026, month: 4, windowKey: 'none', skippedAt: new Date('2026-04-10') }),
        makeRecord({ year: 2026, month: 5, windowKey: 'none', skippedAt: new Date('2026-05-10') }),
      ];
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED_MAX_CONSEC',
        maxConsecutive: 3,
        renewalDay: 5,
        skipRecords,
        firstSkipDate: new Date('2026-03-01'),
        state: { windowKey: 'none', skipsInWindow: 3, consecutiveSkips: 3, totalSkips: 3 }, // stale: still says 3
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.consecutiveSkips).toBe(0);
      expect(status.canSkip).toBe(true);
      expect(status.warnings.some((w) => w.includes('cancel'))).toBe(false);
    });

    it('renewalDay configured, last skip is the most recently decided month → streak still active', async () => {
      // Skips: Jun, Jul 2026 (consecutive). Today: Aug 3 2026, before renewalDay=5, so August's
      // window is still open and July is the most recently decided month → streak stays live.
      jest.useFakeTimers().setSystemTime(new Date('2026-08-03T10:00:00Z'));
      const skipRecords = [
        makeRecord({ year: 2026, month: 6, windowKey: 'none', skippedAt: new Date('2026-06-10') }),
        makeRecord({ year: 2026, month: 7, windowKey: 'none', skippedAt: new Date('2026-07-10') }),
      ];
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED_MAX_CONSEC',
        maxConsecutive: 3,
        renewalDay: 5,
        skipRecords,
        firstSkipDate: new Date('2026-06-01'),
        state: { windowKey: 'none', skipsInWindow: 2, consecutiveSkips: 2, totalSkips: 2 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.consecutiveSkips).toBe(2);
      expect(status.canSkip).toBe(true);
      expect(status.warnings.some((w) => w.includes('consecutive'))).toBe(true);
    });

    it('renewalDay configured, single renewal since last skip already breaks the streak', async () => {
      // Skip: only May 2026. Renewed Jun 2026. Today: Jul 10 2026 (past renewalDay=5) → June
      // and July are decided with no skip record → streak must be 0, not the stale DB value.
      jest.useFakeTimers().setSystemTime(new Date('2026-07-10T10:00:00Z'));
      const skipRecords = [
        makeRecord({ year: 2026, month: 5, windowKey: 'none', skippedAt: new Date('2026-05-10') }),
      ];
      const prisma = makePrismaForGetStatus({
        policyType: 'UNLIMITED_MAX_CONSEC',
        maxConsecutive: 3,
        renewalDay: 5,
        skipRecords,
        firstSkipDate: new Date('2026-05-01'),
        state: { windowKey: 'none', skipsInWindow: 1, consecutiveSkips: 1, totalSkips: 1 },
      });
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.consecutiveSkips).toBe(0);
    });
  });
});
