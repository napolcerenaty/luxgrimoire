/**
 * Tests for the multi-policy skip system and the PREPAID_WINDOW_SKIP policy type.
 *
 * Covers:
 *  - selectApplicablePolicy billing-type routing (monthly vs prepaid)
 *  - PREPAID_WINDOW_SKIP recordSkip: records for ALL window months, advances billing
 *    by prepaidMonths, counts as a single skip
 *  - PREPAID_WINDOW_SKIP undoSkip: reverses all window months, retracts billing
 *  - Unskip allowed/blocked per policy
 */
import { ForbiddenException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SkipPolicyEngine } from './skip-policy.engine';

jest.mock('../../common/utils/renewal-date.util', () => ({
  refreshNextRenewalDate: jest.fn().mockResolvedValue(undefined),
  renewalMonthFromBoxMonth: jest.requireActual('../../common/utils/renewal-date.util').renewalMonthFromBoxMonth,
}));

// ─── Policy factories ──────────────────────────────────────────────────────────

function policy(billingType: string, type: string, opts: Record<string, any> = {}) {
  return {
    billingType,
    type,
    maxSkips: opts.maxSkips ?? null,
    maxConsecutive: opts.maxConsecutive ?? null,
    windowMonths: opts.windowMonths ?? null,
    allowUnskip: opts.allowUnskip ?? false,
    notes: null,
    skipHow: null,
    unskipHow: null,
    unskipNotes: null,
    skipDeadlineDaysBefore: 0,
    unskipDeadlineDaysBefore: 0,
  };
}

const ALL_UNLIMITED = policy('ALL', 'UNLIMITED');
const MONTHLY_UNLIMITED = policy('MONTHLY', 'UNLIMITED', { allowUnskip: true });
const PREPAID_WINDOW = policy('PREPAID', 'PREPAID_WINDOW_SKIP', { maxSkips: 1 });
const PREPAID_WINDOW_UNSKIPPABLE = policy('PREPAID', 'PREPAID_WINDOW_SKIP', { maxSkips: 1, allowUnskip: true });

// ─── Subscription mock builder ──────────────────────────────────────────────────

function makeSubscription(policies: any[], prepaidMonths: number, skipRecords: any[] = []) {
  return {
    id: 'sub-1',
    slug: 'sub',
    renewalDay: 1,
    renewalMonthOffset: 0,
    isCombo: false,
    parentSubscriptionId: null,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: false,
    startDate: null,
    skipPolicies: policies,
    comboComponents: [],
    userEntries: [
      {
        id: 'entry-1',
        userId: 'user-1',
        subscriptionId: 'sub-1',
        firstSkipDate: null,
        startDate: '2025-01-01',
        renewalDay: null,
        prepaidMonths,
        skipRecords,
      },
    ],
  };
}

