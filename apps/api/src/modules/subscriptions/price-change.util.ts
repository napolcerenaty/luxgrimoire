type PriceChange = {
  effectiveYear: number;
  effectiveMonth: number;
  newBasePrice: { toString(): string };
  currency: string;
};

/**
 * Resolves the effective base price for a given month/year from subscription-level price changes.
 * Returns the most recent applicable price change, or the fallback price if none applies.
 */
export function resolveEffectiveBasePrice(
  priceChanges: PriceChange[],
  year: number,
  month: number,
  fallbackPrice: number | null,
): { price: number | null; currency: string | null; fromPriceChange: boolean } {
  if (priceChanges.length === 0) {
    return { price: fallbackPrice, currency: null, fromPriceChange: false };
  }
  const applicable = priceChanges
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
