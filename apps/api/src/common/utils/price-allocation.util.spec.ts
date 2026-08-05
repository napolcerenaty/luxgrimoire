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
});
