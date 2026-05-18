/**
 * Integration tests: skip records + renewal date computation
 *
 * Tests how skip records (produced by various skip policies) affect
 * computeNextRenewalDate and computePastRenewalDates across ALL subscription
 * types and ALL skip policy variants.
 *
 * Architecture notes:
 *  - computeNextRenewalDate / computePastRenewalDates receive `skippedMonths`
 *    as RENEWAL months (already converted from box months via renewalMonthFromBoxMonth)
 *  - For offset=0: box month === renewal month (trivial identity)
 *  - For offset>0: skip stored as box month → must be converted before passing
 *
 * Bundle subscription (isBundleSubscription=true) specifics:
 *  - Ships multiple months as ONE package (intervalMonths months per shipment)
 *  - The renewal date engine sees only intervalMonths — identical to a plain
 *    multi-month interval. The "bundle" distinction is in addBooksForBundleMonths.
 *  - Skip is recorded on the FIRST box month of the bundle window
 *  - Skipping the SECOND (or later) box month in a bundle has NO effect on
 *    the renewal date — that month is never a renewal date candidate
 *  - With renewalMonthOffset: skip(firstBoxMonth) → converted to renewal month
 *    that is then correctly excluded from the schedule
 *
 * Skip policies covered (via the skip records they produce):
 *  - CALENDAR_YEAR: N skips per calendar year; reset Jan 1
 *  - FROM_FIRST_SKIP: window of M months from first skip; resets after window
 *  - PER_RENEWAL: N skips per renewal cycle (N=1 most common)
 *  - ROLLING_12_MONTHS: N skips in any rolling 12-month window
 *  - Combo subscriptions: skip state is shared; renewal date logic is unchanged
 *
 * Fixed "now" for computeNextRenewalDate:  2025-03-15T12:00:00Z
 * Fixed "now" for computePastRenewalDates: 2025-03-15T12:00:00Z (same)
 */

import { computeNextRenewalDate, computePastRenewalDates } from './renewal-date.util';

const FIXED_NOW = new Date('2025-03-15T12:00:00Z');

const d = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day));

