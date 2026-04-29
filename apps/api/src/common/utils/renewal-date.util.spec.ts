import { computeNextRenewalDate, computePastRenewalDates } from './renewal-date.util';

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
    const result = computeNextRenewalDate(20, null, null, null);
    expect(result).toEqual(new Date(Date.UTC(2025, 2, 20)));
  });

  it('monthly: returns next month when renewal day has already passed this month', () => {
    // Day 10, now is March 15 → March 10 already passed → April 10
    const result = computeNextRenewalDate(10, null, null, null);
    expect(result).toEqual(new Date(Date.UTC(2025, 3, 10)));
  });

  it('monthly: skips a month in skippedMonths and returns the month after', () => {
    // Day 10, March 10 passed, April skipped → May 10
    const result = computeNextRenewalDate(10, null, null, null, [{ year: 2025, month: 4 }]);
    expect(result).toEqual(new Date(Date.UTC(2025, 4, 10)));
  });

  it('QUARTERLY: only returns dates aligned to startingMonth every 3 months', () => {
    // startingMonth=1 (Jan). Quarterly months: Jan, Apr, Jul, Oct.
    // March is offset 2 (not 0 or 3), April is offset 3 (3%3=0) → April 1 2025
    const result = computeNextRenewalDate(1, 'QUARTERLY', 1, null);
    expect(result).toEqual(new Date(Date.UTC(2025, 3, 1)));
  });

  it('BIMONTHLY: only returns dates aligned every 2 months from startingMonth', () => {
    // startingMonth=1 (Jan). Bimonthly months: Jan, Mar, May...
    // March offset 2 (2%2=0) → March 20 2025, which is after March 15 → valid
    const result = computeNextRenewalDate(20, 'BIMONTHLY', 1, null);
    expect(result).toEqual(new Date(Date.UTC(2025, 2, 20)));
  });

  it('paidUpFrontDate: skips the month matching paidUpFrontDate', () => {
    // Day 20, March is skipped due to paidUpFrontDate being in March 2025
    const paidUpFrontDate = new Date(2025, 2, 1); // March 2025 local time
    const result = computeNextRenewalDate(20, null, null, null, [], paidUpFrontDate);
    expect(result).toEqual(new Date(Date.UTC(2025, 3, 20)));
  });

  it('returns null if no valid date >= userStartDate can be found within 24 months', () => {
    // startDate is 2030 — well beyond the 24-month search window from March 2025
    const result = computeNextRenewalDate(1, null, null, '2030-01-01');
    expect(result).toBeNull();
  });

  it('userStartDate: returns first candidate >= startDate', () => {
    // Day 20, startDate = May 1 2025. March/April 20 would be found but < startDate.
    // May 20 2025 >= startDate → should return May 20.
    const result = computeNextRenewalDate(20, null, null, '2025-05-01');
    expect(result).toEqual(new Date(Date.UTC(2025, 4, 20)));
  });

  it('skipped month in the future does not block returning the next available month', () => {
    // Day 20, March skipped → next is April 20
    const result = computeNextRenewalDate(20, null, null, null, [{ year: 2025, month: 3 }]);
    expect(result).toEqual(new Date(Date.UTC(2025, 3, 20)));
  });
});

// ---------------------------------------------------------------------------
// computePastRenewalDates
// ---------------------------------------------------------------------------

describe('computePastRenewalDates', () => {
  it('monthly: returns all past dates from startDate up to (not including) now', () => {
    const startDate = new Date(Date.UTC(2025, 0, 1)); // Jan 1 2025
    const result = computePastRenewalDates(1, null, null, startDate, []);
    expect(result).toEqual([
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 1, 1)),
      new Date(Date.UTC(2025, 2, 1)),
    ]);
  });

  it('monthly: skipped months are excluded from results', () => {
    const startDate = new Date(Date.UTC(2025, 0, 1));
    const result = computePastRenewalDates(1, null, null, startDate, [{ year: 2025, month: 2 }]);
    expect(result).toEqual([
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 2, 1)),
    ]);
  });

  it('QUARTERLY: returns only dates every 3 months aligned to startingMonth', () => {
    const startDate = new Date(Date.UTC(2024, 0, 1)); // Jan 2024
    const result = computePastRenewalDates(1, 'QUARTERLY', 1, startDate, []);
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
    const result = computePastRenewalDates(1, null, null, startDate, []);
    expect(result).toEqual([]);
  });

  it('renewal day 31 on a short month overflows into the following month', () => {
    // Feb 2025 has 28 days. Date.UTC(2025, 1, 31) overflows to March 3 2025.
    // March 31 2025 >= now (March 15), so the loop breaks before pushing it.
    const startDate = new Date(Date.UTC(2025, 1, 1)); // Feb 1 2025
    const result = computePastRenewalDates(31, null, null, startDate, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(new Date(Date.UTC(2025, 2, 3))); // overflowed to March 3
  });
});
