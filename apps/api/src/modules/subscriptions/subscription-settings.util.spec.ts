import { resolveEffectiveSettings, SubscriptionSettings } from './subscription-settings.util';

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE: SubscriptionSettings = {
  renewalDay: 1,
  renewalDayUserSet: false,
  paymentOnStartup: false,
  signupIncludesCurrentMonth: false,
  renewalMonthOffset: 0,
};

function rec(
  date: string, // 'YYYY-MM-DD'
  overrides: Partial<SubscriptionSettings> = {},
) {
  return { effectiveFrom: new Date(date), ...BASE, ...overrides };
}

describe('resolveEffectiveSettings', () => {
  // ── Empty history ─────────────────────────────────────────────────────────

  describe('empty history', () => {
    it('returns fallback when history is empty', () => {
      const result = resolveEffectiveSettings([], 2024, 6, BASE);
      expect(result).toEqual(BASE);
    });

    it('preserves non-default fallback values', () => {
      const fallback: SubscriptionSettings = {
        renewalDay: 15,
        renewalDayUserSet: true,
        paymentOnStartup: true,
        signupIncludesCurrentMonth: true,
        renewalMonthOffset: 1,
      };
      const result = resolveEffectiveSettings([], 2024, 6, fallback);
      expect(result).toEqual(fallback);
    });
  });

  // ── Single record applicability ───────────────────────────────────────────

  describe('single record applicability', () => {
    it('applies record when effectiveFrom is in the same month as target', () => {
      const result = resolveEffectiveSettings(
        [rec('2024-06-01', { renewalDay: 15 })],
        2024, 6, BASE,
      );
      expect(result.renewalDay).toBe(15);
    });

    it('applies record when effectiveFrom is the last day of the target month', () => {
      const result = resolveEffectiveSettings(
        [rec('2024-06-30', { renewalDay: 15 })],
        2024, 6, BASE,
      );
      expect(result.renewalDay).toBe(15);
    });

    it('applies record from a previous month', () => {
      const result = resolveEffectiveSettings(
        [rec('2024-01-01', { renewalDay: 10 })],
        2024, 6, BASE,
      );
      expect(result.renewalDay).toBe(10);
    });

    it('applies record from a previous year', () => {
      const result = resolveEffectiveSettings(
        [rec('2022-06-01', { paymentOnStartup: true })],
        2024, 3, BASE,
      );
      expect(result.paymentOnStartup).toBe(true);
    });

    it('does NOT apply record from a future month (same year)', () => {
      const result = resolveEffectiveSettings(
        [rec('2024-09-01', { renewalDay: 15 })],
        2024, 6, BASE,
      );
      expect(result).toEqual(BASE); // fallback
    });

    it('does NOT apply record from a future year', () => {
      const result = resolveEffectiveSettings(
        [rec('2025-01-01', { renewalDay: 15 })],
        2024, 12, BASE,
      );
      expect(result).toEqual(BASE);
    });
  });

  // ── Multiple records — most recent wins ───────────────────────────────────

  describe('multiple records — most recent wins', () => {
    it('selects the most recent applicable record', () => {
      const history = [
        rec('2022-01-01', { renewalDay: 5 }),
        rec('2023-06-01', { renewalDay: 10 }),
        rec('2024-03-01', { renewalDay: 15 }),
        rec('2025-01-01', { renewalDay: 20 }), // future
      ];
      const result = resolveEffectiveSettings(history, 2024, 6, BASE);
      expect(result.renewalDay).toBe(15);
    });

    it('picks the record effective exactly in the same month over an older one', () => {
      const history = [
        rec('2024-01-01', { renewalMonthOffset: 1 }),
        rec('2024-06-15', { renewalMonthOffset: 2 }),
      ];
      const result = resolveEffectiveSettings(history, 2024, 6, BASE);
      expect(result.renewalMonthOffset).toBe(2);
    });

    it('uses the older record when the newer one falls in the next month', () => {
      const history = [
        rec('2024-05-01', { signupIncludesCurrentMonth: false }),
        rec('2024-07-01', { signupIncludesCurrentMonth: true }), // not yet
      ];
      const result = resolveEffectiveSettings(history, 2024, 6, BASE);
      expect(result.signupIncludesCurrentMonth).toBe(false);
    });
  });

  // ── Year boundary ─────────────────────────────────────────────────────────

  describe('year boundaries', () => {
    it('December record applies to January of the following year', () => {
      const result = resolveEffectiveSettings(
        [rec('2023-12-01', { paymentOnStartup: true })],
        2024, 1, BASE,
      );
      expect(result.paymentOnStartup).toBe(true);
    });

    it('January record does NOT apply to December of the previous year', () => {
      const result = resolveEffectiveSettings(
        [rec('2024-01-01', { paymentOnStartup: true })],
        2023, 12, BASE,
      );
      expect(result).toEqual(BASE);
    });
  });

  // ── All settings fields ───────────────────────────────────────────────────

  describe('full settings snapshot', () => {
    it('returns all five fields from the applicable record', () => {
      const expected: SubscriptionSettings = {
        renewalDay: 15,
        renewalDayUserSet: true,
        paymentOnStartup: true,
        signupIncludesCurrentMonth: true,
        renewalMonthOffset: 2,
      };
      const result = resolveEffectiveSettings(
        [rec('2024-01-01', expected)],
        2024, 6, BASE,
      );
      expect(result).toEqual(expected);
    });

    it('returns renewalDay=null when renewalDayUserSet mode was in effect', () => {
      const result = resolveEffectiveSettings(
        [rec('2024-01-01', { renewalDay: null, renewalDayUserSet: true })],
        2024, 6, BASE,
      );
      expect(result.renewalDay).toBeNull();
      expect(result.renewalDayUserSet).toBe(true);
    });

    it('coalesces null renewalMonthOffset from history record to fallback value', () => {
      // Older DB records may have renewalMonthOffset=null (field added after initial deployment).
      // The fallback (current sub settings) value must be used instead to prevent silent bugs.
      const fallback: SubscriptionSettings = { ...BASE, renewalMonthOffset: 1 };
      const result = resolveEffectiveSettings(
        [{ effectiveFrom: new Date('2024-01-01'), ...BASE, renewalMonthOffset: null as any }],
        2024, 6, fallback,
      );
      expect(result.renewalMonthOffset).toBe(1); // falls back to fallback, not null/0
    });

    it('does NOT include effectiveFrom in returned object', () => {
      const result = resolveEffectiveSettings(
        [rec('2024-01-01', { renewalDay: 5 })],
        2024, 6, BASE,
      );
      expect('effectiveFrom' in result).toBe(false);
    });
  });

  // ── Backfill scenarios ────────────────────────────────────────────────────

  describe('backfill scenarios', () => {
    /**
     * Simulates a subscription that changed from renewalDayUserSet → fixed day (15)
     * in mid-2023, then later changed offset from 0 to 1 in 2024.
     */
    const settingsHistory = [
      rec('2021-01-01', { renewalDay: null, renewalDayUserSet: true, renewalMonthOffset: 0 }),
      rec('2023-07-01', { renewalDay: 15, renewalDayUserSet: false, renewalMonthOffset: 0 }),
      rec('2024-03-01', { renewalDay: 15, renewalDayUserSet: false, renewalMonthOffset: 1 }),
    ];

    const cases: [number, number, number | null, boolean, number][] = [
      // [year, month, expectedRenewalDay, expectedUserSet, expectedOffset]
      [2020, 12, 1, false, 0],    // before any history → fallback (BASE: renewalDay=1, userSet=false)
      [2021, 6, null, true, 0],   // first record applies
      [2023, 6, null, true, 0],   // still user-set (July record not yet effective)
      [2023, 7, 15, false, 0],    // fixed day kicks in
      [2024, 2, 15, false, 0],    // before offset change
      [2024, 3, 15, false, 1],    // offset change kicks in
      [2025, 1, 15, false, 1],    // latest record still applies
    ];

    it.each(cases)(
      'month %i-%i → renewalDay=%s userSet=%s offset=%i',
      (year, month, expectedRenewalDay, expectedUserSet, expectedOffset) => {
        const result = resolveEffectiveSettings(settingsHistory, year, month, BASE);
        expect(result.renewalDay).toBe(expectedRenewalDay);
        expect(result.renewalDayUserSet).toBe(expectedUserSet);
        expect(result.renewalMonthOffset).toBe(expectedOffset);
      },
    );

    it('signupIncludesCurrentMonth change is reflected per backfill month', () => {
      const history = [
        rec('2022-01-01', { signupIncludesCurrentMonth: false }),
        rec('2023-09-01', { signupIncludesCurrentMonth: true }),
      ];
      expect(resolveEffectiveSettings(history, 2023, 8, BASE).signupIncludesCurrentMonth).toBe(false);
      expect(resolveEffectiveSettings(history, 2023, 9, BASE).signupIncludesCurrentMonth).toBe(true);
      expect(resolveEffectiveSettings(history, 2024, 1, BASE).signupIncludesCurrentMonth).toBe(true);
    });
  });
});
