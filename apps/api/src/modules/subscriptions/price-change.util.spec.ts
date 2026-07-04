/**
 * Unit tests for resolveEffectiveBasePrice (price-change.util.ts)
 *
 * Covers:
 *  1. Empty price changes → fallback
 *  2. Single change: exact month, before, after
 *  3. Multiple changes → most recent applicable wins
 *  4. Year-boundary (Dec change → Jan)
 *  5. Sentinel record (year=1900) as universal base
 *  6. targetCurrency filtering: matching, non-matching, multi-currency, null/undefined
 *  7. nextRenewalPriceChanged trigger conditions (fromPriceChange + price !== fallback)
 *  8. Price parsing from string / Decimal-like objects
 *  9. Backfill price selection across months
 * 10. grandfatheredPrice — existing subscribers keep old price, new subscribers get new price
 * 11. parseFirstBilledYearMonth — title parsing with fallbacks
 */

import { resolveEffectiveBasePrice, parseFirstBilledYearMonth } from './price-change.util';

// Helper to build a price change fixture with minimal boilerplate
function pc(
  year: number,
  month: number,
  price: number | string,
  currency = 'EUR',
  grandfatheredPrice = false,
) {
  return {
    effectiveYear: year,
    effectiveMonth: month,
    newBasePrice: { toString: () => String(price) },
    currency,
    grandfatheredPrice,
  };
}

