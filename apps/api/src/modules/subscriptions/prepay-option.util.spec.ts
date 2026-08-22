/**
 * Unit tests for resolveEffectivePrepayOption / getSelectablePrepayOptions (prepay-option.util.ts)
 *
 * Covers:
 *  1. No matching options → null
 *  2. Single open option → returned
 *  3. Future-dated option (not started yet) → null
 *  4. Expired option with no successor → null (fully discontinued)
 *  5. Expired option superseded by a non-grandfathered new one → new one wins for everyone
 *  6. Superseded by a grandfathered new one — pre-existing entry keeps the old price
 *  7. Superseded by a grandfathered new one — new-enough entry gets the new price
 *  8. Chain of two successive grandfathered increases — oldest-predating entry keeps the oldest price
 *  9. No user context (activeEntryStartDate omitted) → grandfathering never applies
 * 10. Multi-currency / multi-months isolation
 * 11. getSelectablePrepayOptions groups correctly and sorts by months
 */

import { resolveEffectivePrepayOption, getSelectablePrepayOptions, PrepayOptionCandidate } from './prepay-option.util';

const NOW = new Date('2026-08-22T00:00:00Z');

function opt(overrides: Partial<PrepayOptionCandidate> = {}): PrepayOptionCandidate {
  return {
    id: 'opt-1',
    months: 6,
    currency: 'USD',
    price: 50,
    validFrom: null,
    validUntil: null,
    grandfatheredPrice: false,
    ...overrides,
  };
}

