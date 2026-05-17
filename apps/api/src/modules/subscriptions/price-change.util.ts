type PriceChange = {
  effectiveYear: number;
  effectiveMonth: number;
  newBasePrice: { toString(): string };
  currency: string;
};

/**
 * Resolves the effective base price for a given month/year from subscription-level price changes.
 *
 * When `targetCurrency` is provided, only records matching that currency are considered.
 * If no records exist for the target currency, falls back to the fallback price
 * (no price change applied) — this preserves custom-currency user prices.
 *
 * Without `targetCurrency`, all records are considered (backward-compatible).
 */
export function resolveEffectiveBasePrice(
  priceChanges: PriceChange[],
  year: number,
  month: number,
  fallbackPrice: number | null,
  targetCurrency?: string | null,
): { price: number | null; currency: string | null; fromPriceChange: boolean } {
  const candidates = targetCurrency
    ? priceChanges.filter(pc => pc.currency === targetCurrency)
    : priceChanges;

  if (candidates.length === 0) {
    return { price: fallbackPrice, currency: null, fromPriceChange: false };
  }
  const applicable = candidates
    .filter(pc => pc.effectiveYear < year || (pc.effectiveYear === year && pc.effectiveMonth <= month))
    .sort((a, b) => {
      if (a.effectiveYear !== b.effectiveYear) return b.effectiveYear - a.effectiveYear;
      return b.effectiveMonth - a.effectiveMonth;
    });
  if (applicable.length === 0) {
    return { price: fallbackPrice, currency: null, fromPriceChange: false };
  }
  const change = applicable[0];
  return {
    price: parseFloat(change.newBasePrice.toString()),
    currency: change.currency,
    fromPriceChange: true,
  };
}
