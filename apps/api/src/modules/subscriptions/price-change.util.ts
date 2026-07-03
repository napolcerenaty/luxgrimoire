type PriceChange = {
  effectiveYear: number;
  effectiveMonth: number;
  newBasePrice: { toString(): string };
  currency: string;
  grandfatheredPrice?: boolean;
};

/**
 * Parses the first billed year/month for a subscription entry from a purchase group title.
 * Falls back to the provided fallback year/month (current billing month) when no prior groups exist.
 *
 * Title format: "Subscription – YYYY/MM"
 */
export function parseFirstBilledYearMonth(
  title: string | null | undefined,
  fallbackYear: number,
  fallbackMonth: number,
): { year: number; month: number } {
  if (title) {
    const match = title.match(/Subscription\s*[–-]\s*(\d{4})\/(\d{2})/);
    if (match) return { year: parseInt(match[1], 10), month: parseInt(match[2], 10) };
  }
  return { year: fallbackYear, month: fallbackMonth };
}

/**
 * Resolves the effective base price for a given month/year from subscription-level price changes.
 *
 * When `targetCurrency` is provided, only records matching that currency are considered.
 * If no records exist for the target currency, falls back to the fallback price
 * (no price change applied) — this preserves custom-currency user prices.
 *
 * Without `targetCurrency`, all records are considered (backward-compatible).
 *
 * When `userFirstBilledYearMonth` is provided, price changes with `grandfatheredPrice=true`
 * are skipped for users whose first billing month is strictly before the effective month
 * (i.e., existing subscribers keep the old price). New subscribers (firstBilled >= effectiveDate)
 * get the new price.
 */
export function resolveEffectiveBasePrice(
  priceChanges: PriceChange[],
  year: number,
  month: number,
  fallbackPrice: number | null,
  targetCurrency?: string | null,
  userFirstBilledYearMonth?: { year: number; month: number } | null,
): { price: number | null; currency: string | null; fromPriceChange: boolean } {
  const candidates = targetCurrency
    ? priceChanges.filter(pc => pc.currency === targetCurrency)
    : priceChanges;

  if (candidates.length === 0) {
    return { price: fallbackPrice, currency: null, fromPriceChange: false };
  }
  const applicable = candidates
    .filter(pc => pc.effectiveYear < year || (pc.effectiveYear === year && pc.effectiveMonth <= month))
    .filter(pc => {
      if (!pc.grandfatheredPrice || !userFirstBilledYearMonth) return true;
      // Skip this change for grandfathered (existing) subscribers:
      // user is grandfathered when their first billing is strictly BEFORE the effective month.
      const firstBilledAbs = userFirstBilledYearMonth.year * 12 + userFirstBilledYearMonth.month;
      const effectiveAbs = pc.effectiveYear * 12 + pc.effectiveMonth;
      return firstBilledAbs >= effectiveAbs; // new subscriber → apply change
    })
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