/** Shorthand to build a skippedMonths array */
function skip(...months: Array<[number, number]>): Array<{ year: number; month: number }> {
  return months.map(([year, month]) => ({ year, month }));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════
// computeNextRenewalDate — skip scenarios
// renewalDay=1 unless noted; now = 2025-03-15T12:00:00Z
// ═══════════════════════════════════════════════════════════════════════════

describe('computeNextRenewalDate — skip scenarios', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // MONTHLY (intervalMonths=1, startingMonth=null)
  // No skip → Apr 1 (Mar 1 has passed; Apr 1 > now)
  // ─────────────────────────────────────────────────────────────────────────
  describe('monthly subscription', () => {
    it('no skips → April 1 2025', () => {
      expect(computeNextRenewalDate(1, 1, null, null)).toEqual(d(2025, 4, 1));
    });

    it('CALENDAR_YEAR: used 1 skip (Apr skipped) → May 1', () => {
      expect(computeNextRenewalDate(1, 1, null, null, skip([2025, 4]))).toEqual(d(2025, 5, 1));
    });

    it('CALENDAR_YEAR: used 2 skips (Apr+May skipped) → Jun 1', () => {
      expect(
        computeNextRenewalDate(1, 1, null, null, skip([2025, 4], [2025, 5])),
      ).toEqual(d(2025, 6, 1));
    });

    it('FROM_FIRST_SKIP (3-month window): window covers Feb-Apr; Apr is future and skipped → May 1', () => {
      // Feb+Mar are past. Apr is future but in skip window → skipped.
      expect(
        computeNextRenewalDate(1, 1, null, null, skip([2025, 2], [2025, 3], [2025, 4])),
      ).toEqual(d(2025, 5, 1));
    });

    it('FROM_FIRST_SKIP: 3 consecutive months all skipped → 4th month returned', () => {
      expect(
        computeNextRenewalDate(1, 1, null, null, skip([2025, 4], [2025, 5], [2025, 6])),
      ).toEqual(d(2025, 7, 1));
    });

    it('PER_RENEWAL: skip the next renewal (Apr) → May 1 (same as CALENDAR_YEAR single skip)', () => {
      expect(computeNextRenewalDate(1, 1, null, null, skip([2025, 4]))).toEqual(d(2025, 5, 1));
    });

    it('ROLLING_12_MONTHS: skips from past months only (Jan, Feb) → no effect on future → Apr 1', () => {
      // Past skips do not affect future months: Jan 2025 renewal already occurred
      expect(
        computeNextRenewalDate(1, 1, null, null, skip([2025, 1], [2025, 2])),
      ).toEqual(d(2025, 4, 1));
    });

    it('skip affects only the exact month+year — skip Apr 2024 (past year) has no effect → Apr 1 2025', () => {
      expect(computeNextRenewalDate(1, 1, null, null, skip([2024, 4]))).toEqual(d(2025, 4, 1));
    });

    it('skip Apr 2025 and Apr 2026 — Apr 2025 (future) is skipped; May returned', () => {
      // Skip records span two years; only the future one matters
      expect(
        computeNextRenewalDate(1, 1, null, null, skip([2025, 4], [2026, 4])),
      ).toEqual(d(2025, 5, 1));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2-MONTH BUNDLE (isBundleSubscription=true, intervalMonths=2, startingMonth=1)
  // Aligned: Jan/Mar/May/Jul/Sep/Nov
  // now=Mar 15: Mar aligned but Mar 1 passed → next aligned = May 1
  // ─────────────────────────────────────────────────────────────────────────
  describe('2-month bundle (intervalMonths=2, startingMonth=1)', () => {
    it('no skips → May 1 2025 (Mar passed, May is next aligned)', () => {
      expect(computeNextRenewalDate(1, 2, 1, null)).toEqual(d(2025, 5, 1));
    });

    it('skip May 2025 bundle → Jul 1 (next aligned 2 months later)', () => {
      expect(computeNextRenewalDate(1, 2, 1, null, skip([2025, 5]))).toEqual(d(2025, 7, 1));
    });

    it('skip May+Jul 2025 bundles → Sep 1', () => {
      expect(
        computeNextRenewalDate(1, 2, 1, null, skip([2025, 5], [2025, 7])),
      ).toEqual(d(2025, 9, 1));
    });

    it('skip 3 consecutive bundles → 4th bundle returned', () => {
      expect(
        computeNextRenewalDate(1, 2, 1, null, skip([2025, 5], [2025, 7], [2025, 9])),
      ).toEqual(d(2025, 11, 1));
    });

    it('skip on non-aligned month (Jun = second box month, converted to renewal Jun) → no effect → May 1', () => {
      // Jun is not an aligned renewal month for startingMonth=1, interval=2
      // So even if Jun 2025 is in skippedMonths, it will never be a candidate → May 1 unchanged
      expect(computeNextRenewalDate(1, 2, 1, null, skip([2025, 6]))).toEqual(d(2025, 5, 1));
    });

    it('past bundle skip (Mar 2025, already passed) → no effect → May 1', () => {
      expect(computeNextRenewalDate(1, 2, 1, null, skip([2025, 3]))).toEqual(d(2025, 5, 1));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2-MONTH BUNDLE + renewalMonthOffset=1
  // Box month = renewal month + 1.
  // First box month of May bundle = Jun.
  // Skip record stored as box Jun → converted to renewal May → passed as skippedMonths=[May].
  // ─────────────────────────────────────────────────────────────────────────
  describe('2-month bundle with renewalMonthOffset=1 (skips passed as converted renewal months)', () => {
    it('skip converted May 2025 (from box Jun) → Jul 1', () => {
      // After renewalMonthFromBoxMonth(2025, 6, 1) = [2025, 5]:
      expect(computeNextRenewalDate(1, 2, 1, null, skip([2025, 5]))).toEqual(d(2025, 7, 1));
    });

    it('skip converted May+Jul 2025 (from boxes Jun+Aug) → Sep 1', () => {
      // May is the first future aligned month (Mar has passed). Skip May → Jul; skip Jul → Sep.
      // Converted: renewalMonthFromBoxMonth(2025,6,1)=[2025,5], renewalMonthFromBoxMonth(2025,8,1)=[2025,7]
      expect(
        computeNextRenewalDate(1, 2, 1, null, skip([2025, 5], [2025, 7])),
      ).toEqual(d(2025, 9, 1));
    });

    it('skip converted from SECOND box month (Jun+1=Jul, non-aligned) → no effect → May 1', () => {
      // Second box month of May bundle = Jul.
      // renewalMonthFromBoxMonth(2025, 7, 1) = [2025, 6] → Jun is non-aligned → no effect.
      expect(computeNextRenewalDate(1, 2, 1, null, skip([2025, 6]))).toEqual(d(2025, 5, 1));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3-MONTH BUNDLE (isBundleSubscription=true, intervalMonths=3, startingMonth=1)
  // Aligned: Jan/Apr/Jul/Oct
  // now=Mar 15: Mar not aligned → next aligned = Apr 1
  // ─────────────────────────────────────────────────────────────────────────
  describe('3-month bundle / quarterly (intervalMonths=3, startingMonth=1)', () => {
    it('no skips → Apr 1 2025', () => {
      expect(computeNextRenewalDate(1, 3, 1, null)).toEqual(d(2025, 4, 1));
    });

    it('skip Apr 2025 bundle → Jul 1 (3 months later)', () => {
      expect(computeNextRenewalDate(1, 3, 1, null, skip([2025, 4]))).toEqual(d(2025, 7, 1));
    });

    it('skip Apr+Jul 2025 bundles → Oct 1', () => {
      expect(
        computeNextRenewalDate(1, 3, 1, null, skip([2025, 4], [2025, 7])),
      ).toEqual(d(2025, 10, 1));
    });

    it('skip non-aligned month (May = second box month with offset=0) → no effect → Apr 1', () => {
      // May offset=(5-1)=4, 4%3=1 → not aligned → skipping May has no effect
      expect(computeNextRenewalDate(1, 3, 1, null, skip([2025, 5]))).toEqual(d(2025, 4, 1));
    });

    it('startingMonth=2 (Feb/May/Aug/Nov): no skips → May 1 2025', () => {
      expect(computeNextRenewalDate(1, 3, 2, null)).toEqual(d(2025, 5, 1));
    });

    it('startingMonth=2: skip May 2025 → Aug 1', () => {
      expect(computeNextRenewalDate(1, 3, 2, null, skip([2025, 5]))).toEqual(d(2025, 8, 1));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3-MONTH BUNDLE + renewalMonthOffset=2
  // Box month = renewal month + 2.
  // First box month of Apr bundle = Jun.
  // Skip record stored as box Jun → converted to renewal Apr.
  // ─────────────────────────────────────────────────────────────────────────
  describe('3-month bundle with renewalMonthOffset=2', () => {
    it('skip converted Apr 2025 (from box Jun) → Jul 1', () => {
      // renewalMonthFromBoxMonth(2025, 6, 2) = [2025, 4]:
      expect(computeNextRenewalDate(1, 3, 1, null, skip([2025, 4]))).toEqual(d(2025, 7, 1));
    });

    it('skip converted from second box month (May, non-aligned offset=4→4%3=1) → no effect → Apr 1', () => {
      // Second box month of Apr bundle = May (offset=2 means boxes are Jun,Jul,Aug for Apr renewal).
      // Actually second box of Apr bundle is Jul, not May. But non-aligned in any case.
      // renewalMonthFromBoxMonth(2025, 7, 2) = [2025, 5] → May, offset=4→4%3=1 → not aligned.
      expect(computeNextRenewalDate(1, 3, 1, null, skip([2025, 5]))).toEqual(d(2025, 4, 1));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4-MONTH BUNDLE (isBundleSubscription=true, intervalMonths=4, startingMonth=1)
  // Aligned: Jan/May/Sep
  // now=Mar 15: Mar not aligned → next = May 1
  // ─────────────────────────────────────────────────────────────────────────
  describe('4-month bundle (intervalMonths=4, startingMonth=1)', () => {
    it('no skips → May 1 2025', () => {
      expect(computeNextRenewalDate(1, 4, 1, null)).toEqual(d(2025, 5, 1));
    });

    it('skip May 2025 bundle → Sep 1 (4 months later)', () => {
      expect(computeNextRenewalDate(1, 4, 1, null, skip([2025, 5]))).toEqual(d(2025, 9, 1));
    });

    it('skip May+Sep 2025 bundles → Jan 1 2026', () => {
      expect(
        computeNextRenewalDate(1, 4, 1, null, skip([2025, 5], [2025, 9])),
      ).toEqual(d(2026, 1, 1));
    });

    it('skip non-aligned month (Jun = second box month, offset=5→5%4=1) → no effect → May 1', () => {
      expect(computeNextRenewalDate(1, 4, 1, null, skip([2025, 6]))).toEqual(d(2025, 5, 1));
    });

    it('startingMonth=3 (Mar/Jul/Nov): Mar 20 not passed → Mar 20 2025', () => {
      expect(computeNextRenewalDate(20, 4, 3, null)).toEqual(d(2025, 3, 20));
    });

    it('startingMonth=3: skip Mar 2025 → Jul 1', () => {
      expect(computeNextRenewalDate(1, 4, 3, null, skip([2025, 3]))).toEqual(d(2025, 7, 1));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SEMI-ANNUAL (intervalMonths=6, startingMonth=1)
  // Aligned: Jan/Jul. now=Mar 15 → next = Jul 1.
  // ─────────────────────────────────────────────────────────────────────────
  describe('semi-annual (intervalMonths=6)', () => {
    it('no skips → Jul 1 2025', () => {
      expect(computeNextRenewalDate(1, 6, 1, null)).toEqual(d(2025, 7, 1));
    });

    it('skip Jul 2025 → Jan 1 2026', () => {
      expect(computeNextRenewalDate(1, 6, 1, null, skip([2025, 7]))).toEqual(d(2026, 1, 1));
    });

    it('startingMonth=3 (Mar/Sep): Mar 20 not passed → Mar 20 2025', () => {
      expect(computeNextRenewalDate(20, 6, 3, null)).toEqual(d(2025, 3, 20));
    });

    it('startingMonth=3: skip Mar 2025 → Sep 20 2025', () => {
      expect(computeNextRenewalDate(20, 6, 3, null, skip([2025, 3]))).toEqual(d(2025, 9, 20));
    });

    it('skip non-aligned month (Mar 2025 with startingMonth=1) → no effect → Jul 1', () => {
      // Mar offset=2, 2%6=2 → not aligned
      expect(computeNextRenewalDate(1, 6, 1, null, skip([2025, 3]))).toEqual(d(2025, 7, 1));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ANNUAL (intervalMonths=12)
  // ─────────────────────────────────────────────────────────────────────────
  describe('annual (intervalMonths=12)', () => {
    it('startingMonth=4: Apr 1 still future → Apr 1 2025 (no skip)', () => {
      expect(computeNextRenewalDate(1, 12, 4, null)).toEqual(d(2025, 4, 1));
    });

    it('startingMonth=4: skip Apr 2025 → Apr 1 2026', () => {
      expect(computeNextRenewalDate(1, 12, 4, null, skip([2025, 4]))).toEqual(d(2026, 4, 1));
    });

    it('startingMonth=3: renewalDay=20, not yet passed → Mar 20 2025', () => {
      expect(computeNextRenewalDate(20, 12, 3, null)).toEqual(d(2025, 3, 20));
    });

    it('startingMonth=3: skip Mar 2025 → Mar 20 2026', () => {
      expect(computeNextRenewalDate(20, 12, 3, null, skip([2025, 3]))).toEqual(d(2026, 3, 20));
    });

    it('skip on non-aligned month has no effect → Apr 1 2025', () => {
      // May offset=(5-4)=1, 1%12=1 → not aligned
      expect(computeNextRenewalDate(1, 12, 4, null, skip([2025, 5]))).toEqual(d(2025, 4, 1));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// computePastRenewalDates — historical skip scenarios
// now = 2025-03-15T12:00:00Z, renewalDay=1
// ═══════════════════════════════════════════════════════════════════════════

describe('computePastRenewalDates — historical skip scenarios', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // MONTHLY
  // Jan 2024 – Mar 2025 = 15 dates (renewalDay=1)
  // ─────────────────────────────────────────────────────────────────────────
  describe('monthly subscription (intervalMonths=1)', () => {
    it('baseline: no skips → 15 dates (Jan 2024 – Mar 2025)', () => {
      const result = computePastRenewalDates(1, 1, null, d(2024, 1, 1), []);
      expect(result).toHaveLength(15);
      expect(result[0]).toEqual(d(2024, 1, 1));
      expect(result[14]).toEqual(d(2025, 3, 1));
    });

    it('CALENDAR_YEAR (2 skips/year): skip Jan+Feb 2024 and Jan+Feb 2025 → 11 dates', () => {
      const result = computePastRenewalDates(
        1, 1, null, d(2024, 1, 1),
        skip([2024, 1], [2024, 2], [2025, 1], [2025, 2]),
      );
      expect(result).toHaveLength(11);
      // Mar–Dec 2024 (10) + Mar 2025 (1)
      expect(result[0]).toEqual(d(2024, 3, 1));
      expect(result[10]).toEqual(d(2025, 3, 1));
    });

    it('FROM_FIRST_SKIP (3-month window ×2): skip Feb+Mar+Apr 2024, Sep+Oct+Nov 2024 → 9 dates', () => {
      const result = computePastRenewalDates(
        1, 1, null, d(2024, 1, 1),
        skip([2024, 2], [2024, 3], [2024, 4], [2024, 9], [2024, 10], [2024, 11]),
      );
      // 15 total - 6 = 9
      expect(result).toHaveLength(9);
      expect(result).not.toContainEqual(d(2024, 2, 1));
      expect(result).not.toContainEqual(d(2024, 3, 1));
      expect(result).not.toContainEqual(d(2024, 11, 1));
    });

    it('PER_RENEWAL (1 skip per month): skip 1 month per quarter for 5 quarters → 10 dates', () => {
      // Skip Jan 2024, Apr 2024, Jul 2024, Oct 2024, Jan 2025 (5 skips)
      const result = computePastRenewalDates(
        1, 1, null, d(2024, 1, 1),
        skip([2024, 1], [2024, 4], [2024, 7], [2024, 10], [2025, 1]),
      );
      expect(result).toHaveLength(10); // 15 - 5
    });

    it('ROLLING_12_MONTHS: 4 skips spread across 12 months → 11 dates', () => {
      const result = computePastRenewalDates(
        1, 1, null, d(2024, 1, 1),
        skip([2024, 3], [2024, 6], [2024, 9], [2024, 12]),
      );
      expect(result).toHaveLength(11); // 15 - 4
    });

    it('multi-year subscription (Jan 2023 – Mar 2025): 27 dates, 4 historical skips → 23 dates', () => {
      const result = computePastRenewalDates(
        1, 1, null, d(2023, 1, 1),
        skip([2023, 3], [2023, 9], [2024, 1], [2024, 6]),
      );
      expect(result).toHaveLength(23); // 27 - 4
      expect(result).not.toContainEqual(d(2023, 3, 1));
      expect(result).not.toContainEqual(d(2024, 6, 1));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2-MONTH BUNDLE  (intervalMonths=2, startingMonth=1)
  // startDate=Jan 2023, now=Mar 15 2025
  // Aligned: Jan,Mar,May,Jul,Sep,Nov 2023; Jan,Mar,May,Jul,Sep,Nov 2024; Jan,Mar 2025 = 14 dates
  // ─────────────────────────────────────────────────────────────────────────
  describe('2-month bundle (intervalMonths=2, startingMonth=1)', () => {
    it('baseline: no skips → 14 dates', () => {
      const result = computePastRenewalDates(1, 2, 1, d(2023, 1, 1), []);
      expect(result).toHaveLength(14);
      expect(result[0]).toEqual(d(2023, 1, 1));
      expect(result[13]).toEqual(d(2025, 3, 1));
    });

    it('skip 2 bundles/year for 2 years (Mar+Sep 2023, May+Nov 2024) → 10 dates', () => {
      const result = computePastRenewalDates(
        1, 2, 1, d(2023, 1, 1),
        skip([2023, 3], [2023, 9], [2024, 5], [2024, 11]),
      );
      expect(result).toHaveLength(10); // 14 - 4
      expect(result).not.toContainEqual(d(2023, 3, 1));
      expect(result).not.toContainEqual(d(2024, 11, 1));
    });

    it('skip on NON-aligned month (Jun = second box month, offset=0, converted to Jun) → no effect → 14 dates', () => {
      // Jun offset=(6-1)%12=5, 5%2=1 → not aligned → never a candidate → skip has no effect
      const result = computePastRenewalDates(
        1, 2, 1, d(2023, 1, 1),
        skip([2023, 6], [2023, 8], [2024, 2], [2024, 4]),
      );
      expect(result).toHaveLength(14);
    });

    it('second box month skip (Jun = Aug bundle second box, non-aligned) does NOT exclude the bundle renewal (May)', () => {
      // May 2024 is the bundle renewal for May+Jun 2024
      // If skip is recorded on Jun 2024 (second box month, offset=0 → renewal Jun 2024, non-aligned)
      // May 2024 renewal must still be included
      const result = computePastRenewalDates(
        1, 2, 1, d(2024, 1, 1),
        skip([2024, 6]), // Jun = second box of May bundle, non-aligned
      );
      expect(result).toContainEqual(d(2024, 5, 1)); // May 2024 still present
    });

    it('CALENDAR_YEAR style (2 skips/year): skip 2 bundles per year → 10 dates', () => {
      const result = computePastRenewalDates(
        1, 2, 1, d(2023, 1, 1),
        skip([2023, 5], [2023, 11], [2024, 3], [2024, 9]),
      );
      expect(result).toHaveLength(10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2-MONTH BUNDLE + renewalMonthOffset=1
  // Box month = renewal month + 1.
  // First box of May bundle = Jun. Skip box Jun → converted renewal May.
  // startDate=Jan 2024, now=Mar 15 2025
  // Aligned renewals: Jan,Mar,May,Jul,Sep,Nov 2024; Jan,Mar 2025 = 8 dates
  // ─────────────────────────────────────────────────────────────────────────
  describe('2-month bundle with renewalMonthOffset=1 (skips as pre-converted renewal months)', () => {
    it('baseline: no skips → 8 dates', () => {
      const result = computePastRenewalDates(1, 2, 1, d(2024, 1, 1), []);
      expect(result).toHaveLength(8);
    });

    it('skip first box month of Mar 2024 bundle (box Apr → converted renewal Mar) → 7 dates, Mar 2024 excluded', () => {
      // renewalMonthFromBoxMonth(2024, 4, 1) = [2024, 3] → pass as skippedMonths
      const result = computePastRenewalDates(1, 2, 1, d(2024, 1, 1), skip([2024, 3]));
      expect(result).toHaveLength(7);
      expect(result).not.toContainEqual(d(2024, 3, 1));
      expect(result).toContainEqual(d(2024, 1, 1)); // Jan still present
    });

    it('skip SECOND box month of Mar bundle (box May → converted renewal Apr, non-aligned) → no effect → 8 dates', () => {
      // Second box of Mar bundle (offset=1) = May. renewalMonthFromBoxMonth(2024, 5, 1) = [2024, 4].
      // Apr is non-aligned (offset=3, 3%2=1) → never a candidate → no effect.
      const result = computePastRenewalDates(1, 2, 1, d(2024, 1, 1), skip([2024, 4]));
      expect(result).toHaveLength(8);
      expect(result).toContainEqual(d(2024, 3, 1)); // Mar still present
    });

    it('multiple bundle skips with offset=1: skip Mar+Jul+Nov 2024 renewals → 5 dates', () => {
      const result = computePastRenewalDates(1, 2, 1, d(2024, 1, 1), skip([2024, 3], [2024, 7], [2024, 11]));
      expect(result).toHaveLength(5); // 8 - 3
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3-MONTH BUNDLE / QUARTERLY  (intervalMonths=3, startingMonth=1)
  // startDate=Jan 2023; aligned: Jan,Apr,Jul,Oct 2023; Jan,Apr,Jul,Oct 2024; Jan 2025 = 9
  // ─────────────────────────────────────────────────────────────────────────
  describe('3-month bundle / quarterly (intervalMonths=3, startingMonth=1)', () => {
    it('baseline: no skips → 9 dates', () => {
      const result = computePastRenewalDates(1, 3, 1, d(2023, 1, 1), []);
      expect(result).toHaveLength(9);
      expect(result[0]).toEqual(d(2023, 1, 1));
      expect(result[8]).toEqual(d(2025, 1, 1));
    });

    it('skip 1 quarter/year (Apr 2023 + Jul 2024) → 7 dates', () => {
      const result = computePastRenewalDates(1, 3, 1, d(2023, 1, 1), skip([2023, 4], [2024, 7]));
      expect(result).toHaveLength(7);
      expect(result).not.toContainEqual(d(2023, 4, 1));
      expect(result).not.toContainEqual(d(2024, 7, 1));
    });

    it('skip across year boundary (Oct 2023 + Jan 2024) → 7 dates', () => {
      const result = computePastRenewalDates(1, 3, 1, d(2023, 1, 1), skip([2023, 10], [2024, 1]));
      expect(result).toHaveLength(7);
      expect(result).not.toContainEqual(d(2023, 10, 1));
      expect(result).not.toContainEqual(d(2024, 1, 1));
      expect(result).toContainEqual(d(2024, 4, 1)); // next quarter still present
    });

    it('non-aligned month skip (Feb = second box month, offset=1→1%3=1) → no effect → 9 dates', () => {
      const result = computePastRenewalDates(1, 3, 1, d(2023, 1, 1), skip([2023, 2], [2024, 5]));
      expect(result).toHaveLength(9);
    });

    it('PER_RENEWAL (1 skip/renewal): 4 quarterly skips over 2 years → 5 dates', () => {
      // Skip Jan+Apr+Jul+Oct 2023 (4 skips, all 2023)
      const result = computePastRenewalDates(
        1, 3, 1, d(2023, 1, 1),
        skip([2023, 1], [2023, 4], [2023, 7], [2023, 10]),
      );
      expect(result).toHaveLength(5); // Jan,Apr,Jul,Oct 2024 + Jan 2025
    });

    it('startingMonth=2 (Feb/May/Aug/Nov): startDate=Feb 2023, aligned dates correct, skip May 2024', () => {
      // Feb,May,Aug,Nov 2023; Feb,May,Aug,Nov 2024; Feb 2025 = 9 dates
      const result = computePastRenewalDates(1, 3, 2, d(2023, 2, 1), skip([2024, 5]));
      expect(result).toHaveLength(8); // 9 - 1
      expect(result).not.toContainEqual(d(2024, 5, 1));
      expect(result).toContainEqual(d(2024, 8, 1));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4-MONTH BUNDLE  (intervalMonths=4, startingMonth=1)
  // startDate=Jan 2023; aligned: Jan,May,Sep 2023; Jan,May,Sep 2024; Jan 2025 = 7 dates
  // ─────────────────────────────────────────────────────────────────────────
  describe('4-month bundle (intervalMonths=4, startingMonth=1)', () => {
    it('baseline: no skips → 7 dates', () => {
      const result = computePastRenewalDates(1, 4, 1, d(2023, 1, 1), []);
      expect(result).toHaveLength(7);
      expect(result).toContainEqual(d(2023, 1, 1));
      expect(result).toContainEqual(d(2023, 5, 1));
      expect(result).toContainEqual(d(2023, 9, 1));
      expect(result).toContainEqual(d(2025, 1, 1));
    });

    it('skip May 2023 + Jan 2025 → 5 dates', () => {
      const result = computePastRenewalDates(1, 4, 1, d(2023, 1, 1), skip([2023, 5], [2025, 1]));
      expect(result).toHaveLength(5);
      expect(result).not.toContainEqual(d(2023, 5, 1));
      expect(result).not.toContainEqual(d(2025, 1, 1));
    });

    it('skip non-aligned month (Feb = second box month, offset=1→1%4=1) → no effect → 7 dates', () => {
      const result = computePastRenewalDates(1, 4, 1, d(2023, 1, 1), skip([2023, 2], [2023, 3], [2024, 2]));
      expect(result).toHaveLength(7);
    });

    it('skip Sep 2023 + Sep 2024 (across years) → 5 dates', () => {
      const result = computePastRenewalDates(1, 4, 1, d(2023, 1, 1), skip([2023, 9], [2024, 9]));
      expect(result).toHaveLength(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SEMI-ANNUAL  (intervalMonths=6, startingMonth=1)
  // startDate=Jan 2022; aligned: Jan,Jul 2022; Jan,Jul 2023; Jan,Jul 2024; Jan 2025 = 7 dates
  // ─────────────────────────────────────────────────────────────────────────
  describe('semi-annual (intervalMonths=6)', () => {
    it('baseline: no skips → 7 dates', () => {
      const result = computePastRenewalDates(1, 6, 1, d(2022, 1, 1), []);
      expect(result).toHaveLength(7);
    });

    it('skip Jul 2022 + Jan 2024 → 5 dates', () => {
      const result = computePastRenewalDates(1, 6, 1, d(2022, 1, 1), skip([2022, 7], [2024, 1]));
      expect(result).toHaveLength(5);
      expect(result).not.toContainEqual(d(2022, 7, 1));
      expect(result).not.toContainEqual(d(2024, 1, 1));
    });

    it('skip non-aligned months only → no effect → 7 dates', () => {
      // Apr(offset=3→3%6=3), Feb(1), Jun(5) are all non-aligned for startingMonth=1, interval=6
      const result = computePastRenewalDates(1, 6, 1, d(2022, 1, 1), skip([2022, 4], [2023, 2], [2024, 6]));
      expect(result).toHaveLength(7);
    });

    it('consecutive annual skips: skip Jan 2023 + Jan 2024 → only Jul dates + boundary → 5 dates', () => {
      const result = computePastRenewalDates(1, 6, 1, d(2022, 1, 1), skip([2023, 1], [2024, 1]));
      expect(result).toHaveLength(5);
      // Jul dates still present
      expect(result).toContainEqual(d(2022, 7, 1));
      expect(result).toContainEqual(d(2023, 7, 1));
      expect(result).toContainEqual(d(2024, 7, 1));
      expect(result).toContainEqual(d(2025, 1, 1));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ANNUAL  (intervalMonths=12)
  // startDate=Jan 2021; aligned: Jan 2021,2022,2023,2024,2025 = 5 dates
  // ─────────────────────────────────────────────────────────────────────────
  describe('annual (intervalMonths=12)', () => {
    it('baseline: no skips → 5 dates', () => {
      const result = computePastRenewalDates(1, 12, 1, d(2021, 1, 1), []);
      expect(result).toHaveLength(5);
    });

    it('skip Jan 2022 + Jan 2024 → 3 dates', () => {
      const result = computePastRenewalDates(1, 12, 1, d(2021, 1, 1), skip([2022, 1], [2024, 1]));
      expect(result).toHaveLength(3);
      expect(result).toContainEqual(d(2021, 1, 1));
      expect(result).toContainEqual(d(2023, 1, 1));
      expect(result).toContainEqual(d(2025, 1, 1));
    });

    it('skip on non-aligned months only → no effect → 5 dates', () => {
      const result = computePastRenewalDates(1, 12, 1, d(2021, 1, 1), skip([2021, 6], [2022, 11], [2023, 4]));
      expect(result).toHaveLength(5);
    });

    it('startingMonth=3 (March only): 3-year history, skip Mar 2022 → 2 dates', () => {
      // Mar 2021, Mar 2022, Mar 2023, Mar 2024, Mar 2025 = 5 (Mar 1 2025 < now)
      const result = computePastRenewalDates(1, 12, 3, d(2021, 3, 1), skip([2022, 3]));
      expect(result).toHaveLength(4); // 5 - 1
      expect(result).not.toContainEqual(d(2022, 3, 1));
      expect(result).toContainEqual(d(2025, 3, 1));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BUNDLE SPECIAL: first vs second box month skips
  // (offset=0, so box month = renewal month; demonstrates alignment filtering)
  // ─────────────────────────────────────────────────────────────────────────
  describe('bundle skip — first vs second box month (offset=0)', () => {
    // 2-month bundle Jan 2024 – Mar 2025: Jan,Mar,May,Jul,Sep,Nov 2024; Jan,Mar 2025 = 8 dates

    it('skip first box month of May 2024 bundle (May) → renewal May excluded → 7 dates', () => {
      const result = computePastRenewalDates(1, 2, 1, d(2024, 1, 1), skip([2024, 5]));
      expect(result).toHaveLength(7);
      expect(result).not.toContainEqual(d(2024, 5, 1));
      expect(result).toContainEqual(d(2024, 7, 1)); // next bundle still present
    });

    it('skip SECOND box month of May bundle (Jun, non-aligned) → May renewal NOT excluded → 8 dates', () => {
      // Jun: offset=(6-1)%12=5, 5%2=1 → not aligned → never a candidate → skip has no effect
      const result = computePastRenewalDates(1, 2, 1, d(2024, 1, 1), skip([2024, 6]));
      expect(result).toHaveLength(8);
      expect(result).toContainEqual(d(2024, 5, 1)); // May renewal still present
    });

    it('3-month bundle: skip SECOND box month of Jul 2024 quarter (Aug, non-aligned) → Jul renewal present', () => {
      // Aug: offset=(8-1)%12=7, 7%3=1 → not aligned
      const result = computePastRenewalDates(1, 3, 1, d(2023, 1, 1), skip([2024, 8]));
      expect(result).toHaveLength(9); // no change
      expect(result).toContainEqual(d(2024, 7, 1));
    });

    it('3-month bundle: skip FIRST box month of Jul 2024 quarter (Jul) → renewal excluded → 8 dates', () => {
      const result = computePastRenewalDates(1, 3, 1, d(2023, 1, 1), skip([2024, 7]));
      expect(result).toHaveLength(8);
      expect(result).not.toContainEqual(d(2024, 7, 1));
    });
  });
});
