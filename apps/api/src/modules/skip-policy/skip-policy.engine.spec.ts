import { SkipPolicyEngine, SkipStatus } from './skip-policy.engine';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Unit tests for the private pure-logic methods in SkipPolicyEngine.
 * DB-dependent public methods (getStatus, recordSkip, undoSkip) require
 * integration tests with a test DB and are not covered here.
 */
describe('SkipPolicyEngine — pure logic', () => {
  let engine: SkipPolicyEngine;

  beforeEach(() => {
    // PrismaService is not used by the private methods being tested
    engine = new SkipPolicyEngine(null as unknown as PrismaService);
  });

  // ─── evaluateCanSkip ───────────────────────────────────────────────────────

  describe('evaluateCanSkip', () => {
    const call = (policy: any, state: any) => (engine as any).evaluateCanSkip(policy, state);

    it('returns false when policy is null', () => {
      expect(call(null, null)).toBe(false);
    });

    it('returns false when policy type is NONE', () => {
      expect(call({ type: 'NONE', maxSkips: null, maxConsecutive: null }, null)).toBe(false);
    });

    it('returns true when policy type is UNLIMITED (regardless of state)', () => {
      expect(call({ type: 'UNLIMITED', maxSkips: null, maxConsecutive: null }, { skipsInWindow: 99, consecutiveSkips: 99 })).toBe(true);
    });

    it('returns true when policy type is UNLIMITED and state is null', () => {
      expect(call({ type: 'UNLIMITED', maxSkips: null, maxConsecutive: null }, null)).toBe(true);
    });

    it('UNLIMITED_MAX_CONSEC: returns true if under consecutive limit', () => {
      expect(call({ type: 'UNLIMITED_MAX_CONSEC', maxSkips: null, maxConsecutive: 3 }, { skipsInWindow: 0, consecutiveSkips: 2 })).toBe(true);
    });

    it('UNLIMITED_MAX_CONSEC: returns false if at consecutive limit', () => {
      expect(call({ type: 'UNLIMITED_MAX_CONSEC', maxSkips: null, maxConsecutive: 3 }, { skipsInWindow: 0, consecutiveSkips: 3 })).toBe(false);
    });

    it('UNLIMITED_MAX_CONSEC: returns true if maxConsecutive is null', () => {
      expect(call({ type: 'UNLIMITED_MAX_CONSEC', maxSkips: null, maxConsecutive: null }, { skipsInWindow: 0, consecutiveSkips: 100 })).toBe(true);
    });

    it('CALENDAR_YEAR: returns false if skipsInWindow == maxSkips', () => {
      expect(call({ type: 'CALENDAR_YEAR', maxSkips: 2, maxConsecutive: null }, { skipsInWindow: 2, consecutiveSkips: 0 })).toBe(false);
    });

    it('CALENDAR_YEAR: returns true if skipsInWindow < maxSkips', () => {
      expect(call({ type: 'CALENDAR_YEAR', maxSkips: 2, maxConsecutive: null }, { skipsInWindow: 1, consecutiveSkips: 0 })).toBe(true);
    });

    it('window-based: returns true with null maxSkips (unlimited in window)', () => {
      expect(call({ type: 'FROM_FIRST_SKIP', maxSkips: null, maxConsecutive: null }, { skipsInWindow: 99, consecutiveSkips: 0 })).toBe(true);
    });

    it('window-based: state null counts as 0 skips (can skip)', () => {
      expect(call({ type: 'CALENDAR_YEAR', maxSkips: 3, maxConsecutive: null }, null)).toBe(true);
    });

    // ─── selectApplicablePolicy (billing type routing) ───────────────────────

    describe('selectApplicablePolicy', () => {
      const select = (policies: any[], isPrepaid: boolean) =>
        (engine as any).selectApplicablePolicy(policies, isPrepaid);

      const all = { billingType: 'ALL', type: 'UNLIMITED' };
      const monthly = { billingType: 'MONTHLY', type: 'CALENDAR_YEAR' };
      const prepaid = { billingType: 'PREPAID', type: 'PREPAID_WINDOW_SKIP' };

      it('monthly subscriber prefers MONTHLY policy over ALL', () => {
        expect(select([all, monthly], false)).toBe(monthly);
      });

      it('prepaid subscriber prefers PREPAID policy over ALL', () => {
        expect(select([all, prepaid], true)).toBe(prepaid);
      });

      it('falls back to ALL when no billing-type-specific policy exists', () => {
        expect(select([all], true)).toBe(all);
        expect(select([all], false)).toBe(all);
      });

      it('returns null when no matching policy exists (MONTHLY only, prepaid subscriber)', () => {
        expect(select([monthly], true)).toBeNull();
      });

      it('returns null when no matching policy exists (PREPAID only, monthly subscriber)', () => {
        expect(select([prepaid], false)).toBeNull();
      });

      it('returns null for empty policy list', () => {
        expect(select([], false)).toBeNull();
        expect(select([], true)).toBeNull();
      });
    });
  });

  // ─── computeDeadline ──────────────────────────────────────────────────────

  describe('computeDeadline', () => {
    const call = (policy: any, entry: any, targetMonth: any) =>
      (engine as any).computeDeadline(policy, entry, targetMonth);

    it('returns null when policy is null', () => {
      expect(call(null, { effectiveRenewalDay: 15 }, { year: 2025, month: 3 })).toBeNull();
    });

    it('returns null when targetMonth is null', () => {
      expect(call({ skipDeadlineDaysBefore: 3 }, { effectiveRenewalDay: 15 }, null)).toBeNull();
    });

    it('returns null when effectiveRenewalDay is null (no deadline configured)', () => {
      expect(call({ skipDeadlineDaysBefore: 3 }, { effectiveRenewalDay: null }, { year: 2025, month: 3 })).toBeNull();
    });

    it('returns renewal date minus daysBefore', () => {
      const result = call(
        { skipDeadlineDaysBefore: 5 },
        { effectiveRenewalDay: 20 },
        { year: 2025, month: 6 },
      );
      // renewal = June 20 2025 → minus 5 days = June 15 2025
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(5); // 0-indexed: June = 5
      expect(result.getDate()).toBe(15);
    });

    it('returns renewal date as-is when daysBefore is 0', () => {
      const result = call(
        { skipDeadlineDaysBefore: 0 },
        { effectiveRenewalDay: 10 },
        { year: 2025, month: 2 },
      );
      expect(result.getDate()).toBe(10);
      expect(result.getMonth()).toBe(1); // February
    });

    it('handles end-of-month crossover (month boundary)', () => {
      const result = call(
        { skipDeadlineDaysBefore: 5 },
        { effectiveRenewalDay: 3 },
        { year: 2025, month: 3 }, // March 3 minus 5 = Feb 26
      );
      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(26);
    });
  });

  // ─── buildStatus ──────────────────────────────────────────────────────────

  describe('buildStatus', () => {
    const call = (...args: any[]) => (engine as any).buildStatus(...args);

    it('returns NONE type and canSkip=false when policy is null', () => {
      const status: SkipStatus = call(null, null, null, [], null);
      expect(status.policyType).toBe('NONE');
      expect(status.canSkip).toBe(false);
    });

    it('returns canSkip=false when deadlineMonth is null (no skippable month)', () => {
      const policy = { type: 'UNLIMITED', maxSkips: null, maxConsecutive: null, notes: null, skipHow: null };
      const status: SkipStatus = call(policy, null, null, [], null);
      expect(status.canSkip).toBe(false);
    });

    it('returns canSkip=true for UNLIMITED policy with a valid deadlineMonth', () => {
      const policy = { type: 'UNLIMITED', maxSkips: null, maxConsecutive: null, notes: null, skipHow: null };
      const status: SkipStatus = call(policy, null, null, [], { year: 2025, month: 4 });
      expect(status.canSkip).toBe(true);
    });

    it('reflects state counters in output', () => {
      const policy = { type: 'CALENDAR_YEAR', maxSkips: 3, maxConsecutive: null, notes: 'note', skipHow: 'email' };
      const state = { totalSkips: 5, skipsInWindow: 1, consecutiveSkips: 0 };
      const status: SkipStatus = call(policy, state, null, [], { year: 2025, month: 4 });
      expect(status.totalSkips).toBe(5);
      expect(status.skipsInWindow).toBe(1);
      expect(status.maxSkips).toBe(3);
      expect(status.notes).toBe('note');
      expect(status.skipHow).toBe('email');
    });

    it('sets isPastDeadline=true when deadline is in the past', () => {
      const policy = { type: 'CALENDAR_YEAR', maxSkips: 3, maxConsecutive: null, notes: null, skipHow: null };
      const pastDeadline = new Date(Date.now() - 86_400_000); // yesterday
      const status: SkipStatus = call(policy, null, pastDeadline, [], { year: 2025, month: 4 });
      expect(status.isPastDeadline).toBe(true);
    });

    it('sets isPastDeadline=false when deadline is in the future', () => {
      const policy = { type: 'CALENDAR_YEAR', maxSkips: 3, maxConsecutive: null, notes: null, skipHow: null };
      const futureDeadline = new Date(Date.now() + 86_400_000); // tomorrow
      const status: SkipStatus = call(policy, null, futureDeadline, [], { year: 2025, month: 4 });
      expect(status.isPastDeadline).toBe(false);
    });

    it('includes past-deadline warning when deadline passed and policy is not NONE', () => {
      const policy = { type: 'CALENDAR_YEAR', maxSkips: 3, maxConsecutive: null, notes: null, skipHow: null };
      const pastDeadline = new Date(Date.now() - 86_400_000);
      const status: SkipStatus = call(policy, null, pastDeadline, [], { year: 2025, month: 4 });
      expect(status.warnings[0]).toContain('deadline');
    });

    it('forceCanSkip overrides normal policy evaluation', () => {
      const policy = { type: 'UNLIMITED', maxSkips: null, maxConsecutive: null, notes: null, skipHow: null };
      const statusForced = call(policy, null, null, [], { year: 2025, month: 4 }, false);
      expect(statusForced.canSkip).toBe(false);
    });

    it('includes skippedMonths in output', () => {
      const policy = { type: 'UNLIMITED', maxSkips: null, maxConsecutive: null, notes: null, skipHow: null };
      const months = [{ year: 2025, month: 3 }, { year: 2025, month: 4 }];
      const status: SkipStatus = call(policy, null, null, months, null);
      expect(status.skippedMonths).toEqual(months);
    });

    it('does not emit billing-type warnings (billing routing handled by policy selection)', () => {
      const policy = { type: 'UNLIMITED', maxSkips: null, maxConsecutive: null, notes: null, skipHow: null };
      const status: SkipStatus = call(policy, null, null, [], { year: 2025, month: 6 }, undefined, null, null, 6);
      expect(status.canSkip).toBe(true);
      expect(status.warnings.every((w: string) => !w.toLowerCase().includes('prepaid'))).toBe(true);
    });
  });

  // ─── computeSkipCandidate ─────────────────────────────────────────────────
  //
  // Rules:
  //   - No renewalDay (null)         → candidate = nextMonth+offset, no warning flag
  //   - renewalDay set, before day   → candidate = currentMonth+offset, no warning flag
  //   - renewalDay set, on/after day → candidate = nextMonth+offset, warning flag=true
  //   - offset shifts the candidate month forward

  describe('computeSkipCandidate', () => {
    const call = (now: Date, renewalDay: number | null, offset: number) =>
      (engine as any).computeSkipCandidate(now, renewalDay, offset);

    // June 3 2026 — before renewalDay=4
    const jun3 = new Date(2026, 5, 3); // month 0-indexed
    // June 4 2026 — on renewalDay=4
    const jun4 = new Date(2026, 5, 4);
    // June 5 2026 — after renewalDay=4
    const jun5 = new Date(2026, 5, 5);

    it('no renewalDay → candidate = nextMonth, no skipPassed flag', () => {
      const result = call(jun3, null, 0);
      expect(result.candidateMonth).toBe(7); // July
      expect(result.candidateYear).toBe(2026);
      expect(result.currentMonthSkipPassed).toBe(false);
    });

    it('before renewalDay → candidate = currentMonth, no skipPassed flag', () => {
      const result = call(jun3, 4, 0);
      expect(result.candidateMonth).toBe(6); // June
      expect(result.candidateYear).toBe(2026);
      expect(result.currentMonthSkipPassed).toBe(false);
    });

    it('on renewalDay → candidate = nextMonth, skipPassed=true', () => {
      const result = call(jun4, 4, 0);
      expect(result.candidateMonth).toBe(7); // July
      expect(result.candidateYear).toBe(2026);
      expect(result.currentMonthSkipPassed).toBe(true);
    });

    it('after renewalDay → candidate = nextMonth, skipPassed=true', () => {
      const result = call(jun5, 4, 0);
      expect(result.candidateMonth).toBe(7); // July
      expect(result.candidateYear).toBe(2026);
      expect(result.currentMonthSkipPassed).toBe(true);
    });

    it('offset=1 before renewalDay → candidate = currentMonth+1', () => {
      const result = call(jun3, 4, 1);
      expect(result.candidateMonth).toBe(7); // June+1 = July
      expect(result.candidateYear).toBe(2026);
      expect(result.currentMonthSkipPassed).toBe(false);
    });

    it('offset=1 after renewalDay → candidate = nextMonth+1', () => {
      const result = call(jun5, 4, 1);
      expect(result.candidateMonth).toBe(8); // July+1 = August
      expect(result.candidateYear).toBe(2026);
      expect(result.currentMonthSkipPassed).toBe(true);
    });

    it('December + no renewalDay → rolls over to January next year', () => {
      const dec15 = new Date(2026, 11, 15);
      const result = call(dec15, null, 0);
      expect(result.candidateMonth).toBe(1); // January
      expect(result.candidateYear).toBe(2027);
    });

    it('December + before renewalDay + offset=1 → February next year', () => {
      const dec1 = new Date(2026, 11, 1);
      const result = call(dec1, 10, 1); // day=1 < renewalDay=10, candidate=Dec+1=Jan27
      expect(result.candidateMonth).toBe(1); // Jan
      expect(result.candidateYear).toBe(2027);
    });

    it('November + after renewalDay + offset=2 → January next year', () => {
      const nov20 = new Date(2026, 10, 20);
      const result = call(nov20, 5, 2); // day=20 >= renewalDay=5, so nextMonth=Dec, Dec+2=Feb→no, Dec+2 = month 14→month2, year+1
      // nextMonth = Dec(12), +2 = 14 → 14-12=2 Feb, year+1
      expect(result.candidateMonth).toBe(2);
      expect(result.candidateYear).toBe(2027);
    });

    it('day=1, renewalDay=1 → on renewal day → skipPassed=true, candidate = nextMonth', () => {
      const jan1 = new Date(2026, 0, 1);
      const result = call(jan1, 1, 0);
      expect(result.currentMonthSkipPassed).toBe(true);
      expect(result.candidateMonth).toBe(2); // February
    });

    it('renewalDay=31 with day=30 → before renewal → candidate = currentMonth', () => {
      const mar30 = new Date(2026, 2, 30);
      const result = call(mar30, 31, 0);
      expect(result.candidateMonth).toBe(3); // March
      expect(result.currentMonthSkipPassed).toBe(false);
    });
  });

  // ─── computeWarnings ──────────────────────────────────────────────────────

  describe('computeWarnings', () => {
    const call = (...args: any[]) => (engine as any).computeWarnings(...args);

    it('returns empty warnings when no limits apply', () => {
      expect(call('UNLIMITED', 0, null, 0, null)).toHaveLength(0);
    });

    it('warns when 1 skip remaining in window', () => {
      const warnings = call('CALENDAR_YEAR', 2, 3, 0, null);
      expect(warnings.some((w: string) => w.includes('1 skip remaining'))).toBe(true);
    });

    it('warns when window exhausted (remaining <= 0)', () => {
      const warnings = call('CALENDAR_YEAR', 3, 3, 0, null);
      expect(warnings.some((w: string) => w.includes('used all') || w.includes('3 skips'))).toBe(true);
    });

    it('warns when 1 consecutive skip remaining', () => {
      const warnings = call('UNLIMITED_MAX_CONSEC', 0, null, 2, 3);
      expect(warnings.some((w: string) => w.includes('consecutive') || w.includes('1 consecutive'))).toBe(true);
    });
  });
});
