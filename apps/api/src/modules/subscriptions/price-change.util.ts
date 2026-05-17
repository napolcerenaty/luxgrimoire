type PriceChange = {
  effectiveYear: number;
  effectiveMonth: number;
  newBasePrice: { toString(): string };
  currency: string;
};

/**
 * Resolves the effective base price for a given month/year from subscription-level price changes.
 * Returns the most recent applicable price change, or the fallback price if none applies.
 *
 * NOTE: The sentinel record (effectiveYear=1900) is treated as "no explicit change" — when
 * the only applicable record is the sentinel, we return null so the caller uses fallbackPrice.
 * This prevents an admin editing the current subscription price from retroactively changing
 * historical backfill prices.
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
  // Exclude sentinel (1900-01) from explicit price changes — it's only a last resort
  const explicitChanges = priceChanges.filter(pc => pc.effectiveYear !== 1900);
  const applicable = explicitChanges
    .filter(pc => pc.effectiveYear < year || (pc.effectiveYear === year && pc.effectiveMonth <= month))
    .sort((a, b) => {
      if (a.effectiveYear !== b.effectiveYear) return b.effectiveYear - a.effectiveYear;
      return b.effectiveMonth - a.effectiveMonth;
    });
  if (applicable.length === 0) {
    // No explicit price change applies — use fallback (user's entered basePrice).
    // Fall back to sentinel only if no user-specific price was provided.
    if (fallbackPrice !== null) {
      return { price: fallbackPrice, currency: null, fromPriceChange: false };
    }
    const sentinel = priceChanges.find(pc => pc.effectiveYear === 1900);
    if (sentinel) {
      return {
        price: parseFloat(sentinel.newBasePrice.toString()),
        currency: sentinel.currency,
        fromPriceChange: true,
      };
    }
    return { price: fallbackPrice, currency: null, fromPriceChange: false };
  }
  const change = applicable[0];
  return {
    price: parseFloat(change.newBasePrice.toString()),
    currency: change.currency,
    fromPriceChange: true,
  };
}
