export interface PrepayOptionCandidate {
  id: string;
  months: number;
  currency: string;
  price: { toString(): string } | number | string;
  validFrom: Date | string | null;
  validUntil: Date | string | null;
  grandfatheredPrice?: boolean;
}

function toTime(d: Date | string | null | undefined): number {
  if (!d) return 0; // no validFrom == "always been available" (epoch baseline)
  return new Date(d).getTime();
}

/**
 * Resolves the effective prepay option for a given (months, currency) pair, mirroring
 * resolveEffectiveBasePrice's grandfathering shape but adapted for prepay options' validFrom/
 * validUntil date range (see prepay-option.util's SubscriptionPrepayOption schema comment for
 * why prepay options need a range while price changes only need a single effective month).
 *
 * `activeEntryStartDate` should be the caller's currently ACTIVE UserSubscriptionEntry's
 * startDate — never a historical/cancelled entry's — since cancelling and rejoining is how a
 * subscriber loses grandfathering (their new entry starts "now", after any past price change).
 * Omit it entirely for a no-user context (new-joiner browsing, anonymous access): grandfathered
 * rows are then never returned, matching a normal "what's on offer right now" listing.
 *
 * Walks candidates newest-to-oldest by validFrom. A candidate is skipped (excluded) when it's
 * grandfathered and the caller's entry predates its validFrom — that's what "you keep your old
 * price" means. The first non-excluded candidate wins, provided it's still open OR we only
 * reached it by skipping a newer grandfathered one (a fallback for an existing subscriber); an
 * expired candidate reached without any such fallback means the option was fully discontinued
 * with nothing to replace it, so nothing is returned.
 */
export function resolveEffectivePrepayOption(
  options: PrepayOptionCandidate[],
  months: number,
  currency: string,
  now: Date,
  activeEntryStartDate?: Date | string | null,
): PrepayOptionCandidate | null {
  const startedCandidates = options.filter(
    o => o.months === months && o.currency === currency && toTime(o.validFrom) <= now.getTime(),
  );
  if (startedCandidates.length === 0) return null;

  const sorted = [...startedCandidates].sort((a, b) => toTime(b.validFrom) - toTime(a.validFrom));
  const entryStart = activeEntryStartDate ? new Date(activeEntryStartDate).getTime() : null;

  let fellThroughViaExclusion = false;
  for (const option of sorted) {
    const excluded =
      !!option.grandfatheredPrice && entryStart !== null && entryStart < toTime(option.validFrom);
    if (excluded) {
      fellThroughViaExclusion = true;
      continue;
    }
    const validUntilTime = option.validUntil ? new Date(option.validUntil).getTime() : null;
    const isOpen = validUntilTime === null || validUntilTime > now.getTime();
    if (isOpen || fellThroughViaExclusion) return option;
    return null; // closed, and nothing supersedes it for this caller -> fully discontinued
  }
  return null;
}

/**
 * Groups `options` by (months, currency) and resolves each group with
 * resolveEffectivePrepayOption — the shape every "what can this user pick right now" read site
 * actually wants (a list, not a single resolved price).
 */
export function getSelectablePrepayOptions(
  options: PrepayOptionCandidate[],
  now: Date,
  activeEntryStartDate?: Date | string | null,
): PrepayOptionCandidate[] {
  const groups = new Map<string, { months: number; currency: string; items: PrepayOptionCandidate[] }>();
  for (const option of options) {
    const key = `${option.months}|${option.currency}`;
    const group = groups.get(key);
    if (group) group.items.push(option);
    else groups.set(key, { months: option.months, currency: option.currency, items: [option] });
  }

  const resolved: PrepayOptionCandidate[] = [];
  for (const { months, currency, items } of groups.values()) {
    const winner = resolveEffectivePrepayOption(items, months, currency, now, activeEntryStartDate);
    if (winner) resolved.push(winner);
  }
  return resolved.sort((a, b) => a.months - b.months);
}