describe('resolveEffectivePrepayOption', () => {
  it('returns null when there are no options at all', () => {
    expect(resolveEffectivePrepayOption([], 6, 'USD', NOW)).toBeNull();
  });

  it('returns null when no option matches the requested months/currency', () => {
    const options = [opt({ months: 3 }), opt({ currency: 'EUR' })];
    expect(resolveEffectivePrepayOption(options, 6, 'USD', NOW)).toBeNull();
  });

  it('returns a single always-open option (no validFrom/validUntil)', () => {
    const options = [opt({ id: 'a' })];
    expect(resolveEffectivePrepayOption(options, 6, 'USD', NOW)?.id).toBe('a');
  });

  it('returns null for an option that has not started yet', () => {
    const options = [opt({ id: 'future', validFrom: '2026-09-01T00:00:00Z' })];
    expect(resolveEffectivePrepayOption(options, 6, 'USD', NOW)).toBeNull();
  });

  it('returns null for an expired option with no successor (fully discontinued)', () => {
    const options = [opt({ id: 'a', validFrom: '2026-01-01T00:00:00Z', validUntil: '2026-08-01T00:00:00Z' })];
    expect(resolveEffectivePrepayOption(options, 6, 'USD', NOW)).toBeNull();
  });

  it('a non-grandfathered new option supersedes and wins for everyone, regardless of entry start date', () => {
    const options = [
      opt({ id: 'old', price: 50, validFrom: null, validUntil: '2026-08-01T00:00:00Z' }),
      opt({ id: 'new', price: 60, validFrom: '2026-08-01T00:00:00Z', validUntil: null, grandfatheredPrice: false }),
    ];
    // Pre-existing subscriber (joined long before the change)
    expect(resolveEffectivePrepayOption(options, 6, 'USD', NOW, '2026-01-01')?.id).toBe('new');
    // Brand-new subscriber
    expect(resolveEffectivePrepayOption(options, 6, 'USD', NOW, '2026-08-15')?.id).toBe('new');
  });

  describe('grandfathered supersession', () => {
    const options = [
      opt({ id: 'old', price: 50, validFrom: null, validUntil: '2026-08-01T00:00:00Z' }),
      opt({ id: 'new', price: 60, validFrom: '2026-08-01T00:00:00Z', validUntil: null, grandfatheredPrice: true }),
    ];

    it('pre-existing entry (startDate before the change) keeps the old price', () => {
      const result = resolveEffectivePrepayOption(options, 6, 'USD', NOW, '2026-01-01');
      expect(result?.id).toBe('old');
    });

    it('new-enough entry (startDate on/after the change) gets the new price', () => {
      const result = resolveEffectivePrepayOption(options, 6, 'USD', NOW, '2026-08-01');
      expect(result?.id).toBe('new');
    });

    it('entry starting at the exact validFrom instant is not excluded (>= means new-enough)', () => {
      const result = resolveEffectivePrepayOption(options, 6, 'USD', NOW, '2026-08-01T00:00:00Z');
      expect(result?.id).toBe('new');
    });
  });

  it('walks a chain of two successive grandfathered increases back to the oldest qualifying price', () => {
    const options = [
      opt({ id: 'v1', price: 50, validFrom: null, validUntil: '2026-06-01T00:00:00Z' }),
      opt({ id: 'v2', price: 60, validFrom: '2026-06-01T00:00:00Z', validUntil: '2026-08-01T00:00:00Z', grandfatheredPrice: true }),
      opt({ id: 'v3', price: 70, validFrom: '2026-08-01T00:00:00Z', validUntil: null, grandfatheredPrice: true }),
    ];
    // Entry predates both increases -> keeps the original (v1) price.
    expect(resolveEffectivePrepayOption(options, 6, 'USD', NOW, '2026-01-01')?.id).toBe('v1');
    // Entry joined between v1 and v2's cutover -> qualifies for v2 (excluded only from v3).
    expect(resolveEffectivePrepayOption(options, 6, 'USD', NOW, '2026-07-01')?.id).toBe('v2');
    // Entry joined after v3 started -> gets the newest price.
    expect(resolveEffectivePrepayOption(options, 6, 'USD', NOW, '2026-08-10')?.id).toBe('v3');
  });

  it('never returns a grandfathered-superseded option when no user context is given', () => {
    const options = [
      opt({ id: 'old', price: 50, validFrom: null, validUntil: '2026-08-01T00:00:00Z' }),
      opt({ id: 'new', price: 60, validFrom: '2026-08-01T00:00:00Z', validUntil: null, grandfatheredPrice: true }),
    ];
    expect(resolveEffectivePrepayOption(options, 6, 'USD', NOW)?.id).toBe('new');
  });

  it('isolates resolution by currency — a change in USD does not affect EUR', () => {
    const options = [
      opt({ id: 'usd-old', currency: 'USD', validFrom: null, validUntil: '2026-08-01T00:00:00Z' }),
      opt({ id: 'usd-new', currency: 'USD', validFrom: '2026-08-01T00:00:00Z', validUntil: null, grandfatheredPrice: true }),
      opt({ id: 'eur-only', currency: 'EUR', validFrom: null, validUntil: null }),
    ];
    expect(resolveEffectivePrepayOption(options, 6, 'EUR', NOW, '2026-01-01')?.id).toBe('eur-only');
  });

  it('isolates resolution by months — a change for 6-month options does not affect 3-month ones', () => {
    const options = [
      opt({ id: 'm6-old', months: 6, validFrom: null, validUntil: '2026-08-01T00:00:00Z' }),
      opt({ id: 'm6-new', months: 6, validFrom: '2026-08-01T00:00:00Z', validUntil: null, grandfatheredPrice: true }),
      opt({ id: 'm3-only', months: 3, validFrom: null, validUntil: null }),
    ];
    expect(resolveEffectivePrepayOption(options, 3, 'USD', NOW, '2026-01-01')?.id).toBe('m3-only');
  });
});

describe('getSelectablePrepayOptions', () => {
  it('resolves each (months, currency) group independently and sorts the result by months', () => {
    const options = [
      opt({ id: 'm12', months: 12, price: 90 }),
      opt({ id: 'm3', months: 3, price: 30 }),
      opt({ id: 'm6-old', months: 6, price: 50, validFrom: null, validUntil: '2026-08-01T00:00:00Z' }),
      opt({ id: 'm6-new', months: 6, price: 60, validFrom: '2026-08-01T00:00:00Z', validUntil: null, grandfatheredPrice: true }),
    ];

    const result = getSelectablePrepayOptions(options, NOW, '2026-01-01');
    expect(result.map(o => o.id)).toEqual(['m3', 'm6-old', 'm12']);
  });

  it('drops a group entirely when it resolves to null (fully discontinued)', () => {
    const options = [
      opt({ id: 'm3', months: 3, validFrom: null, validUntil: '2026-08-01T00:00:00Z' }), // discontinued, no successor
      opt({ id: 'm6', months: 6, validFrom: null, validUntil: null }),
    ];
    const result = getSelectablePrepayOptions(options, NOW);
    expect(result.map(o => o.id)).toEqual(['m6']);
  });
});
