/**
 * Tests for series-based skip blocking in SkipPolicyEngine.getStatus.
 *
 * Covers:
 *  - NO_SKIP series → canSkip=false, warning present
 *  - NO_SKIP series with a later standalone month → canSkip=true
 *  - SERIES_AS_ONE / SERIES_ONLY / SERIES_AS_MANY already in progress → canSkip=false
 *  - SERIES_AS_ONE not yet started (first month === candidateMonth) → canSkip=true
 *  - In-progress series with a later standalone month → canSkip=true
 */

import { SkipPolicyEngine } from './skip-policy.engine';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type UpcomingMonth = {
  id: string;
  year: number;
  month: number;
  seriesId: string | null;
  series: { skipMode: string; months: Array<{ year: number; month: number }> } | null;
};

function month(
  year: number,
  m: number,
  series: { id: string; skipMode: string; firstMonth: { year: number; month: number } } | null = null,
): UpcomingMonth {
  return {
    id: `sm-${year}-${m}`,
    year,
    month: m,
    seriesId: series?.id ?? null,
    series: series
      ? { skipMode: series.skipMode, months: [series.firstMonth] }
      : null,
  };
}

function makePrisma(upcomingMonths: UpcomingMonth[]): PrismaService {
  const policy = {
    type: 'UNLIMITED',
    billingType: 'ALL',
    maxSkips: null,
    maxConsecutive: null,
    windowMonths: null,
    allowUnskip: false,
    notes: null,
    skipHow: null,
    unskipHow: null,
    unskipNotes: null,
    skipDeadlineDaysBefore: 3,
    unskipDeadlineDaysBefore: 0,
  };

  const subscription = {
    id: 'sub-1',
    slug: 'test-sub',
    renewalDay: null,
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
        userId: 'user-1',
        subscriptionId: 'sub-1',
        firstSkipDate: null,
        startDate: '2024-01-01',
        renewalDay: null,
        prepaidMonths: 1,
        skipRecords: [],
      },
    ],
  };

  return {
    subscription: { findUnique: jest.fn().mockResolvedValue(subscription) },
    userSubscriptionSkipState: { findUnique: jest.fn().mockResolvedValue(null) },
    userSubscriptionEntry: {
      findUnique: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    userSkipRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    subscriptionMonth: {
      // findFirst → null disables first-box protection (not under test here)
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(upcomingMonths),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaService;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('SkipPolicyEngine — series-based skip blocking', () => {
  // Fixed date: 2026-06-15, renewalDay=null → candidateMonth = July 2026 (next calendar month)
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const uid = 'user-1';
  const slug = 'test-sub';

  // ── NO_SKIP series ─────────────────────────────────────────────────────────

  describe('NO_SKIP series', () => {
    it('canSkip=false when the only upcoming month is in a NO_SKIP series', async () => {
      const prisma = makePrisma([
        month(2026, 7, { id: 's1', skipMode: 'NO_SKIP', firstMonth: { year: 2026, month: 7 } }),
        month(2026, 8, { id: 's1', skipMode: 'NO_SKIP', firstMonth: { year: 2026, month: 7 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(false);
    });

    it('warning is present when blocked by NO_SKIP series', async () => {
      const prisma = makePrisma([
        month(2026, 7, { id: 's1', skipMode: 'NO_SKIP', firstMonth: { year: 2026, month: 7 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.warnings.some((w) => /series.*does not allow skips/i.test(w))).toBe(true);
    });

    it('canSkip=true when NO_SKIP series months come first but a standalone month follows', async () => {
      const prisma = makePrisma([
        month(2026, 7, { id: 's1', skipMode: 'NO_SKIP', firstMonth: { year: 2026, month: 7 } }),
        month(2026, 8, { id: 's1', skipMode: 'NO_SKIP', firstMonth: { year: 2026, month: 7 } }),
        month(2026, 9, null), // standalone — should be picked as target
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });
  });

  // ── SERIES_AS_ONE ─────────────────────────────────────────────────────────

  describe('SERIES_AS_ONE', () => {
    it('canSkip=false when series already started (first month < candidateMonth)', async () => {
      // Candidate = July 2026. Series first month = June 2026 → started.
      const prisma = makePrisma([
        month(2026, 7, { id: 's2', skipMode: 'SERIES_AS_ONE', firstMonth: { year: 2026, month: 6 } }),
        month(2026, 8, { id: 's2', skipMode: 'SERIES_AS_ONE', firstMonth: { year: 2026, month: 6 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(false);
    });

    it('warning is present when blocked by in-progress series', async () => {
      const prisma = makePrisma([
        month(2026, 7, { id: 's2', skipMode: 'SERIES_AS_ONE', firstMonth: { year: 2026, month: 6 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.warnings.some((w) => /series.*in progress/i.test(w))).toBe(true);
    });

    it('canSkip=true when series has not started yet (first month === candidateMonth)', async () => {
      // Candidate = July 2026. Series first month = July 2026 → not started yet.
      const prisma = makePrisma([
        month(2026, 7, { id: 's3', skipMode: 'SERIES_AS_ONE', firstMonth: { year: 2026, month: 7 } }),
        month(2026, 8, { id: 's3', skipMode: 'SERIES_AS_ONE', firstMonth: { year: 2026, month: 7 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });

    it('canSkip=true when series has not started yet (first month > candidateMonth)', async () => {
      // Candidate = July 2026. Series first month = August 2026 → not started.
      const prisma = makePrisma([
        month(2026, 8, { id: 's4', skipMode: 'SERIES_AS_ONE', firstMonth: { year: 2026, month: 8 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });

    it('canSkip=true when in-progress series is followed by a standalone month', async () => {
      const prisma = makePrisma([
        month(2026, 7, { id: 's2', skipMode: 'SERIES_AS_ONE', firstMonth: { year: 2026, month: 6 } }),
        month(2026, 8, null), // standalone after series ends
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });
  });

  // ── SERIES_ONLY ───────────────────────────────────────────────────────────

  describe('SERIES_ONLY', () => {
    it('canSkip=false when series already started', async () => {
      const prisma = makePrisma([
        month(2026, 7, { id: 's5', skipMode: 'SERIES_ONLY', firstMonth: { year: 2026, month: 5 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(false);
    });

    it('canSkip=true when series not yet started', async () => {
      const prisma = makePrisma([
        month(2026, 7, { id: 's5', skipMode: 'SERIES_ONLY', firstMonth: { year: 2026, month: 7 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });
  });

  // ── SERIES_AS_MANY ────────────────────────────────────────────────────────

  describe('SERIES_AS_MANY', () => {
    it('canSkip=false when series already started', async () => {
      const prisma = makePrisma([
        month(2026, 7, { id: 's6', skipMode: 'SERIES_AS_MANY', firstMonth: { year: 2026, month: 4 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(false);
    });

    it('canSkip=true when series not yet started', async () => {
      const prisma = makePrisma([
        month(2026, 7, { id: 's6', skipMode: 'SERIES_AS_MANY', firstMonth: { year: 2026, month: 7 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });
  });

  // ── Non-blocking series modes ─────────────────────────────────────────────

  describe('non-blocking series modes', () => {
    it('INDIVIDUAL series mode does not block skipping', async () => {
      const prisma = makePrisma([
        month(2026, 7, { id: 's7', skipMode: 'INDIVIDUAL', firstMonth: { year: 2026, month: 6 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });

    it('null series (standalone month) does not block skipping', async () => {
      const prisma = makePrisma([month(2026, 7, null)]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });
  });

  // ── Cross-year series ─────────────────────────────────────────────────────

  describe('cross-year series', () => {
    it('canSkip=false when series started in previous year and continues into current candidate', async () => {
      // Candidate = July 2026. Series first month = Dec 2025 → started (year < candidate year).
      const prisma = makePrisma([
        month(2026, 7, { id: 's8', skipMode: 'SERIES_AS_ONE', firstMonth: { year: 2025, month: 12 } }),
        month(2026, 8, { id: 's8', skipMode: 'SERIES_AS_ONE', firstMonth: { year: 2025, month: 12 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(false);
    });

    it('canSkip=true when series starts next year (not yet started)', async () => {
      // Candidate = July 2026. Series first month = Jan 2027 → not started.
      const prisma = makePrisma([
        month(2027, 1, { id: 's9', skipMode: 'SERIES_AS_ONE', firstMonth: { year: 2027, month: 1 } }),
      ]);
      const status = await new SkipPolicyEngine(prisma).getStatus(uid, slug);
      expect(status.canSkip).toBe(true);
    });
  });
});
