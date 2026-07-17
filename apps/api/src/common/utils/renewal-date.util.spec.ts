import { computeNextRenewalDate, computeNextRenewalDatePrepaid, computePastRenewalDates, isSubscriptionDueInMonth } from './renewal-date.util';

const FIXED_NOW = new Date('2025-03-15T12:00:00Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// computeNextRenewalDate
// ---------------------------------------------------------------------------

describe('computeNextRenewalDate', () => {
  it('monthly: returns this month renewal day when it has not passed yet', () => {
    // Day 20, now is March 15 → March 20 is still in the future
    const result = computeNextRenewalDate(20, 1, null, null);
    expect(result).toEqual(new Date(Date.UTC(2025, 2, 20)));
  });

  it('monthly: returns next month when renewal day has already passed this month', () => {
    // Day 10, now is March 15 → March 10 already passed → April 10
    const result = computeNextRenewalDate(10, 1, null, null);
    expect(result).toEqual(new Date(Date.UTC(2025, 3, 10)));
  });

  it('monthly: skips a month in skippedMonths and returns the month after', () => {
    // Day 10, March 10 passed, April skipped → May 10
    const result = computeNextRenewalDate(10, 1, null, null, [{ year: 2025, month: 4 }]);
    expect(result).toEqual(new Date(Date.UTC(2025, 4, 10)));
  });

  it('QUARTERLY: only returns dates aligned to startingMonth every 3 months', () => {
    // startingMonth=1 (Jan). Quarterly months: Jan, Apr, Jul, Oct.
    // March is offset 2 (not 0 or 3), April is offset 3 (3%3=0) → April 1 2025
    const result = computeNextRenewalDate(1, 3, 1, null);
    expect(result).toEqual(new Date(Date.UTC(2025, 3, 1)));
  });

  it('BIMONTHLY: only returns dates aligned every 2 months from startingMonth', () => {
    // startingMonth=1 (Jan). Bimonthly months: Jan, Mar, May...
    // March offset 2 (2%2=0) → March 20 2025, which is after March 15 → valid
    const result = computeNextRenewalDate(20, 2, 1, null);
    expect(result).toEqual(new Date(Date.UTC(2025, 2, 20)));
  });

  it('paidUpFrontDate: skips the month matching paidUpFrontDate', () => {
    // Day 20, March is skipped due to paidUpFrontDate being in March 2025
    const paidUpFrontDate = new Date(2025, 2, 1); // March 2025 local time
    const result = computeNextRenewalDate(20, 1, null, null, [], paidUpFrontDate);
    expect(result).toEqual(new Date(Date.UTC(2025, 3, 20)));
  });

  it('returns null if no valid date >= userStartDate can be found within 24 months', () => {
    // startDate is 2030 — well beyond the 24-month search window from March 2025
    const result = computeNextRenewalDate(1, 1, null, '2030-01-01');
    expect(result).toBeNull();
  });

  it('userStartDate: returns first candidate >= startDate', () => {
    // Day 20, startDate = May 1 2025. March/April 20 would be found but < startDate.
    // May 20 2025 >= startDate → should return May 20.
    const result = computeNextRenewalDate(20, 1, null, '2025-05-01');
    expect(result).toEqual(new Date(Date.UTC(2025, 4, 20)));
  });

  it('skipped month in the future does not block returning the next available month', () => {
    // Day 20, March skipped → next is April 20
    const result = computeNextRenewalDate(20, 1, null, null, [{ year: 2025, month: 3 }]);
    expect(result).toEqual(new Date(Date.UTC(2025, 3, 20)));
  });

  describe('subscriptionEarliestDate: user joins before subscription starts', () => {
    // FIXED_NOW = 2025-03-15. Subscription starts Nov 1 2026, 4-month interval,
    // startingMonth=11 (cycle: Nov, Mar, Jul, Nov...).
    // User joins now and sets their start to Jan 2025.
    // Without fix: July 2026 would be returned (aligned to cycle, after now, after userStart).
    // With fix: Nov 20 2026 is returned (first cycle month >= subscription start).

    it('non-paymentOnStartup: skips cycle dates before subscription start, returns first valid renewal', () => {
      // now = Mar 15 2025, sub starts Nov 1 2026, 4-month cycle from Nov
      // Aligned months from now: Jul 2025 (skip <Nov2026), Nov 2025 (skip), Mar 2026 (skip), Jul 2026 (skip), Nov 2026 ✓
      const subStart = new Date(Date.UTC(2026, 10, 1)); // Nov 1 2026
      const result = computeNextRenewalDate(20, 4, 11, '2025-01-01', [], null, subStart);
      expect(result).toEqual(new Date(Date.UTC(2026, 10, 20))); // Nov 20 2026
    });

    it('paymentOnStartup: skips sub-start cycle date (paid at signup), returns next cycle', () => {
      // Same setup, but paymentOnStartup: Nov 2026 is paid at signup, next renewal = Mar 2027
      const subStart = new Date(Date.UTC(2026, 10, 1)); // Nov 1 2026
      const paidUpFront = new Date(Date.UTC(2026, 10, 20)); // Nov 20 2026 (paid at signup)
      const result = computeNextRenewalDate(20, 4, 11, '2025-01-01', [], paidUpFront, subStart);
      expect(result).toEqual(new Date(Date.UTC(2027, 2, 20))); // Mar 20 2027
    });

    it('no effect when user joins after subscription start (normal case)', () => {
      // sub started Jan 2025 (in the past) — subscriptionEarliestDate doesn't block anything
      const subStart = new Date(Date.UTC(2025, 0, 1)); // Jan 1 2025
      const result = computeNextRenewalDate(20, 1, null, null, [], null, subStart);
      expect(result).toEqual(new Date(Date.UTC(2025, 2, 20))); // Mar 20 2025 (normal)
    });

    it('renewalMonthOffset=1: subscriptionEarliestDate shifted back by 1 month → returns Oct renewal', () => {
      // Sub's first BOX is Nov 2026, renewalMonthOffset=1 → first RENEWAL is Oct 2026.
      // DB stores startingMonth in renewal-month space: box Nov, offset=1 → startingMonth=10.
      // refreshNextRenewalDate shifts sub.startDate back by offset before passing here:
      //   Nov 2026 - 1 month = Oct 2026 → subscriptionEarliestDate = Oct 1 2026.
      // Aligned 4-monthly renewal months from Oct: Oct, Feb, Jun, Oct...
      // First aligned renewal >= Oct 1 2026 is Oct 20 2026.
      const subStartShifted = new Date(Date.UTC(2026, 9, 1)); // Oct 1 2026 (Nov - offset=1)
      const result = computeNextRenewalDate(20, 4, 10, '2025-01-01', [], null, subStartShifted);
      expect(result).toEqual(new Date(Date.UTC(2026, 9, 20))); // Oct 20 2026
    });

    it('renewalMonthOffset=1 + paymentOnStartup: Oct renewal paid at signup → next is Feb 2027', () => {
      // Same setup with payment on signup: Oct 2026 renewal paid at signup.
      // Next renewal after Oct (skipped) in 4-monthly cycle (Oct,Feb,Jun) = Feb 2027.
      const subStartShifted = new Date(Date.UTC(2026, 9, 1)); // Oct 1 2026
      const paidUpFront = new Date(Date.UTC(2026, 9, 20)); // Oct 20 2026 (paid at signup)
      const result = computeNextRenewalDate(20, 4, 10, '2025-01-01', [], paidUpFront, subStartShifted);
      expect(result).toEqual(new Date(Date.UTC(2027, 1, 20))); // Feb 20 2027
    });
  });
});

// ---------------------------------------------------------------------------
// computePastRenewalDates
// ---------------------------------------------------------------------------

describe('computePastRenewalDates', () => {
  it('monthly: returns all past dates from startDate up to (not including) now', () => {
    const startDate = new Date(Date.UTC(2025, 0, 1)); // Jan 1 2025
    const result = computePastRenewalDates(1, 1, null, startDate, []);
    expect(result).toEqual([
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 1, 1)),
      new Date(Date.UTC(2025, 2, 1)),
    ]);
  });

  it('monthly: skipped months are excluded from results', () => {
    const startDate = new Date(Date.UTC(2025, 0, 1));
    const result = computePastRenewalDates(1, 1, null, startDate, [{ year: 2025, month: 2 }]);
    expect(result).toEqual([
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 2, 1)),
    ]);
  });

  it('QUARTERLY: returns only dates every 3 months aligned to startingMonth', () => {
    const startDate = new Date(Date.UTC(2024, 0, 1)); // Jan 2024
    const result = computePastRenewalDates(1, 3, 1, startDate, []);
    expect(result).toEqual([
      new Date(Date.UTC(2024, 0, 1)),
      new Date(Date.UTC(2024, 3, 1)),
      new Date(Date.UTC(2024, 6, 1)),
      new Date(Date.UTC(2024, 9, 1)),
      new Date(Date.UTC(2025, 0, 1)),
    ]);
  });

  it('future startDate returns an empty array', () => {
    const startDate = new Date(Date.UTC(2025, 3, 1)); // April 2025 — still in the future
    const result = computePastRenewalDates(1, 1, null, startDate, []);
    expect(result).toEqual([]);
  });

  it('renewal day 31 on a short month overflows into the following month', () => {
    // Feb 2025 has 28 days. Date.UTC(2025, 1, 31) overflows to March 3 2025.
    // March 31 2025 >= now (March 15), so the loop breaks before pushing it.
    const startDate = new Date(Date.UTC(2025, 1, 1)); // Feb 1 2025
    const result = computePastRenewalDates(31, 1, null, startDate, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(new Date(Date.UTC(2025, 2, 3))); // overflowed to March 3
  });
});