function setupPrisma(prisma: DeepMockProxy<PrismaService>, subscription: any, state: any = null) {
  (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(subscription);
  (prisma.userSubscriptionSkipState.findUnique as jest.Mock).mockResolvedValue(state);
  // subscriptionMonth.findUnique returns a synthetic month per (year, month)
  (prisma.subscriptionMonth.findUnique as jest.Mock).mockImplementation(({ where }: any) => {
    const { year, month } = where.subscriptionId_year_month;
    return Promise.resolve({ id: `sm-${year}-${month}`, series: null });
  });
  (prisma.userSkipRecord.upsert as jest.Mock).mockResolvedValue({});
  (prisma.userSubscriptionSkipState.upsert as jest.Mock).mockImplementation(({ create, update }: any) =>
    Promise.resolve({ skipsInWindow: 1, consecutiveSkips: 1, totalSkips: 1, ...create, ...update }),
  );
  (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValue({});
  (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue({ nextRenewalDate: new Date('2025-06-01') });
  (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValue({ id: 'entry-1' });
  (prisma.userSubBillingPeriod.findFirst as jest.Mock).mockResolvedValue({
    id: 'bp-1', coveredToMonth: 8, coveredToYear: 2025,
  });
  (prisma.userSubBillingPeriod.update as jest.Mock).mockResolvedValue({});
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SkipPolicyEngine — multi-policy + PREPAID_WINDOW_SKIP', () => {
  let engine: SkipPolicyEngine;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    engine = new SkipPolicyEngine(prisma);
    jest.clearAllMocks();
  });

  const select = (policies: any[], isPrepaid: boolean) =>
    (engine as any).selectApplicablePolicy(policies, isPrepaid);
  const canSkip = (p: any, s: any, prepaid?: number) =>
    (engine as any).evaluateCanSkip(p, s, prepaid);

  // ── Scenarios 1–6: policy routing ─────────────────────────────────────────

  it('1. single ALL policy, monthly subscriber → can skip', () => {
    const p = select([ALL_UNLIMITED], false);
    expect(p).toBe(ALL_UNLIMITED);
    expect(canSkip(p, null, 1)).toBe(true);
  });

  it('2. single ALL policy, prepaid subscriber → can skip', () => {
    const p = select([ALL_UNLIMITED], true);
    expect(p).toBe(ALL_UNLIMITED);
    expect(canSkip(p, null, 6)).toBe(true);
  });

  it('3. MONTHLY + PREPAID_WINDOW policies, monthly subscriber → uses MONTHLY', () => {
    const p = select([MONTHLY_UNLIMITED, PREPAID_WINDOW], false);
    expect(p).toBe(MONTHLY_UNLIMITED);
  });

  it('4. MONTHLY + PREPAID_WINDOW policies, prepaid subscriber → uses PREPAID_WINDOW', () => {
    const p = select([MONTHLY_UNLIMITED, PREPAID_WINDOW], true);
    expect(p).toBe(PREPAID_WINDOW);
  });

  it('5. MONTHLY policy only, prepaid subscriber → cannot skip (no matching policy)', () => {
    const p = select([MONTHLY_UNLIMITED], true);
    expect(p).toBeNull();
    expect(canSkip(p, null, 6)).toBe(false);
  });

  it('6. PREPAID policy only, monthly subscriber → cannot skip', () => {
    const p = select([PREPAID_WINDOW], false);
    expect(p).toBeNull();
    expect(canSkip(p, null, 1)).toBe(false);
  });

  // ── Scenarios 7–9: PREPAID_WINDOW_SKIP recordSkip ─────────────────────────

  it('7. recordSkip creates skip records for all window months', async () => {
    const sub = makeSubscription([MONTHLY_UNLIMITED, PREPAID_WINDOW], 3);
    setupPrisma(prisma, sub);
    (prisma.userSkipRecord.findMany as jest.Mock).mockResolvedValue([]);

    await engine.recordSkip('user-1', 'sub', 2025, 6);

    // 3-month window → 3 skip records upserted (June, July, August 2025)
    expect(prisma.userSkipRecord.upsert).toHaveBeenCalledTimes(3);
    const monthIds = (prisma.userSkipRecord.upsert as jest.Mock).mock.calls.map(
      (c) => c[0].where.userEntryId_subscriptionMonthId.subscriptionMonthId,
    );
    expect(monthIds).toEqual(['sm-2025-6', 'sm-2025-7', 'sm-2025-8']);
  });

  it('8. recordSkip advances prepaid billing period by prepaidMonths', async () => {
    const sub = makeSubscription([PREPAID_WINDOW], 3);
    setupPrisma(prisma, sub);
    (prisma.userSkipRecord.findMany as jest.Mock).mockResolvedValue([]);

    await engine.recordSkip('user-1', 'sub', 2025, 6);

    // coveredTo Aug 2025 (+3 months) → Nov 2025
    expect(prisma.userSubBillingPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { coveredToMonth: 11, coveredToYear: 2025 },
      }),
    );
    // nextRenewalDate June 1 2025 (+3 months) → Sep 1 2025
    const entryUpdate = (prisma.userSubscriptionEntry.update as jest.Mock).mock.calls.find(
      (c) => c[0].data?.nextRenewalDate,
    );
    expect(entryUpdate).toBeDefined();
    expect(new Date(entryUpdate![0].data.nextRenewalDate).getUTCMonth()).toBe(8); // September (0-indexed)
  });

  it('9. maxSkips=1: one window skip uses up the allowance', () => {
    // After one window skip, skipsInWindow=1 → evaluateCanSkip returns false
    expect(canSkip(PREPAID_WINDOW, { skipsInWindow: 0, consecutiveSkips: 0 }, 3)).toBe(true);
    expect(canSkip(PREPAID_WINDOW, { skipsInWindow: 1, consecutiveSkips: 0 }, 3)).toBe(false);
  });

  // ── Scenario 10: PREPAID_WINDOW_SKIP undoSkip ─────────────────────────────

  it('10. undoSkip reverses all window months and retracts billing by prepaidMonths', async () => {
    const sub = makeSubscription([PREPAID_WINDOW_UNSKIPPABLE], 3);
    setupPrisma(prisma, sub);
    (prisma.userSkipRecord.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
    (prisma.userSkipRecord.findMany as jest.Mock).mockResolvedValue([]);

    await engine.undoSkip('user-1', 'sub', 2025, 6);

    // All window records soft-deleted in one updateMany over 3 month ids
    expect(prisma.userSkipRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subscriptionMonthId: { in: ['sm-2025-6', 'sm-2025-7', 'sm-2025-8'] },
        }),
      }),
    );
    // coveredTo Aug 2025 (−3 months) → May 2025
    expect(prisma.userSubBillingPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { coveredToMonth: 5, coveredToYear: 2025 } }),
    );
  });

  // ── Scenarios 11–12: unskip permission ────────────────────────────────────

  it('11. unskip with MONTHLY policy (allowUnskip=true) works', async () => {
    const sub = makeSubscription([MONTHLY_UNLIMITED], 1);
    setupPrisma(prisma, sub);
    (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValue({ id: 'rec-1', undoneAt: null });
    (prisma.userSkipRecord.update as jest.Mock).mockResolvedValue({});
    (prisma.userSkipRecord.findMany as jest.Mock).mockResolvedValue([]);

    await engine.undoSkip('user-1', 'sub', 2025, 6);

    expect(prisma.userSkipRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rec-1' }, data: expect.objectContaining({ undoneAt: expect.any(Date) }) }),
    );
  });

  it('12. unskip with PREPAID_WINDOW_SKIP (allowUnskip=false) → 403', async () => {
    const sub = makeSubscription([PREPAID_WINDOW], 3); // allowUnskip=false
    setupPrisma(prisma, sub);

    await expect(engine.undoSkip('user-1', 'sub', 2025, 6)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