describe('resolveEffectiveBasePrice', () => {
  // ── 1. Empty / null fallback ─────────────────────────────────────────────────

  describe('empty price changes', () => {
    it('returns fallback price when no price changes exist', () => {
      expect(resolveEffectiveBasePrice([], 2024, 1, 10.0)).toEqual({
        price: 10.0,
        currency: null,
        fromPriceChange: false,
      });
    });

    it('returns null price when fallbackPrice is null and no changes exist', () => {
      expect(resolveEffectiveBasePrice([], 2024, 1, null)).toEqual({
        price: null,
        currency: null,
        fromPriceChange: false,
      });
    });
  });

  // ── 2. Single change applicability ──────────────────────────────────────────

  describe('single price change — applicability rules', () => {
    it('applies change when it is effective at the exact target month', () => {
      const result = resolveEffectiveBasePrice([pc(2024, 3, 15.0)], 2024, 3, 10.0);
      expect(result).toEqual({ price: 15.0, currency: 'EUR', fromPriceChange: true });
    });

    it('applies change from an earlier month in the same year', () => {
      const result = resolveEffectiveBasePrice([pc(2024, 1, 15.0)], 2024, 3, 10.0);
      expect(result).toEqual({ price: 15.0, currency: 'EUR', fromPriceChange: true });
    });

    it('applies change from an earlier year', () => {
      const result = resolveEffectiveBasePrice([pc(2023, 12, 15.0)], 2024, 3, 10.0);
      expect(result).toEqual({ price: 15.0, currency: 'EUR', fromPriceChange: true });
    });

    it('does NOT apply change effective in a future month (same year)', () => {
      const result = resolveEffectiveBasePrice([pc(2024, 6, 15.0)], 2024, 3, 10.0);
      expect(result).toEqual({ price: 10.0, currency: null, fromPriceChange: false });
    });

    it('does NOT apply change effective in a future year', () => {
      const result = resolveEffectiveBasePrice([pc(2025, 1, 15.0)], 2024, 12, 10.0);
      expect(result).toEqual({ price: 10.0, currency: null, fromPriceChange: false });
    });

    it('does NOT apply when change year matches but month is still in the future', () => {
      const result = resolveEffectiveBasePrice([pc(2024, 12, 18.0)], 2024, 11, 10.0);
      expect(result).toEqual({ price: 10.0, currency: null, fromPriceChange: false });
    });
  });

  // ── 3. Multiple changes — most recent wins ───────────────────────────────────

  describe('multiple price changes — most recent applicable wins', () => {
    it('selects the most recent change among multiple same-year applicable changes', () => {
      const result = resolveEffectiveBasePrice(
        [pc(2024, 1, 10.0), pc(2024, 3, 15.0), pc(2024, 6, 20.0)],
        2024, 4, 5.0,
      );
      // month=3 is latest applicable (month=6 is in the future)
      expect(result).toEqual({ price: 15.0, currency: 'EUR', fromPriceChange: true });
    });

    it('selects the most recent change across multiple years', () => {
      const result = resolveEffectiveBasePrice(
        [pc(2022, 1, 10.0), pc(2023, 6, 14.0), pc(2025, 1, 20.0)],
        2024, 12, 5.0,
      );
      // 2025-01 is future; 2023-06 is most recent applicable
      expect(result).toEqual({ price: 14.0, currency: 'EUR', fromPriceChange: true });
    });

    it('correctly resolves when all changes are applicable (picks the last one)', () => {
      const result = resolveEffectiveBasePrice(
        [pc(2020, 1, 8.0), pc(2021, 6, 9.0), pc(2022, 12, 11.0), pc(2024, 3, 13.0)],
        2024, 6, 5.0,
      );
      expect(result).toEqual({ price: 13.0, currency: 'EUR', fromPriceChange: true });
    });
  });

  // ── 4. Year boundary ─────────────────────────────────────────────────────────

  describe('year-boundary applicability', () => {
    it('December change applies to the following January', () => {
      const result = resolveEffectiveBasePrice([pc(2023, 12, 18.0)], 2024, 1, 10.0);
      expect(result).toEqual({ price: 18.0, currency: 'EUR', fromPriceChange: true });
    });

    it('January change does NOT apply to the preceding December', () => {
      const result = resolveEffectiveBasePrice([pc(2024, 1, 18.0)], 2023, 12, 10.0);
      expect(result).toEqual({ price: 10.0, currency: null, fromPriceChange: false });
    });
  });

  // ── 5. Sentinel record (year=1900) ───────────────────────────────────────────

  describe('sentinel record (effectiveYear=1900, effectiveMonth=1)', () => {
    it('sentinel applies to any real month (is always ≤ target date)', () => {
      const result = resolveEffectiveBasePrice([pc(1900, 1, 10.0)], 2024, 3, 5.0);
      expect(result).toEqual({ price: 10.0, currency: 'EUR', fromPriceChange: true });
    });

    it('sentinel applies even when fallbackPrice is null', () => {
      const result = resolveEffectiveBasePrice([pc(1900, 1, 10.0)], 2024, 3, null);
      expect(result).toEqual({ price: 10.0, currency: 'EUR', fromPriceChange: true });
    });

    it('explicit change after sentinel overrides it', () => {
      const result = resolveEffectiveBasePrice(
        [pc(1900, 1, 10.0), pc(2024, 1, 15.0)],
        2024, 3, 5.0,
      );
      expect(result).toEqual({ price: 15.0, currency: 'EUR', fromPriceChange: true });
    });

    it('sentinel is used when explicit future change exists but has not kicked in yet', () => {
      const result = resolveEffectiveBasePrice(
        [pc(1900, 1, 10.0), pc(2025, 6, 20.0)],
        2024, 12, 5.0,
      );
      // 2025-06 is future → sentinel is most recent applicable
      expect(result).toEqual({ price: 10.0, currency: 'EUR', fromPriceChange: true });
    });
  });

  // ── 6. targetCurrency filtering ──────────────────────────────────────────────

  describe('targetCurrency filtering', () => {
    it('uses only EUR records when targetCurrency=EUR', () => {
      const result = resolveEffectiveBasePrice(
        [pc(2024, 1, 15.0, 'EUR'), pc(2024, 1, 20.0, 'GBP')],
        2024, 3, 10.0, 'EUR',
      );
      expect(result).toEqual({ price: 15.0, currency: 'EUR', fromPriceChange: true });
    });

    it('uses only GBP records when targetCurrency=GBP', () => {
      const result = resolveEffectiveBasePrice(
        [pc(2024, 1, 15.0, 'EUR'), pc(2024, 1, 20.0, 'GBP')],
        2024, 3, 10.0, 'GBP',
      );
      expect(result).toEqual({ price: 20.0, currency: 'GBP', fromPriceChange: true });
    });

    it('returns fallback (fromPriceChange=false) when no records match targetCurrency', () => {
      const result = resolveEffectiveBasePrice(
        [pc(2024, 1, 15.0, 'EUR')],
        2024, 3, 10.0, 'GBP',
      );
      expect(result).toEqual({ price: 10.0, currency: null, fromPriceChange: false });
    });

    it('considers all currencies when targetCurrency is null', () => {
      const result = resolveEffectiveBasePrice(
        [pc(2024, 1, 15.0, 'EUR'), pc(2024, 3, 20.0, 'GBP')],
        2024, 3, 10.0, null,
      );
      // GBP change is more recent (month 3 vs 1)
      expect(result).toEqual({ price: 20.0, currency: 'GBP', fromPriceChange: true });
    });

    it('considers all currencies when targetCurrency is undefined', () => {
      const result = resolveEffectiveBasePrice(
        [pc(2024, 1, 15.0, 'EUR'), pc(2024, 3, 20.0, 'GBP')],
        2024, 3, 10.0,
      );
      expect(result).toEqual({ price: 20.0, currency: 'GBP', fromPriceChange: true });
    });

    it('preserves custom-currency user price when no matching currency records exist', () => {
      // User has a CHF entry with a custom price; subscription only has EUR price changes.
      // With targetCurrency=CHF → no records → fallback (user's CHF price is preserved).
      const result = resolveEffectiveBasePrice(
        [pc(2024, 1, 15.0, 'EUR'), pc(2023, 6, 12.0, 'EUR')],
        2024, 3, 25.0, 'CHF',
      );
      expect(result).toEqual({ price: 25.0, currency: null, fromPriceChange: false });
    });

    it('picks most recent applicable change within the matching currency', () => {
      const result = resolveEffectiveBasePrice(
        [
          pc(2022, 1, 10.0, 'USD'),
          pc(2023, 6, 14.0, 'USD'),
          pc(2024, 3, 18.0, 'USD'),
          pc(2024, 3, 999.0, 'EUR'), // EUR record at same date — should be ignored
        ],
        2024, 6, 5.0, 'USD',
      );
      expect(result).toEqual({ price: 18.0, currency: 'USD', fromPriceChange: true });
    });

    it('sentinel in matching currency applies when no later change in that currency', () => {
      const result = resolveEffectiveBasePrice(
        [pc(1900, 1, 10.0, 'GBP'), pc(2024, 1, 15.0, 'EUR')],
        2024, 3, 5.0, 'GBP',
      );
      // Only GBP records: sentinel — applicable for all months
      expect(result).toEqual({ price: 10.0, currency: 'GBP', fromPriceChange: true });
    });
  });

  // ── 7. nextRenewalPriceChanged trigger conditions ────────────────────────────

  describe('nextRenewalPriceChanged — trigger conditions', () => {
    /**
     * Service logic (subscriptions.service.ts ~908):
     *   if (resolved.fromPriceChange && resolved.price !== fallbackBase) {
     *     nextRenewalPriceChanged = true;
     *   }
     */

    it('NOTIFY: fromPriceChange=true AND resolved price differs from current basePrice', () => {
      const fallbackBase = 10.0;
      const result = resolveEffectiveBasePrice([pc(2024, 6, 15.0)], 2024, 6, fallbackBase);
      expect(result.fromPriceChange).toBe(true);
      expect(result.price).not.toBe(fallbackBase); // → nextRenewalPriceChanged = true
    });

    it('NO NOTIFY: fromPriceChange=false (change is in the future)', () => {
      const result = resolveEffectiveBasePrice([pc(2025, 1, 15.0)], 2024, 6, 10.0);
      expect(result.fromPriceChange).toBe(false); // → nextRenewalPriceChanged stays false
    });

    it('NO NOTIFY: fromPriceChange=false (no changes at all)', () => {
      const result = resolveEffectiveBasePrice([], 2024, 6, 10.0);
      expect(result.fromPriceChange).toBe(false);
    });

    it('NO NOTIFY: resolved price equals fallbackBase despite fromPriceChange=true (same price)', () => {
      const fallbackBase = 15.0;
      // Price change sets same price as basePrice → resolved.price === fallbackBase → no alert
      const result = resolveEffectiveBasePrice([pc(2024, 1, 15.0)], 2024, 6, fallbackBase);
      expect(result.fromPriceChange).toBe(true);
      expect(result.price).toBe(fallbackBase); // → resolved.price !== fallbackBase is false
    });

    it('NO NOTIFY: targetCurrency mismatch → fromPriceChange=false → no notification', () => {
      // User's currency has no price changes → their custom price preserved, no alert
      const result = resolveEffectiveBasePrice(
        [pc(2024, 1, 20.0, 'EUR')],
        2024, 6, 10.0, 'GBP',
      );
      expect(result.fromPriceChange).toBe(false);
    });

    it('NOTIFY: multi-currency scenario — GBP change triggers notification for GBP user', () => {
      const fallbackBase = 10.0;
      const result = resolveEffectiveBasePrice(
        [pc(2024, 6, 18.0, 'GBP')],
        2024, 6, fallbackBase, 'GBP',
      );
      expect(result.fromPriceChange).toBe(true);
      expect(result.price).not.toBe(fallbackBase);
    });
  });

  // ── 8. Price parsing ─────────────────────────────────────────────────────────

  describe('price value parsing', () => {
    it('parses plain string newBasePrice correctly', () => {
      const result = resolveEffectiveBasePrice(
        [{ effectiveYear: 2024, effectiveMonth: 1, newBasePrice: { toString: () => '12.99' }, currency: 'EUR' }],
        2024, 6, 10.0,
      );
      expect(result.price).toBeCloseTo(12.99);
    });

    it('parses Prisma Decimal-like object (many decimal places) correctly', () => {
      const result = resolveEffectiveBasePrice(
        [{ effectiveYear: 2024, effectiveMonth: 1, newBasePrice: { toString: () => '19.990000' }, currency: 'EUR' }],
        2024, 6, 10.0,
      );
      expect(result.price).toBeCloseTo(19.99);
    });

    it('parses integer price strings', () => {
      const result = resolveEffectiveBasePrice(
        [{ effectiveYear: 2024, effectiveMonth: 1, newBasePrice: { toString: () => '20' }, currency: 'EUR' }],
        2024, 6, 10.0,
      );
      expect(result.price).toBe(20);
    });
  });

  // ── 9. Backfill price selection ───────────────────────────────────────────────

  describe('backfill price resolution across months', () => {
    /**
     * Simulates the backfill loop in subscriptions.service.ts:
     *   for each selected month → resolveEffectiveBasePrice(priceChanges, month.year, month.month, fallbackBase, costCurrency)
     */

    const priceHistory = [
      pc(1900, 1, 10.0, 'EUR'),   // sentinel = base price EUR 10
      pc(2022, 6, 12.0, 'EUR'),   // June 2022: increased to 12
      pc(2023, 1, 14.0, 'EUR'),   // Jan 2023: increased to 14
      pc(2024, 6, 16.0, 'EUR'),   // June 2024: increased to 16
    ];

    const cases: [number, number, number][] = [
      [2021, 12, 10.0],  // Before any explicit change → sentinel
      [2022, 5, 10.0],   // One month before June 2022 change → still sentinel
      [2022, 6, 12.0],   // Exact month of first explicit change
      [2022, 12, 12.0],  // After first change, before second
      [2023, 1, 14.0],   // Exact month of second change
      [2023, 8, 14.0],   // Between second and third changes
      [2024, 6, 16.0],   // Exact month of third change
      [2024, 12, 16.0],  // After last change
    ];

    it.each(cases)(
      'month %i-%i resolves to price %f',
      (year, month, expectedPrice) => {
        const result = resolveEffectiveBasePrice(priceHistory, year, month, 5.0, 'EUR');
        expect(result.price).toBeCloseTo(expectedPrice);
        expect(result.fromPriceChange).toBe(true); // sentinel always counts as fromPriceChange
      },
    );

    it('backfill with non-matching currency preserves user custom price throughout', () => {
      // GBP user with no GBP price changes → their basePrice preserved for ALL months
      const userBasePrice = 25.0;
      for (const [year, month] of [[2020, 1], [2022, 6], [2024, 12]] as [number, number][]) {
        const result = resolveEffectiveBasePrice(priceHistory, year, month, userBasePrice, 'GBP');
        expect(result).toEqual({ price: userBasePrice, currency: null, fromPriceChange: false });
      }
    });

    it('backfill with multi-currency history applies correct currency per user', () => {
      const mixedHistory = [
        pc(1900, 1, 10.0, 'EUR'),
        pc(1900, 1, 8.0, 'GBP'),
        pc(2024, 1, 14.0, 'EUR'),
        pc(2024, 1, 11.0, 'GBP'),
      ];
      const eurResult = resolveEffectiveBasePrice(mixedHistory, 2024, 3, 5.0, 'EUR');
      const gbpResult = resolveEffectiveBasePrice(mixedHistory, 2024, 3, 5.0, 'GBP');
      expect(eurResult.price).toBeCloseTo(14.0);
      expect(gbpResult.price).toBeCloseTo(11.0);
    });
  });

  // ── 10. grandfatheredPrice ───────────────────────────────────────────────────

  describe('grandfatheredPrice — existing subscribers keep old price', () => {
    /**
     * Fairyloot scenario:
     *   - Subscription has sentinel (base) EUR 30 and a grandfathered change effective Jan 2026 → EUR 35.
     *   - Users whose firstBilled < Jan 2026 keep EUR 30 (grandfathered).
     *   - Users whose firstBilled >= Jan 2026 pay EUR 35 (new subscribers).
     */

    const history = [
      pc(1900, 1, 30.0, 'EUR'),              // sentinel: base price 30
      pc(2026, 1, 35.0, 'EUR', true),        // Jan 2026: new price 35, grandfathered
    ];

    it('existing subscriber (firstBilled Nov 2025) keeps old price for Jan 2026 billing', () => {
      const result = resolveEffectiveBasePrice(
        history, 2026, 1, 30.0, 'EUR',
        { year: 2025, month: 11 }, // firstBilled Nov 2025 < Jan 2026 → grandfathered
      );
      // Grandfathered change is skipped → falls back to sentinel (30)
      expect(result.price).toBeCloseTo(30.0);
    });

    it('existing subscriber (firstBilled Dec 2025) keeps old price for Jan 2026 billing', () => {
      const result = resolveEffectiveBasePrice(
        history, 2026, 1, 30.0, 'EUR',
        { year: 2025, month: 12 }, // firstBilled Dec 2025 < Jan 2026 → grandfathered
      );
      expect(result.price).toBeCloseTo(30.0);
    });

    it('new subscriber (firstBilled Jan 2026) pays new price', () => {
      const result = resolveEffectiveBasePrice(
        history, 2026, 1, 30.0, 'EUR',
        { year: 2026, month: 1 }, // firstBilled Jan 2026 = effectiveMonth → NOT grandfathered
      );
      expect(result.price).toBeCloseTo(35.0);
    });

    it('new subscriber (firstBilled Feb 2026) pays new price for Mar 2026 billing', () => {
      const result = resolveEffectiveBasePrice(
        history, 2026, 3, 30.0, 'EUR',
        { year: 2026, month: 2 }, // firstBilled Feb > Jan 2026 → NOT grandfathered
      );
      expect(result.price).toBeCloseTo(35.0);
    });

    it('existing subscriber is grandfathered across multiple future billing months', () => {
      for (const billingMonth of [1, 3, 6, 12] as number[]) {
        const result = resolveEffectiveBasePrice(
          history, 2026, billingMonth, 30.0, 'EUR',
          { year: 2025, month: 6 }, // joined Jun 2025 → always grandfathered
        );
        expect(result.price).toBeCloseTo(30.0);
      }
    });

    it('grandfatheredPrice=false (regular change) always applies regardless of firstBilled', () => {
      const regularHistory = [
        pc(1900, 1, 30.0, 'EUR'),
        pc(2026, 1, 35.0, 'EUR', false), // NOT grandfathered → all subscribers get new price
      ];
      const oldSubscriber = resolveEffectiveBasePrice(
        regularHistory, 2026, 1, 30.0, 'EUR',
        { year: 2025, month: 1 },
      );
      const newSubscriber = resolveEffectiveBasePrice(
        regularHistory, 2026, 1, 30.0, 'EUR',
        { year: 2026, month: 1 },
      );
      expect(oldSubscriber.price).toBeCloseTo(35.0); // both pay new price
      expect(newSubscriber.price).toBeCloseTo(35.0);
    });

    it('without userFirstBilledYearMonth, grandfathered changes apply to everyone (backward-compat)', () => {
      const result = resolveEffectiveBasePrice(
        history, 2026, 3, 30.0, 'EUR',
        // no userFirstBilledYearMonth → grandfatheredPrice flag is ignored
      );
      expect(result.price).toBeCloseTo(35.0);
    });

    it('stacks with targetCurrency: grandfathered EUR change skipped for EUR user with old firstBilled', () => {
      const multiHistory = [
        pc(1900, 1, 30.0, 'EUR'),
        pc(1900, 1, 24.0, 'GBP'),
        pc(2026, 1, 35.0, 'EUR', true),  // grandfathered EUR change
        pc(2026, 1, 28.0, 'GBP', false), // regular GBP change
      ];
      const oldEurUser = resolveEffectiveBasePrice(
        multiHistory, 2026, 3, 30.0, 'EUR',
        { year: 2025, month: 6 },
      );
      const oldGbpUser = resolveEffectiveBasePrice(
        multiHistory, 2026, 3, 24.0, 'GBP',
        { year: 2025, month: 6 },
      );
      expect(oldEurUser.price).toBeCloseTo(30.0); // EUR grandfathered → old price
      expect(oldGbpUser.price).toBeCloseTo(28.0); // GBP not grandfathered → new price
    });

    it('new EUR subscriber gets new price even when grandfathered change exists', () => {
      const multiHistory = [
        pc(1900, 1, 30.0, 'EUR'),
        pc(2026, 1, 35.0, 'EUR', true),
      ];
      const newEurUser = resolveEffectiveBasePrice(
        multiHistory, 2026, 1, 30.0, 'EUR',
        { year: 2026, month: 1 }, // firstBilled = effectiveMonth → new subscriber
      );
      expect(newEurUser.price).toBeCloseTo(35.0);
    });

    it('multiple grandfathered changes: old subscriber always skips all of them', () => {
      const multiChanges = [
        pc(1900, 1, 20.0, 'EUR'),
        pc(2025, 1, 25.0, 'EUR', true), // grandfathered
        pc(2026, 6, 30.0, 'EUR', true), // grandfathered
      ];
      // User firstBilled = Jan 2025 (exactly at the first change boundary)
      // Jan 2025 >= Jan 2025 → NOT grandfathered from first change → pays 25
      // Jan 2025 < Jun 2026 → IS grandfathered from second change → stays at 25
      const atBoundaryUser = resolveEffectiveBasePrice(
        multiChanges, 2026, 6, 20.0, 'EUR',
        { year: 2025, month: 1 },
      );
      expect(atBoundaryUser.price).toBeCloseTo(25.0);

      // User joined Nov 2024 → firstBilled Dec 2024
      // Dec 2024 < Jan 2025 → grandfathered from both changes → stays at sentinel (20)
      const oldUser = resolveEffectiveBasePrice(
        multiChanges, 2026, 6, 20.0, 'EUR',
        { year: 2024, month: 12 },
      );
      expect(oldUser.price).toBeCloseTo(20.0); // both changes skipped → sentinel
    });

    it('paymentOnStartup scenario: subscriber pays in Dec for Jan box — not grandfathered for Jan change', () => {
      // Fairyloot-equivalent: renewalDay=15, user joins Dec 20 (after Dec 15 renewal)
      // In the cron: billing month = Jan 2026 (box month), firstBilledYearMonth = Jan 2026
      const result = resolveEffectiveBasePrice(
        history, 2026, 1, 30.0, 'EUR',
        { year: 2026, month: 1 }, // firstBilled = Jan 2026 = effective → NOT grandfathered
      );
      expect(result.price).toBeCloseTo(35.0); // new price
    });

    it('with renewal offset: billing month (box month) determines grandfathering, not payment month', () => {
      // Example: renewalMonthOffset=1. Payment in Dec 2025 is for Jan 2026 box.
      // In the cron: year=2026, month=1 (box month). firstBilledYearMonth = Jan 2026.
      // Change Jan 2026 grandfathered. firstBilled (Jan 2026) >= effective (Jan 2026) → NOT grandfathered.
      const result = resolveEffectiveBasePrice(
        history, 2026, 1, 30.0, 'EUR',
        { year: 2026, month: 1 }, // BOX month = Jan 2026 = firstBilled
      );
      expect(result.price).toBeCloseTo(35.0);
    });
  });

  // ── 11. parseFirstBilledYearMonth ────────────────────────────────────────────

  describe('parseFirstBilledYearMonth', () => {
    it('parses standard format "Subscription – YYYY/MM"', () => {
      expect(parseFirstBilledYearMonth('Subscription – 2025/12', 2026, 1)).toEqual({ year: 2025, month: 12 });
    });

    it('parses zero-padded month', () => {
      expect(parseFirstBilledYearMonth('Subscription – 2026/01', 2026, 3)).toEqual({ year: 2026, month: 1 });
    });

    it('returns fallback when title is null', () => {
      expect(parseFirstBilledYearMonth(null, 2026, 1)).toEqual({ year: 2026, month: 1 });
    });

    it('returns fallback when title is undefined', () => {
      expect(parseFirstBilledYearMonth(undefined, 2025, 6)).toEqual({ year: 2025, month: 6 });
    });

    it('returns fallback when title does not match expected format', () => {
      expect(parseFirstBilledYearMonth('some other title', 2026, 2)).toEqual({ year: 2026, month: 2 });
    });

    it('handles hyphen separator variant "Subscription - YYYY/MM"', () => {
      expect(parseFirstBilledYearMonth('Subscription - 2025/11', 2026, 1)).toEqual({ year: 2025, month: 11 });
    });
  });
});