// ---------------------------------------------------------------------------
// computeNextRenewalDatePrepaid
// ---------------------------------------------------------------------------

describe('computeNextRenewalDatePrepaid', () => {
  // All tests use FIXED_NOW = 2025-03-15

  it('6-month prepaid, no skips, paymentOnStartup=false: returns renewal after 6 consecutive months', () => {
    // Start Jan 22 2025, renewalDay=1, no skips
    // startDay(22) >= renewalDay(1) → first billing = Feb 2025
    // Period: Feb, Mar, Apr, May, Jun, Jul → next renewal Aug 1 2025
    const startDate = new Date(Date.UTC(2025, 0, 22)); // Jan 22 2025
    const result = computeNextRenewalDatePrepaid(1, 6, startDate, false, null, []);
    expect(result).toEqual(new Date(Date.UTC(2025, 7, 1))); // Aug 1 2025
  });

  it('6-month prepaid, skip March, paymentOnStartup=false: extends period by 1 month', () => {
    // Start Jan 22 2026, renewalDay=1, skip March 2026
    // First billing Feb 2026. Count 6 non-skipped: Feb, (skip Mar), Apr, May, Jun, Jul, Aug → Aug is 6th
    // Next renewal = Sep 1 2026
    jest.setSystemTime(new Date('2026-05-01T12:00:00Z'));
    const startDate = new Date(Date.UTC(2026, 0, 22)); // Jan 22 2026
    const result = computeNextRenewalDatePrepaid(1, 6, startDate, false, null, [{ year: 2026, month: 3 }]);
    expect(result).toEqual(new Date(Date.UTC(2026, 8, 1))); // Sep 1 2026
  });

  it('6-month prepaid, multiple skips: each skip extends the period', () => {
    // Start Jan 22 2026, renewalDay=1, skip March and May 2026
    // Period: Feb, (skip Mar), Apr, (skip May), Jun, Jul, Aug, Sep → Sep is 6th
    // Next renewal = Oct 1 2026
    jest.setSystemTime(new Date('2026-05-01T12:00:00Z'));
    const startDate = new Date(Date.UTC(2026, 0, 22));
    const result = computeNextRenewalDatePrepaid(1, 6, startDate, false, null, [
      { year: 2026, month: 3 },
      { year: 2026, month: 5 },
    ]);
    expect(result).toEqual(new Date(Date.UTC(2026, 9, 1))); // Oct 1 2026
  });

  it('6-month prepaid, paymentOnStartup=true: first billing from paidUpFrontDate', () => {
    // Paid up front Jan 2025, 6-month prepaid, no skips, renewalDay=1
    // Period: Jan, Feb, Mar, Apr, May, Jun → next renewal Jul 1 2025
    const startDate = new Date(Date.UTC(2025, 0, 1));
    const paidUpFront = new Date(Date.UTC(2025, 0, 1)); // Jan 1 2025
    const result = computeNextRenewalDatePrepaid(1, 6, startDate, true, paidUpFront, []);
    expect(result).toEqual(new Date(Date.UTC(2025, 6, 1))); // Jul 1 2025
  });

  it('advances past multiple completed periods to find the current one', () => {
    // Start Feb 1 2024, 3-month prepaid, no skips, renewalDay=1
    // now = March 15 2025
    // Period 1: Feb, Mar, Apr → next May 1 2024 (past)
    // Period 2: May, Jun, Jul → next Aug 1 2024 (past)
    // Period 3: Aug, Sep, Oct → next Nov 1 2024 (past)
    // Period 4: Nov, Dec, Jan → next Feb 1 2025 (past)
    // Period 5: Feb, Mar, Apr 2025 → next May 1 2025 (future) ✓
    const startDate = new Date(Date.UTC(2024, 1, 1)); // Feb 1 2024 (startDay=1 < renewalDay=1? No, equal → increment to Mar 2024)
    // Actually startDay(1) >= renewalDay(1) → billingMonth = March 2024
    // Period 1: Mar, Apr, May → next Jun 1 2024
    // Period 2: Jun, Jul, Aug → next Sep 1 2024
    // Period 3: Sep, Oct, Nov → next Dec 1 2024
    // Period 4: Dec 2024, Jan, Feb 2025 → next Mar 1 2025 (past, now=Mar 15)
    // Period 5: Mar, Apr, May 2025 → next Jun 1 2025 (future) ✓
    const result = computeNextRenewalDatePrepaid(1, 3, startDate, false, null, []);
    expect(result).toEqual(new Date(Date.UTC(2025, 5, 1))); // Jun 1 2025
  });
});

