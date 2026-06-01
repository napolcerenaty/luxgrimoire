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
    const callWithPrepaid = (policy: any, state: any, prepaidMonths: number | undefined) =>
      (engine as any).evaluateCanSkip(policy, state, prepaidMonths);

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

    // ─── eligibleBillingTypes ────────────────────────────────────────────────

    describe('eligibleBillingTypes', () => {
      const unlimitedPolicy = (eligibleBillingTypes: string | null = null) => ({
        type: 'UNLIMITED',
        maxSkips: null,
        maxConsecutive: null,
        eligibleBillingTypes,
      });

      it('MONTHLY_ONLY allows monthly subscriber (prepaidMonths=1)', () => {
        expect(callWithPrepaid(unlimitedPolicy('MONTHLY_ONLY'), null, 1)).toBe(true);
      });

      it('MONTHLY_ONLY blocks prepaid subscriber (prepaidMonths=6)', () => {
        expect(callWithPrepaid(unlimitedPolicy('MONTHLY_ONLY'), null, 6)).toBe(false);
      });

      it('PREPAID_ONLY allows prepaid subscriber (prepaidMonths=6)', () => {
        expect(callWithPrepaid(unlimitedPolicy('PREPAID_ONLY'), null, 6)).toBe(true);
      });

      it('PREPAID_ONLY blocks monthly subscriber (prepaidMonths=1)', () => {
        expect(callWithPrepaid(unlimitedPolicy('PREPAID_ONLY'), null, 1)).toBe(false);
      });

      it('ALL allows monthly subscriber', () => {
        expect(callWithPrepaid(unlimitedPolicy('ALL'), null, 1)).toBe(true);
      });

      it('ALL allows prepaid subscriber', () => {
        expect(callWithPrepaid(unlimitedPolicy('ALL'), null, 6)).toBe(true);
      });

      it('null eligibleBillingTypes defaults to ALL — allows both billing types', () => {
        expect(callWithPrepaid(unlimitedPolicy(null), null, 1)).toBe(true);
        expect(callWithPrepaid(unlimitedPolicy(null), null, 6)).toBe(true);
      });

      it('MONTHLY_ONLY with prepaidMonths=undefined skips billing type check (no restrictions)', () => {
        expect(callWithPrepaid(unlimitedPolicy('MONTHLY_ONLY'), null, undefined)).toBe(true);
      });

      it('MONTHLY_ONLY blocks prepaidMonths=2 (2-month prepay)', () => {
        expect(callWithPrepaid(unlimitedPolicy('MONTHLY_ONLY'), null, 2)).toBe(false);
      });

      it('billing type restriction applies regardless of policy type (CALENDAR_YEAR + MONTHLY_ONLY)', () => {
        const policy = { type: 'CALENDAR_YEAR', maxSkips: 3, maxConsecutive: null, eligibleBillingTypes: 'MONTHLY_ONLY' };
        expect(callWithPrepaid(policy, { skipsInWindow: 0, consecutiveSkips: 0 }, 6)).toBe(false);
        expect(callWithPrepaid(policy, { skipsInWindow: 0, consecutiveSkips: 0 }, 1)).toBe(true);
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

    // ─── eligibleBillingTypes warnings ────────────────────────────────────────

    describe('eligibleBillingTypes billing warnings', () => {
      const unlimited = (eligibleBillingTypes: string) => ({
        type: 'UNLIMITED', maxSkips: null, maxConsecutive: null,
        notes: null, skipHow: null, eligibleBillingTypes,
      });
      const targetMonth = { year: 2025, month: 6 };

      it('MONTHLY_ONLY + prepaid subscriber → canSkip=false and shows warning', () => {
        // prepaidMonths=6 → isPrepaid=true → MONTHLY_ONLY blocks + shows warning
        const status: SkipStatus = call(unlimited('MONTHLY_ONLY'), null, null, [], targetMonth, undefined, null, null, 6);
        expect(status.canSkip).toBe(false);
        expect(status.warnings.some((w: string) => w.toLowerCase().includes('prepaid'))).toBe(true);
      });

      it('MONTHLY_ONLY + monthly subscriber → canSkip=true and no billing warning', () => {
        // prepaidMonths=1 → isPrepaid=false → MONTHLY_ONLY allows
        const status: SkipStatus = call(unlimited('MONTHLY_ONLY'), null, null, [], targetMonth, undefined, null, null, 1);
        expect(status.canSkip).toBe(true);
        expect(status.warnings.every((w: string) => !w.toLowerCase().includes('prepaid'))).toBe(true);
      });

      it('PREPAID_ONLY + monthly subscriber → canSkip=false and shows warning', () => {
        // prepaidMonths=1 → isPrepaid=false → PREPAID_ONLY blocks + shows warning
        const status: SkipStatus = call(unlimited('PREPAID_ONLY'), null, null, [], targetMonth, undefined, null, null, 1);
        expect(status.canSkip).toBe(false);
        expect(status.warnings.some((w: string) => w.toLowerCase().includes('prepaid'))).toBe(true);
      });

      it('PREPAID_ONLY + prepaid subscriber → canSkip=true and no billing warning', () => {
        // prepaidMonths=6 → isPrepaid=true → PREPAID_ONLY allows
        const status: SkipStatus = call(unlimited('PREPAID_ONLY'), null, null, [], targetMonth, undefined, null, null, 6);
        expect(status.canSkip).toBe(true);
        expect(status.warnings.every((w: string) => !w.toLowerCase().includes('prepaid'))).toBe(true);
      });

      it('ALL → canSkip=true for both monthly and prepaid', () => {
        const statusMonthly: SkipStatus = call(unlimited('ALL'), null, null, [], targetMonth, undefined, null, null, 1);
        const statusPrepaid: SkipStatus = call(unlimited('ALL'), null, null, [], targetMonth, undefined, null, null, 6);
        expect(statusMonthly.canSkip).toBe(true);
        expect(statusPrepaid.canSkip).toBe(true);
      });
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
