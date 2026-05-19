/**
 * Comprehensive unit tests for computeNextRenewalDate and computePastRenewalDates.
 *
 * Fixed "now": 2025-03-15T12:00:00Z (Saturday mid-month, CET day 15).
 * Some tests override this with inline jest.setSystemTime().
 *
 * Subscription types covered:
 *  - monthly           (intervalMonths=1, startingMonth=null)
 *  - bimonthly         (intervalMonths=2, startingMonth varies)
 *  - quarterly         (intervalMonths=3, startingMonth varies)
 *  - 4-month interval  (intervalMonths=4, startingMonth varies)
 *  - semi-annual       (intervalMonths=6, startingMonth varies)
 *  - annual            (intervalMonths=12, startingMonth varies)
 *  - bundle subscription (isBundleSubscription=true, intervalMonths=2/3/4)
 *    → renewal schedule is identical to the matching multi-month interval;
 *      the "bundle" distinction is purely in addBooksForBundleMonths (one
 *      purchase group + one shipment covering all months in the window)
 *  - paymentOnStartup  (monthly/multi-month + paidUpFrontDate)
 *    → first payment made at signup covers a specific month; that month is
 *      skipped when computing the next renewal date
 */
import { computeNextRenewalDate, computePastRenewalDates } from './renewal-date.util';

const FIXED_NOW = new Date('2025-03-15T12:00:00Z');

const d = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════
// computeNextRenewalDate
// ═══════════════════════════════════════════════════════════════════════════