// ---------------------------------------------------------------------------
// isSubscriptionDueInMonth
// ---------------------------------------------------------------------------

describe('isSubscriptionDueInMonth', () => {
  const NOW = new Date(Date.UTC(2025, 2, 15)); // March 15 2025

  it('active subscription with no bounds is due in any month', () => {
    const sub = { startDate: null, endDate: null, isDiscontinued: false, isHidden: false };
    expect(isSubscriptionDueInMonth(sub, 2025, 3, NOW)).toBe(true);
    expect(isSubscriptionDueInMonth(sub, 2020, 1, NOW)).toBe(true);
    expect(isSubscriptionDueInMonth(sub, 2030, 12, NOW)).toBe(true);
  });

  it('isHidden=true is excluded unconditionally, past or future', () => {
    const sub = { startDate: null, endDate: null, isDiscontinued: false, isHidden: true };
    expect(isSubscriptionDueInMonth(sub, 2024, 1, NOW)).toBe(false);
    expect(isSubscriptionDueInMonth(sub, 2025, 3, NOW)).toBe(false);
    expect(isSubscriptionDueInMonth(sub, 2026, 1, NOW)).toBe(false);
  });

  it('isDiscontinued=true stays visible for PAST months', () => {
    const sub = { startDate: null, endDate: null, isDiscontinued: true, isHidden: false };
    expect(isSubscriptionDueInMonth(sub, 2025, 2, NOW)).toBe(true); // February, before current month
    expect(isSubscriptionDueInMonth(sub, 2020, 6, NOW)).toBe(true);
  });

  it('isDiscontinued=true is excluded for the current month and future months', () => {
    const sub = { startDate: null, endDate: null, isDiscontinued: true, isHidden: false };
    expect(isSubscriptionDueInMonth(sub, 2025, 3, NOW)).toBe(false); // current month
    expect(isSubscriptionDueInMonth(sub, 2025, 4, NOW)).toBe(false); // future
    expect(isSubscriptionDueInMonth(sub, 2030, 1, NOW)).toBe(false);
  });

  it('startDate in the future excludes months before it', () => {
    const sub = { startDate: new Date(Date.UTC(2025, 5, 1)), endDate: null, isDiscontinued: false, isHidden: false };
    expect(isSubscriptionDueInMonth(sub, 2025, 5, NOW)).toBe(false); // May, before June start
    expect(isSubscriptionDueInMonth(sub, 2025, 6, NOW)).toBe(true); // June, start month itself
    expect(isSubscriptionDueInMonth(sub, 2025, 7, NOW)).toBe(true);
  });

  it('endDate in the past excludes months after it', () => {
    const sub = { startDate: null, endDate: new Date(Date.UTC(2025, 0, 31)), isDiscontinued: false, isHidden: false };
    expect(isSubscriptionDueInMonth(sub, 2025, 1, NOW)).toBe(true); // January, endDate falls within it
    expect(isSubscriptionDueInMonth(sub, 2025, 2, NOW)).toBe(false); // February, after endDate
  });

  it('startDate and endDate together bound an active window', () => {
    const sub = {
      startDate: new Date(Date.UTC(2024, 5, 1)),
      endDate: new Date(Date.UTC(2024, 11, 31)),
      isDiscontinued: false,
      isHidden: false,
    };
    expect(isSubscriptionDueInMonth(sub, 2024, 5, NOW)).toBe(false); // before start
    expect(isSubscriptionDueInMonth(sub, 2024, 6, NOW)).toBe(true); // start month
    expect(isSubscriptionDueInMonth(sub, 2024, 12, NOW)).toBe(true); // end month
    expect(isSubscriptionDueInMonth(sub, 2025, 1, NOW)).toBe(false); // after end
  });

  it('non-bundle quarterly (intervalMonths=3, isBundleSubscription=false) is only due on cadence-aligned months', () => {
    // Real data case: "Romance Quarterly Subscription", startingMonth=3, intervalMonths=3
    // → only has SubscriptionMonth rows in Mar/Jun/Sep/Dec, never Jan/Feb/Apr/May/...
    const sub = { startDate: null, endDate: null, isDiscontinued: false, isHidden: false, intervalMonths: 3, startingMonth: 3, isBundleSubscription: false };
    expect(isSubscriptionDueInMonth(sub, 2026, 3, NOW)).toBe(true)
    expect(isSubscriptionDueInMonth(sub, 2026, 6, NOW)).toBe(true)
    expect(isSubscriptionDueInMonth(sub, 2026, 9, NOW)).toBe(true)
    expect(isSubscriptionDueInMonth(sub, 2026, 4, NOW)).toBe(false)
    expect(isSubscriptionDueInMonth(sub, 2026, 5, NOW)).toBe(false)
    expect(isSubscriptionDueInMonth(sub, 2026, 7, NOW)).toBe(false)
    expect(isSubscriptionDueInMonth(sub, 2026, 8, NOW)).toBe(false)
  })

  it('bundle subscription (isBundleSubscription=true) is due EVERY calendar month regardless of intervalMonths', () => {
    // Bundles ship N months packaged together but still carry one SubscriptionMonth row per
    // real calendar month — content is monthly, only the shipping cadence is multi-month.
    const sub = { startDate: null, endDate: null, isDiscontinued: false, isHidden: false, intervalMonths: 3, startingMonth: 1, isBundleSubscription: true };
    for (let m = 1; m <= 12; m++) {
      expect(isSubscriptionDueInMonth(sub, 2026, m, NOW)).toBe(true)
    }
  })

  it('intervalMonths omitted or 1 behaves as monthly regardless of startingMonth', () => {
    const sub = { startDate: null, endDate: null, isDiscontinued: false, isHidden: false, intervalMonths: 1, startingMonth: 7 };
    expect(isSubscriptionDueInMonth(sub, 2026, 1, NOW)).toBe(true)
    expect(isSubscriptionDueInMonth(sub, 2026, 7, NOW)).toBe(true)
  })

  it('startingMonth null on a non-bundle multi-month sub defaults to 1', () => {
    // Real data case: "Dystopian Romance Quarterly Subscription" has startingMonth: null
    const sub = { startDate: null, endDate: null, isDiscontinued: false, isHidden: false, intervalMonths: 3, startingMonth: null, isBundleSubscription: false };
    expect(isSubscriptionDueInMonth(sub, 2026, 1, NOW)).toBe(true)
    expect(isSubscriptionDueInMonth(sub, 2026, 4, NOW)).toBe(true)
    expect(isSubscriptionDueInMonth(sub, 2026, 2, NOW)).toBe(false)
  })
});
