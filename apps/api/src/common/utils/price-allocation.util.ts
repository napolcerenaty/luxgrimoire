import { BadRequestException } from '@nestjs/common';

export interface ResolvedPerBookPrices {
  prices: Map<string, number>;
  distribution: 'EQUAL' | 'CUSTOM';
  /** Usually equal to the totalAmount passed in — differs only when allowGrowth kicks in. */
  totalAmount: number;
}

/**
 * Allocates a group's totalAmount across a set of ids (edition ids, book entry ids, ...).
 * With no overrides, splits evenly — mirrors UserSaleGroup's EQUAL distribution
 * (sales.service.ts createSaleGroup). With overrides (default mode, Overstock/purchase-groups):
 * the overridden ids get their exact price and the *remainder of the same fixed total* is
 * split evenly across the rest — mirrors UserSaleGroup's CUSTOM distribution
 * (sales.service.ts createSaleGroup/updateSaleGroup). An override sum that doesn't fit the
 * total is rejected: the total is an admin-entered real amount, so a mismatch is a data
 * mistake worth flagging.
 *
 * allowGrowth (subscriptions only — see subscriptions.service.ts backfill): a subscription's
 * totalAmount is the box's default price, resolved from price history — it is not an
 * admin-entered fixed pot being re-sliced. A priced book here always means "a paid additional
 * choice, extra on top of the box price," never "redistribute the box price differently."
 * Non-overridden ids always keep their full, undiminished equal share of the original total;
 * overridden ids are pure additions, and the resolved totalAmount grows to cover them —
 * unconditionally, not just when the numbers happen not to fit.
 */
export function resolvePerBookPrices(
  ids: string[],
  overrides: Map<string, number>,
  totalAmount: number,
  opts: { allowGrowth?: boolean } = {},
): ResolvedPerBookPrices {
  if (overrides.size === 0) {
    const equalShare = ids.length > 0 ? Math.round((totalAmount / ids.length) * 100) / 100 : 0;
    return { prices: new Map(ids.map(id => [id, equalShare])), distribution: 'EQUAL', totalAmount };
  }

  const overriddenSum = Array.from(overrides.values()).reduce((a, b) => a + b, 0);
  const remainingIds = ids.filter(id => !overrides.has(id));

  if (opts.allowGrowth) {
    // Always additive: overridden ids are extras on top, non-overridden ids keep their full
    // share of the original total — never a reduced remainder.
    const remainderShare = remainingIds.length > 0 ? Math.round((totalAmount / remainingIds.length) * 100) / 100 : 0;
    const prices = new Map<string, number>();
    for (const id of ids) prices.set(id, overrides.has(id) ? overrides.get(id)! : remainderShare);
    const grownTotal = remainingIds.length > 0
      ? Math.round((overriddenSum + remainderShare * remainingIds.length) * 100) / 100
      : Math.round(overriddenSum * 100) / 100;
    return { prices, distribution: 'CUSTOM', totalAmount: grownTotal };
  }

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
  for (const id of ids) prices.set(id, overrides.has(id) ? overrides.get(id)! : remainderShare);
  return { prices, distribution: 'CUSTOM', totalAmount };
}