describe('computeNextRenewalDate — comprehensive', () => {
  // ─────────────────────────────────────────────
  // MONTHLY  (intervalMonths=1, startingMonth=null)
  // ─────────────────────────────────────────────
  describe('monthly (intervalMonths=1)', () => {
    it('renewal day later this month → returns this month', () => {
      // renewalDay=20, now=Mar 15 → Mar 20 still in future
      expect(computeNextRenewalDate(20, 1, null, null)).toEqual(d(2025, 3, 20));
    });

    it('renewal day already passed this month → returns next month', () => {
      // renewalDay=10, Mar 10 already past → Apr 10
      expect(computeNextRenewalDate(10, 1, null, null)).toEqual(d(2025, 4, 10));
    });

    it('renewal day = today but midnight already passed → returns next month', () => {
      // candDate = 2025-03-15T00:00Z < now=2025-03-15T12:00Z → not > now → Apr 15
      expect(computeNextRenewalDate(15, 1, null, null)).toEqual(d(2025, 4, 15));
    });

    it('renewal day = tomorrow → returns this month', () => {
      expect(computeNextRenewalDate(16, 1, null, null)).toEqual(d(2025, 3, 16));
    });

    it('December: renewal day passed → rolls over to January next year', () => {
      jest.setSystemTime(new Date('2025-12-26T12:00:00Z'));
      // renewalDay=20, Dec 20 has passed → Jan 20 2026
      expect(computeNextRenewalDate(20, 1, null, null)).toEqual(d(2026, 1, 20));
    });

    it('December: renewal day not yet passed → returns December this year', () => {
      jest.setSystemTime(new Date('2025-12-20T12:00:00Z'));
      expect(computeNextRenewalDate(28, 1, null, null)).toEqual(d(2025, 12, 28));
    });

    it('skip current month → returns next month', () => {
      // renewalDay=20 in March, March is skipped → April 20
      const result = computeNextRenewalDate(20, 1, null, null, [{ year: 2025, month: 3 }]);
      expect(result).toEqual(d(2025, 4, 20));
    });

    it('skip two consecutive months → returns third', () => {
      // renewalDay=20, skip Mar + Apr → May 20
      const result = computeNextRenewalDate(20, 1, null, null, [
        { year: 2025, month: 3 },
        { year: 2025, month: 4 },
      ]);
      expect(result).toEqual(d(2025, 5, 20));
    });

    it('userStartDate in the future → skips candidates before startDate', () => {
      // renewalDay=20, startDate=2025-06-01 → Mar/Apr/May 20 all < startDate → Jun 20
      const result = computeNextRenewalDate(20, 1, null, '2025-06-01');
      expect(result).toEqual(d(2025, 6, 20));
    });

    it('userStartDate one day after today → accepts the upcoming renewal this month', () => {
      // startDate=2025-03-16, renewalDay=20 → Mar 20 >= Mar 16 → valid
      const result = computeNextRenewalDate(20, 1, null, '2025-03-16');
      expect(result).toEqual(d(2025, 3, 20));
    });

    it('renewalDay=31 in March → returns March 31', () => {
      // March has 31 days → valid date, still future
      expect(computeNextRenewalDate(31, 1, null, null)).toEqual(d(2025, 3, 31));
    });

    it('renewalDay=31 in February → overflows to March 3 (28-day month)', () => {
      jest.setSystemTime(new Date('2025-02-20T12:00:00Z'));
      // Date.UTC(2025, 1, 31) overflows to 2025-03-03 (Feb 2025 has 28 days)
      // 2025-03-03 > 2025-02-20 → valid
      expect(computeNextRenewalDate(31, 1, null, null)).toEqual(d(2025, 3, 3));
    });

    it('startDate so far in the future that no date found within 24 months → null', () => {
      expect(computeNextRenewalDate(1, 1, null, '2030-01-01')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // BIMONTHLY  (intervalMonths=2)
  // ─────────────────────────────────────────────
  describe('bimonthly (intervalMonths=2)', () => {
    it('startingMonth=1 (Jan/Mar/May…): in aligned month, day not passed → this month', () => {
      // Mar is aligned (offset=2, 2%2=0), renewalDay=20
      expect(computeNextRenewalDate(20, 2, 1, null)).toEqual(d(2025, 3, 20));
    });

    it('startingMonth=1: in aligned month, day passed → next aligned (+2 months)', () => {
      // Mar renewal day 10 has passed → skip to May 10
      expect(computeNextRenewalDate(10, 2, 1, null)).toEqual(d(2025, 5, 10));
    });

    it('startingMonth=2 (Feb/Apr/Jun…): currently in non-aligned month → next aligned', () => {
      // March has offset=(3-2)=1, not aligned → next aligned is April
      expect(computeNextRenewalDate(20, 2, 2, null)).toEqual(d(2025, 4, 20));
    });

    it('startingMonth=1: skip the upcoming aligned month → jumps to the one after', () => {
      // Mar aligned but skipped → May aligned
      const result = computeNextRenewalDate(20, 2, 1, null, [{ year: 2025, month: 3 }]);
      expect(result).toEqual(d(2025, 5, 20));
    });

    it('year boundary: startingMonth=1, Dec not aligned (offset=11, 11%2=1) → Jan 2026 aligned', () => {
      jest.setSystemTime(new Date('2025-12-20T12:00:00Z'));
      // Dec non-aligned, Jan 2026 aligned (offset=0)
      expect(computeNextRenewalDate(15, 2, 1, null)).toEqual(d(2026, 1, 15));
    });

    it('year boundary: startingMonth=2, Dec aligned, day passed → Feb 2026', () => {
      jest.setSystemTime(new Date('2025-12-20T12:00:00Z'));
      // Dec offset=(12-2)%12=10, 10%2=0 → aligned. renewalDay=15 passed → advance.
      // Jan 2026: offset=11, 11%2=1 → skip. Feb 2026: offset=0 → aligned → return Feb 15.
      expect(computeNextRenewalDate(15, 2, 2, null)).toEqual(d(2026, 2, 15));
    });
  });

  // ─────────────────────────────────────────────
  // QUARTERLY  (intervalMonths=3)
  // ─────────────────────────────────────────────
  describe('quarterly (intervalMonths=3)', () => {
    it('startingMonth=1 (Jan/Apr/Jul/Oct): now=Mar 15 → next aligned is Apr 1', () => {
      // Mar offset=2, 2%3=2 → skip. Apr: offset=3, 3%3=0 → aligned.
      expect(computeNextRenewalDate(1, 3, 1, null)).toEqual(d(2025, 4, 1));
    });

    it('startingMonth=3 (Mar/Jun/Sep/Dec): renewal day not passed → this month', () => {
      // Mar offset=0, 0%3=0 → aligned. renewalDay=20 not passed.
      expect(computeNextRenewalDate(20, 3, 3, null)).toEqual(d(2025, 3, 20));
    });

    it('startingMonth=3: renewal day passed → next quarter (June)', () => {
      // Mar 10 passed → advance. Apr/May not aligned. Jun: offset=3, 3%3=0 → return.
      expect(computeNextRenewalDate(10, 3, 3, null)).toEqual(d(2025, 6, 10));
    });

    it('startingMonth=2 (Feb/May/Aug/Nov): now=Mar 15 → next aligned is May 1', () => {
      // Mar: offset=(3-2)%12=1, 1%3=1 → skip. Apr: offset=2, 2%3=2 → skip. May: offset=3, 3%3=0 → aligned.
      expect(computeNextRenewalDate(1, 3, 2, null)).toEqual(d(2025, 5, 1));
    });

    it('skip the next quarter → returns the one after', () => {
      // startingMonth=1, skip Apr → Jul
      const result = computeNextRenewalDate(1, 3, 1, null, [{ year: 2025, month: 4 }]);
      expect(result).toEqual(d(2025, 7, 1));
    });

    it('year boundary: Oct quarter day passed → Jan next year', () => {
      jest.setSystemTime(new Date('2025-10-20T12:00:00Z'));
      // startingMonth=1, renewalDay=15. Oct: offset=9, 9%3=0 → aligned. Oct 15 < Oct 20 → passed. → Jan 2026.
      expect(computeNextRenewalDate(15, 3, 1, null)).toEqual(d(2026, 1, 15));
    });
  });

  // ─────────────────────────────────────────────
  // 4-MONTH INTERVAL  (intervalMonths=4)
  // ─────────────────────────────────────────────
  describe('4-month interval (intervalMonths=4)', () => {
    // Alignment formula: offset = ((month - startingMonth) % 12 + 12) % 12
    // Aligned when offset % 4 === 0.
    // startingMonth=1 → aligned: Jan(0), May(4), Sep(8)
    // startingMonth=3 → aligned: Mar(0), Jul(4), Nov(8)

    it('startingMonth=1 (Jan/May/Sep): now=Mar 15 in non-aligned month → next aligned is May 1', () => {
      // Mar: offset=2, 2%4=2 → skip. Apr: offset=3 → skip. May: offset=4, 4%4=0 → aligned.
      // May 1 2025 > now → return.
      expect(computeNextRenewalDate(1, 4, 1, null)).toEqual(d(2025, 5, 1));
    });

    it('startingMonth=3 (Mar/Jul/Nov): now=Mar 15, renewalDay=20 not passed → this month', () => {
      // Mar: offset=0, 0%4=0 → aligned. renewalDay=20 → Mar 20 > now → return.
      expect(computeNextRenewalDate(20, 4, 3, null)).toEqual(d(2025, 3, 20));
    });

    it('startingMonth=3: renewal day already passed → next aligned is July', () => {
      // Mar 10 < now. Apr: offset=1 → skip. May: offset=2 → skip. Jun: offset=3 → skip.
      // Jul: offset=4, 4%4=0 → aligned. Jul 10 > now → return.
      expect(computeNextRenewalDate(10, 4, 3, null)).toEqual(d(2025, 7, 10));
    });

    it('startingMonth=1: skip the upcoming aligned month (May) → jumps to Sep', () => {
      // May is next aligned but skipped → Sep 1 2025
      const result = computeNextRenewalDate(1, 4, 1, null, [{ year: 2025, month: 5 }]);
      expect(result).toEqual(d(2025, 9, 1));
    });

    it('year boundary: Sep day passed → Jan next year (startingMonth=1)', () => {
      jest.setSystemTime(new Date('2025-09-20T12:00:00Z'));
      // Sep: offset=8, 8%4=0 → aligned. Sep 15 < Sep 20 → passed.
      // Oct: offset=9 → skip. Nov: offset=10 → skip. Dec: offset=11 → skip.
      // Jan 2026: offset=0 → aligned. Jan 1 2026 > now → return.
      expect(computeNextRenewalDate(15, 4, 1, null)).toEqual(d(2026, 1, 15));
    });

    it('startingMonth=2 (Feb/Jun/Oct): now=Mar → next aligned is Jun', () => {
      // Mar: offset=(3-2)=1, 1%4=1 → skip. Apr: offset=2 → skip. May: offset=3 → skip.
      // Jun: offset=4, 4%4=0 → aligned. Jun 1 > now → return.
      expect(computeNextRenewalDate(1, 4, 2, null)).toEqual(d(2025, 6, 1));
    });
  });

  // ─────────────────────────────────────────────
  // BUNDLE SUBSCRIPTION  (isBundleSubscription=true)
  // One payment + one shipment covering intervalMonths months.
  // computeNextRenewalDate is not aware of the "bundle" flag —
  // it uses intervalMonths only. Bundle-specific logic (collecting
  // books from all window months into one purchase group) lives in
  // addBooksForBundleMonths. Tests here confirm the renewal schedule.
  // ─────────────────────────────────────────────
  describe('bundle subscription — renewal schedule (driven by intervalMonths)', () => {
    it('2-month bundle (intervalMonths=2, startingMonth=1): Jan/Mar/May — same as bimonthly', () => {
      // Mar aligned, renewalDay=20 not passed → Mar 20
      expect(computeNextRenewalDate(20, 2, 1, null)).toEqual(d(2025, 3, 20));
    });

    it('3-month bundle (intervalMonths=3, startingMonth=1): Jan/Apr/Jul — same as quarterly', () => {
      // Mar not aligned → next is Apr 1
      expect(computeNextRenewalDate(1, 3, 1, null)).toEqual(d(2025, 4, 1));
    });

    it('4-month bundle (intervalMonths=4, startingMonth=1): Jan/May/Sep → next is May', () => {
      expect(computeNextRenewalDate(1, 4, 1, null)).toEqual(d(2025, 5, 1));
    });

    it('2-month bundle: skipping the upcoming aligned month defers by one full interval (2 months)', () => {
      // startingMonth=1. Mar aligned, renewalDay=20 (future). Skip Mar → May 20.
      const result = computeNextRenewalDate(20, 2, 1, null, [{ year: 2025, month: 3 }]);
      expect(result).toEqual(d(2025, 5, 20));
    });

    it('3-month bundle: skipping one cycle defers by one full interval (3 months)', () => {
      // startingMonth=1, skip Apr → Jul 1
      const result = computeNextRenewalDate(1, 3, 1, null, [{ year: 2025, month: 4 }]);
      expect(result).toEqual(d(2025, 7, 1));
    });

    it('4-month bundle: skipping one cycle defers by one full interval (4 months)', () => {
      // startingMonth=3, skip Jul 2025 → Nov 1 2025
      const result = computeNextRenewalDate(1, 4, 3, null, [{ year: 2025, month: 7 }]);
      expect(result).toEqual(d(2025, 11, 1));
    });

    it('bundle subscription does NOT bill in non-aligned months — they are skipped by alignment', () => {
      // 3-month bundle startingMonth=1. Non-aligned months (Feb, Mar) are never returned.
      // Apr 1 is the first upcoming renewal — user will be charged only then.
      expect(computeNextRenewalDate(1, 3, 1, null)).toEqual(d(2025, 4, 1));
    });
  });

  // ─────────────────────────────────────────────
  // SEMI-ANNUAL  (intervalMonths=6)
  // ─────────────────────────────────────────────
  describe('semi-annual (intervalMonths=6)', () => {
    it('startingMonth=1 (Jan/Jul): now=Mar 15 → next aligned is Jul 1', () => {
      // Mar offset=2, 2%6=2 → skip. Apr: 3%6=3. May: 4. Jun: 5. Jul: offset=6, 6%6=0 → return.
      expect(computeNextRenewalDate(1, 6, 1, null)).toEqual(d(2025, 7, 1));
    });

    it('startingMonth=3 (Mar/Sep): renewal day not passed → this month', () => {
      expect(computeNextRenewalDate(20, 6, 3, null)).toEqual(d(2025, 3, 20));
    });

    it('startingMonth=3: renewal day passed → Sep (6 months forward)', () => {
      // Mar 10 passed → skip 6 months to Sep
      expect(computeNextRenewalDate(10, 6, 3, null)).toEqual(d(2025, 9, 10));
    });

    it('skip the aligned month → returns the next semi-annual date', () => {
      // startingMonth=3, skip Mar → Sep
      const result = computeNextRenewalDate(20, 6, 3, null, [{ year: 2025, month: 3 }]);
      expect(result).toEqual(d(2025, 9, 20));
    });
  });

  // ─────────────────────────────────────────────
  // ANNUAL  (intervalMonths=12)
  // ─────────────────────────────────────────────
  describe('annual (intervalMonths=12)', () => {
    it('startingMonth=3 (March only): renewal day not passed → this month', () => {
      // Mar offset=0, 0%12=0 → aligned. renewalDay=20 → return Mar 20.
      expect(computeNextRenewalDate(20, 12, 3, null)).toEqual(d(2025, 3, 20));
    });

    it('startingMonth=3: renewal day already passed → same month next year', () => {
      // Mar 10 passed → advance. Apr-Feb not aligned. Mar 2026 → return.
      expect(computeNextRenewalDate(10, 12, 3, null)).toEqual(d(2026, 3, 10));
    });

    it('startingMonth=1 (January only): now=Mar → Jan next year', () => {
      // Mar–Dec 2025: non-aligned for startingMonth=1, interval=12 except Jan.
      // Jan 2026: offset=0 → aligned. return Jan 15 2026.
      expect(computeNextRenewalDate(15, 12, 1, null)).toEqual(d(2026, 1, 15));
    });

    it('skip the annual month → returns the same month one year later', () => {
      // startingMonth=3, skip Mar 2025 → Mar 2026
      const result = computeNextRenewalDate(20, 12, 3, null, [{ year: 2025, month: 3 }]);
      expect(result).toEqual(d(2026, 3, 20));
    });

    it('userStartDate after the next occurrence → returns the year that satisfies startDate', () => {
      // startingMonth=3, renewalDay=20, startDate=2026-01-01
      // Mar 2025: future but < startDate. Mar 2026: future and >= startDate → return.
      const result = computeNextRenewalDate(20, 12, 3, '2026-01-01');
      expect(result).toEqual(d(2026, 3, 20));
    });

    it('startDate so far ahead that 24 loop iterations exhaust → returns null', () => {
      // Annual subscription, startDate=2030 — 24 iterations only cover ~2 years
      expect(computeNextRenewalDate(1, 12, 3, '2030-03-01')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // PAYMENT ON STARTUP  (paymentOnStartup=true → paidUpFrontDate)
  // A specific month was already paid at signup; skip it when computing
  // the next renewal. This is a separate concern from bundle subscriptions.
  // ─────────────────────────────────────────────
  describe('paymentOnStartup — paidUpFrontDate skips the already-paid month', () => {
    it('paidUpFrontDate in current month → skip this month, return next', () => {
      // User signed up mid-March, March box already paid at signup
      // paidUpFrontDate = Mar 20 2025 → skip March → Apr 20
      const paid = new Date(Date.UTC(2025, 2, 20)); // 2025-03-20T00:00Z
      expect(computeNextRenewalDate(20, 1, null, null, [], paid)).toEqual(d(2025, 4, 20));
    });

    it('paidUpFrontDate in next month → current month not affected, next month skipped', () => {
      // renewalDay=10 passed (Apr 10 not paid yet). After March 10 passes:
      // candMonth=3: paidMonth=4 ≠ 3 → no match. Mar 10 < now → advance to Apr.
      // candMonth=4: paidMonth=4 → match → skip to May. May 10 → return.
      const paid = new Date(Date.UTC(2025, 3, 10)); // 2025-04-10T00:00Z
      expect(computeNextRenewalDate(10, 1, null, null, [], paid)).toEqual(d(2025, 5, 10));
    });

    it('paidUpFrontDate already in the past → has no effect on current month', () => {
      // Feb 2025 is in the past. renewalDay=20 in March is the natural next date.
      const paid = new Date(Date.UTC(2025, 1, 20)); // 2025-02-20T00:00Z
      expect(computeNextRenewalDate(20, 1, null, null, [], paid)).toEqual(d(2025, 3, 20));
    });

    it('paidUpFrontDate + skipped following month → returns month after skip', () => {
      // March paid, April skipped → May 20
      const paid = new Date(Date.UTC(2025, 2, 20));
      const result = computeNextRenewalDate(20, 1, null, null, [{ year: 2025, month: 4 }], paid);
      expect(result).toEqual(d(2025, 5, 20));
    });

    it('null paidUpFrontDate has no effect', () => {
      expect(computeNextRenewalDate(20, 1, null, null, [], null)).toEqual(d(2025, 3, 20));
    });

    it('bimonthly + paidUpFrontDate on aligned month → next aligned month', () => {
      // startingMonth=1, interval=2. March aligned + paid upfront → skip to May.
      const paid = new Date(Date.UTC(2025, 2, 20)); // March
      expect(computeNextRenewalDate(20, 2, 1, null, [], paid)).toEqual(d(2025, 5, 20));
    });

    it('quarterly + paidUpFrontDate on next aligned month → skips one quarter', () => {
      // startingMonth=1. Apr is next aligned quarter. Apr is paid upfront → Jul.
      const paid = new Date(Date.UTC(2025, 3, 1)); // April
      expect(computeNextRenewalDate(1, 3, 1, null, [], paid)).toEqual(d(2025, 7, 1));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// computePastRenewalDates
// ═══════════════════════════════════════════════════════════════════════════

describe('computePastRenewalDates — comprehensive', () => {
  // ─────────────────────────────────────────────
  // MONTHLY
  // ─────────────────────────────────────────────
  describe('monthly (intervalMonths=1)', () => {
    it('renewalDay=1: Jan–Mar all qualify, Apr breaks', () => {
      // startDate=Jan 1, renewalDay=1. Apr 1 >= now → stops.
      const result = computePastRenewalDates(1, 1, null, d(2025, 1, 1), []);
      expect(result).toEqual([d(2025, 1, 1), d(2025, 2, 1), d(2025, 3, 1)]);
    });

    it('renewalDay=20: Jan 20 and Feb 20 qualify; Mar 20 is future → stops', () => {
      // Mar 20 >= now (2025-03-15T12:00) → break before adding.
      const result = computePastRenewalDates(20, 1, null, d(2025, 1, 1), []);
      expect(result).toEqual([d(2025, 1, 20), d(2025, 2, 20)]);
    });

    it('skipped month is excluded from results', () => {
      const result = computePastRenewalDates(1, 1, null, d(2025, 1, 1), [{ year: 2025, month: 2 }]);
      expect(result).toEqual([d(2025, 1, 1), d(2025, 3, 1)]);
    });

    it('start date in the future → empty array', () => {
      const result = computePastRenewalDates(1, 1, null, d(2025, 6, 1), []);
      expect(result).toEqual([]);
    });

    it('year-spanning: Nov 2024 through Mar 2025 (renewalDay=1)', () => {
      const result = computePastRenewalDates(1, 1, null, d(2024, 11, 1), []);
      expect(result).toEqual([
        d(2024, 11, 1),
        d(2024, 12, 1),
        d(2025, 1, 1),
        d(2025, 2, 1),
        d(2025, 3, 1),
      ]);
    });

    it('renewalDay=31 in Feb → overflows to March 3; March 31 is future → stops', () => {
      // startDate=Feb 1 2025. Feb 31 overflows to Mar 3 (< now). Mar 31 overflows to Apr? No:
      // Date.UTC(2025, 2, 31) = March 31 which is valid (March has 31 days). Mar 31 >= now → break.
      const result = computePastRenewalDates(31, 1, null, d(2025, 2, 1), []);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(d(2025, 3, 3)); // Feb 31 overflows to Mar 3
    });

    it('multiple skipped months in a row', () => {
      // Skip Jan and Feb → only Mar 1 (< now) is included
      const result = computePastRenewalDates(1, 1, null, d(2025, 1, 1), [
        { year: 2025, month: 1 },
        { year: 2025, month: 2 },
      ]);
      expect(result).toEqual([d(2025, 3, 1)]);
    });
  });

  // ─────────────────────────────────────────────
  // BIMONTHLY
  // ─────────────────────────────────────────────
  describe('bimonthly (intervalMonths=2)', () => {
    it('startingMonth=1 (Jan/Mar/May…): Jan and Mar qualify; May is future', () => {
      // startDate=Jan 1 2025. Jan aligned(0%2=0), Feb skipped(1%2=1), Mar aligned(2%2=0).
      // Mar 1 < now. May 1 >= now → break.
      const result = computePastRenewalDates(1, 2, 1, d(2025, 1, 1), []);
      expect(result).toEqual([d(2025, 1, 1), d(2025, 3, 1)]);
    });

    it('startingMonth=2 (Feb/Apr/Jun…): only Feb qualifies; Apr is future', () => {
      const result = computePastRenewalDates(1, 2, 2, d(2025, 1, 1), []);
      expect(result).toEqual([d(2025, 2, 1)]);
    });

    it('year-spanning bimonthly: Nov 2024 and Jan 2025 qualify', () => {
      // startingMonth=1 (Nov: offset=10, 10%2=0 → aligned). Nov 2024, Jan 2025 aligned.
      // Mar 2025 >= now 15th → depends on renewalDay. Use renewalDay=20.
      // Nov 20 2024: < now. Jan 20 2025: < now. Mar 20 2025: >= now → break.
      const result = computePastRenewalDates(20, 2, 1, d(2024, 11, 1), []);
      expect(result).toEqual([d(2024, 11, 20), d(2025, 1, 20)]);
    });

    it('skipped aligned month is excluded', () => {
      // startingMonth=1. Jan, Mar aligned. Skip Jan → only Mar.
      const result = computePastRenewalDates(1, 2, 1, d(2025, 1, 1), [{ year: 2025, month: 1 }]);
      expect(result).toEqual([d(2025, 3, 1)]);
    });
  });

  // ─────────────────────────────────────────────
  // QUARTERLY
  // ─────────────────────────────────────────────
  describe('quarterly (intervalMonths=3)', () => {
    it('startingMonth=1: 5 quarters from Jan 2024 through Jan 2025', () => {
      // Jan/Apr/Jul/Oct 2024, Jan 2025 — all < now. Apr 2025 >= now → stops.
      const result = computePastRenewalDates(1, 3, 1, d(2024, 1, 1), []);
      expect(result).toEqual([
        d(2024, 1, 1),
        d(2024, 4, 1),
        d(2024, 7, 1),
        d(2024, 10, 1),
        d(2025, 1, 1),
      ]);
    });

    it('skipped quarter is excluded', () => {
      // startingMonth=1, skip Jul 2024 → 4 results
      const result = computePastRenewalDates(1, 3, 1, d(2024, 1, 1), [{ year: 2024, month: 7 }]);
      expect(result).toEqual([d(2024, 1, 1), d(2024, 4, 1), d(2024, 10, 1), d(2025, 1, 1)]);
    });

    it('startDate between quarters → first result is the first aligned month ≥ startDate', () => {
      // startDate=May 1 2024. startingMonth=1: Jul is first aligned after May.
      const result = computePastRenewalDates(1, 3, 1, d(2024, 5, 1), []);
      expect(result).toEqual([d(2024, 7, 1), d(2024, 10, 1), d(2025, 1, 1)]);
    });

    it('startingMonth=2 (Feb/May/Aug/Nov): correct alignment', () => {
      // startDate=Feb 1 2024. Aligned: Feb, May, Aug, Nov 2024, Feb 2025.
      // Feb 2025 renewalDay=1 < now(Mar 15) → included. May 2025 >= now → break.
      const result = computePastRenewalDates(1, 3, 2, d(2024, 2, 1), []);
      expect(result).toEqual([
        d(2024, 2, 1),
        d(2024, 5, 1),
        d(2024, 8, 1),
        d(2024, 11, 1),
        d(2025, 2, 1),
      ]);
    });
  });

  // ─────────────────────────────────────────────
  // SEMI-ANNUAL  (intervalMonths=6)
  // ─────────────────────────────────────────────
  describe('semi-annual (intervalMonths=6)', () => {
    it('startingMonth=1 (Jan/Jul): Jan 2024, Jul 2024, Jan 2025 all qualify', () => {
      // Jul 2025 >= now → stops.
      const result = computePastRenewalDates(15, 6, 1, d(2024, 1, 1), []);
      expect(result).toEqual([d(2024, 1, 15), d(2024, 7, 15), d(2025, 1, 15)]);
    });

    it('startingMonth=3 (Mar/Sep): Mar 2024, Sep 2024 qualify; Mar 2025 renewalDay=20 is future', () => {
      // Mar 20 2025 >= now(Mar 15T12:00) → break before including.
      const result = computePastRenewalDates(20, 6, 3, d(2024, 3, 1), []);
      expect(result).toEqual([d(2024, 3, 20), d(2024, 9, 20)]);
    });

    it('skip one semi-annual date → excluded', () => {
      // startingMonth=1: skip Jul 2024 → [Jan 2024, Jan 2025]
      const result = computePastRenewalDates(15, 6, 1, d(2024, 1, 1), [{ year: 2024, month: 7 }]);
      expect(result).toEqual([d(2024, 1, 15), d(2025, 1, 15)]);
    });
  });

  // ─────────────────────────────────────────────
  // 4-MONTH INTERVAL  (intervalMonths=4)
  // ─────────────────────────────────────────────
  describe('4-month interval (intervalMonths=4)', () => {
    // startingMonth=1 → aligned: Jan(0), May(4), Sep(8)
    // startDate=2024-01-01, now=2025-03-15T12:00Z
    // Jan 2024, May 2024, Sep 2024, Jan 2025 all < now.
    // May 2025 >= now → stops. → 4 dates.

    it('startingMonth=1 (Jan/May/Sep): Jan 2024, May 2024, Sep 2024, Jan 2025 qualify', () => {
      const result = computePastRenewalDates(1, 4, 1, d(2024, 1, 1), []);
      expect(result).toEqual([
        d(2024, 1, 1),
        d(2024, 5, 1),
        d(2024, 9, 1),
        d(2025, 1, 1),
      ]);
    });

    it('non-aligned months are never included', () => {
      const result = computePastRenewalDates(1, 4, 1, d(2024, 1, 1), []);
      const months = result.map((r) => r.getUTCMonth() + 1);
      for (const m of months) {
        // Aligned months for startingMonth=1, interval=4: offset=(m-1)%12 must be 0,4,8
        const offset = ((m - 1) % 12 + 12) % 12;
        expect(offset % 4).toBe(0);
      }
    });

    it('startingMonth=3 (Mar/Jul/Nov): Mar 2024, Jul 2024, Nov 2024 qualify; Mar 2025 day=1 qualifies', () => {
      // Mar 1 2025 < now(Mar 15). Jul 2025 >= now → stops.
      const result = computePastRenewalDates(1, 4, 3, d(2024, 3, 1), []);
      expect(result).toEqual([
        d(2024, 3, 1),
        d(2024, 7, 1),
        d(2024, 11, 1),
        d(2025, 3, 1),
      ]);
    });

    it('skip one 4-month cycle → excluded', () => {
      // startingMonth=1, skip Sep 2024 → [Jan 2024, May 2024, Jan 2025]
      const result = computePastRenewalDates(1, 4, 1, d(2024, 1, 1), [{ year: 2024, month: 9 }]);
      expect(result).toEqual([d(2024, 1, 1), d(2024, 5, 1), d(2025, 1, 1)]);
    });

    it('startDate between aligned months → first result is the first aligned date ≥ startDate', () => {
      // startDate=Mar 1 2024; startingMonth=1. Mar not aligned (offset=2). May 2024 is first.
      const result = computePastRenewalDates(1, 4, 1, d(2024, 3, 1), []);
      expect(result).toEqual([d(2024, 5, 1), d(2024, 9, 1), d(2025, 1, 1)]);
    });
  });

  // ─────────────────────────────────────────────
  // ANNUAL  (intervalMonths=12)
  // ─────────────────────────────────────────────
  describe('annual (intervalMonths=12)', () => {
    it('startingMonth=3 (March): Mar 2023, Mar 2024, Mar 2025 (day=1) all qualify', () => {
      // Mar 1 2025 < now(Mar 15T12) → included. Mar 1 2026 >= now → stops.
      const result = computePastRenewalDates(1, 12, 3, d(2023, 3, 1), []);
      expect(result).toEqual([d(2023, 3, 1), d(2024, 3, 1), d(2025, 3, 1)]);
    });

    it('startingMonth=1 (January): Jan 2024 and Jan 2025 qualify', () => {
      const result = computePastRenewalDates(15, 12, 1, d(2024, 1, 1), []);
      expect(result).toEqual([d(2024, 1, 15), d(2025, 1, 15)]);
    });

    it('skip one annual occurrence → excluded', () => {
      // startingMonth=3, skip Mar 2024 → [Mar 2023, Mar 2025]
      const result = computePastRenewalDates(1, 12, 3, d(2023, 3, 1), [{ year: 2024, month: 3 }]);
      expect(result).toEqual([d(2023, 3, 1), d(2025, 3, 1)]);
    });
  });
});
