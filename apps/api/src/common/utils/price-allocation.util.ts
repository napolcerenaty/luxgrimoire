import { BadRequestException } from '@nestjs/common';

/**
 * Allocates a group's totalAmount across a set of ids (edition ids, book entry ids, ...).
 * With no overrides, splits evenly — mirrors UserSaleGroup's EQUAL distribution
 * (sales.service.ts createSaleGroup). With overrides, the overridden ids get their exact
 * price and the remainder is split evenly across the rest — mirrors UserSaleGroup's CUSTOM
 * distribution (sales.service.ts createSaleGroup/updateSaleGroup).
 */
export function resolvePerBookPrices(
  ids: string[],
  overrides: Map<string, number>,
  totalAmount: number,
): { prices: Map<string, number>; distribution: 'EQUAL' | 'CUSTOM' } {
  if (overrides.size === 0) {
    const equalShare = ids.length > 0 ? Math.round((totalAmount / ids.length) * 100) / 100 : 0;
    return { prices: new Map(ids.map(id => [id, equalShare])), distribution: 'EQUAL' };
  }

  const overriddenSum = Array.from(overrides.values()).reduce((a, b) => a + b, 0);
  const remainingIds = ids.filter(id => !overrides.has(id));
  const remainder = Math.round((totalAmount - overriddenSum) * 100) / 100;

  if (remainder < -0.01) {
    throw new BadRequestException(
      `Per-book price overrides (${overriddenSum.toFixed(2)}) exceed the purchase total (${totalAmount.toFixed(2)})`,
    );
  }
  if (remainingIds.length === 0 && Math.abs(remainder) > 0.01) {
    throw new BadRequestException(
      `Per-book price overrides (${overriddenSum.toFixed(2)}) must sum to the purchase total (${totalAmount.toFixed(2)})`,
    );
  }

  const remainderShare = remainingIds.length > 0 ? Math.round((remainder / remainingIds.length) * 100) / 100 : 0;
  const prices = new Map<string, number>();
  for (const id of ids) {
    prices.set(id, overrides.has(id) ? overrides.get(id)! : remainderShare);
  }
  return { prices, distribution: 'CUSTOM' };
}
