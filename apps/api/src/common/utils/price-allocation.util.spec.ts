import { BadRequestException } from '@nestjs/common';
import { resolvePerBookPrices } from './price-allocation.util';

describe('resolvePerBookPrices', () => {
  it('splits evenly with no overrides', () => {
    const { prices, distribution } = resolvePerBookPrices(['a', 'b'], new Map(), 30);
    expect(distribution).toBe('EQUAL');
    expect(prices.get('a')).toBe(15);
    expect(prices.get('b')).toBe(15);
  });

  it('returns EQUAL with a single id getting the full total', () => {
    const { prices, distribution } = resolvePerBookPrices(['a'], new Map(), 42.5);
    expect(distribution).toBe('EQUAL');
    expect(prices.get('a')).toBe(42.5);
  });

  it('rounds equal shares to the nearest cent (accepts small aggregate drift, matches sales.service.ts precedent)', () => {
    const { prices } = resolvePerBookPrices(['a', 'b', 'c'], new Map(), 10);
    expect(prices.get('a')).toBeCloseTo(3.33, 2);
    expect(prices.get('b')).toBeCloseTo(3.33, 2);
    expect(prices.get('c')).toBeCloseTo(3.33, 2);
  });

  it('gives overridden ids their exact price and splits the remainder across the rest', () => {
    const overrides = new Map([['a', 20]]);
    const { prices, distribution } = resolvePerBookPrices(['a', 'b', 'c'], overrides, 50);
    expect(distribution).toBe('CUSTOM');
    expect(prices.get('a')).toBe(20);
    expect(prices.get('b')).toBe(15);
    expect(prices.get('c')).toBe(15);
  });

  it('accepts overrides for every id when they sum exactly to the total', () => {
    const overrides = new Map([['a', 10], ['b', 20], ['c', 5]]);
    const { prices, distribution } = resolvePerBookPrices(['a', 'b', 'c'], overrides, 35);
    expect(distribution).toBe('CUSTOM');
    expect(prices.get('a')).toBe(10);
    expect(prices.get('b')).toBe(20);
    expect(prices.get('c')).toBe(5);
  });

  it('throws when overrides for every id do not sum to the total', () => {
    const overrides = new Map([['a', 10], ['b', 20]]);
    expect(() => resolvePerBookPrices(['a', 'b'], overrides, 35)).toThrow(BadRequestException);
  });

  it('throws when overrides alone exceed the total, even with ids left to cover the remainder', () => {
    const overrides = new Map([['a', 60]]);
    expect(() => resolvePerBookPrices(['a', 'b'], overrides, 50)).toThrow(BadRequestException);
  });

  it('still counts an override for an id outside the list against the total, but never assigns it a price', () => {
    // resolvePerBookPrices does not validate id membership — it trusts the caller to have
    // already filtered overrides to known ids (subscriptions.service.ts does this by checking
    // monthBooks before calling in; an unfiltered override for an unselected choice-group
    // alternative would otherwise silently eat into the remaining books' share).
    const overrides = new Map([['ghost', 20]]);
    const { prices, distribution } = resolvePerBookPrices(['a', 'b'], overrides, 20);
    expect(distribution).toBe('CUSTOM');
    expect(prices.get('a')).toBe(0);
    expect(prices.get('b')).toBe(0);
    expect(prices.get('ghost')).toBeUndefined();
  });

  it('returns an empty EQUAL allocation for an empty id list', () => {
    const { prices, distribution } = resolvePerBookPrices([], new Map(), 0);
    expect(distribution).toBe('EQUAL');
    expect(prices.size).toBe(0);
  });

  it('returns totalAmount unchanged (equal to the input) when there is no growth', () => {
    const { totalAmount } = resolvePerBookPrices(['a', 'b'], new Map([['a', 20]]), 50);
    expect(totalAmount).toBe(50);
  });

  // ── allowGrowth (subscriptions: a paid additional choice costs extra, not carved out) ──────

  describe('allowGrowth', () => {
    it('grows the total when a partial override alone exceeds it — the non-overridden id keeps its full undiminished share', () => {
      // Box price 25, user picks an extra book priced at 18 on top — total becomes 43, and the
      // main (non-overridden) book still gets the full 25, not a shrunken remainder.
      const overrides = new Map([['extra', 18]]);
      const { prices, distribution, totalAmount } = resolvePerBookPrices(['main', 'extra'], overrides, 25, { allowGrowth: true });
      expect(distribution).toBe('CUSTOM');
      expect(prices.get('main')).toBe(25);
      expect(prices.get('extra')).toBe(18);
      expect(totalAmount).toBe(43);
    });

    it('trusts the sum with no comparison to the total when every id is overridden', () => {
      // Both books priced explicitly (25 + 18) — total grows to match, no validation against
      // the original box price at all once every id has an explicit price.
      const overrides = new Map([['a', 25], ['b', 18]]);
      const { prices, totalAmount } = resolvePerBookPrices(['a', 'b'], overrides, 25, { allowGrowth: true });
      expect(prices.get('a')).toBe(25);
      expect(prices.get('b')).toBe(18);
      expect(totalAmount).toBe(43);
    });

    it('is additive even when the override would have fit within the total under redistribution — non-overridden ids never lose their full share', () => {
      // Box price 50, one book priced at 20 extra — the other two still get their full 25 each
      // (50/2), not a shrunken (50-20)/2=15 each. Total grows to 20+50=70. Unlike the default
      // (non-growth) mode, growth mode never redistributes — an override is always additive.
      const overrides = new Map([['a', 20]]);
      const { prices, totalAmount } = resolvePerBookPrices(['a', 'b', 'c'], overrides, 50, { allowGrowth: true });
      expect(prices.get('a')).toBe(20);
      expect(prices.get('b')).toBe(25);
      expect(prices.get('c')).toBe(25);
      expect(totalAmount).toBe(70);
    });

    it('trusts the sum unconditionally when every id is overridden, even if it undershoots the original total', () => {
      // Every book explicitly priced below the resolved box price (e.g. the system's price-
      // history guess was simply wrong) — growth mode trusts the admin's numbers either way.
      const overrides = new Map([['a', 10], ['b', 10]]);
      const { prices, totalAmount } = resolvePerBookPrices(['a', 'b'], overrides, 35, { allowGrowth: true });
      expect(prices.get('a')).toBe(10);
      expect(prices.get('b')).toBe(10);
      expect(totalAmount).toBe(20);
    });

    it('without allowGrowth, an override alone exceeding the total still throws (default stays strict — Overstock/purchase-groups behavior)', () => {
      const overrides = new Map([['extra', 30]]);
      expect(() => resolvePerBookPrices(['main', 'extra'], overrides, 25)).toThrow(BadRequestException);
    });

    it('without allowGrowth, the same partial override that would grow in allowGrowth mode instead redistributes the fixed total', () => {
      const overrides = new Map([['extra', 18]]);
      const { prices, totalAmount } = resolvePerBookPrices(['main', 'extra'], overrides, 25);
      expect(prices.get('extra')).toBe(18);
      expect(prices.get('main')).toBe(7); // 25 - 18, NOT the full 25 — this is the redistribution behavior growth mode exists to avoid
      expect(totalAmount).toBe(25);
    });
  });
});
