/**
 * Resolves historical subscription settings (renewalDay, paymentOnStartup, etc.)
 * for a given billing month.
 *
 * Mirrors the pattern of resolveEffectiveBasePrice — one pre-loaded history array,
 * pure in-memory resolution per month, no DB calls in the loop.
 */

export interface SubscriptionSettings {
  renewalDay: number | null;
  renewalDayUserSet: boolean;
  paymentOnStartup: boolean;
  signupIncludesCurrentMonth: boolean;
  renewalMonthOffset: number;
}

type SettingsHistoryRecord = SubscriptionSettings & { effectiveFrom: Date };

/**
 * Returns the subscription settings that were in effect for the given year/month.
 * "In effect" = the most recent history record whose effectiveFrom is ≤ the last
 * day of that month.
 *
 * Falls back to `fallback` (current subscription settings) if no record precedes
 * the target month — this handles the pre-history period before the first
 * explicit settings record.
 */
export function resolveEffectiveSettings(
  history: SettingsHistoryRecord[],
  year: number,
  month: number,
  fallback: SubscriptionSettings,
): SubscriptionSettings {
  // Use last day of the target month as the cutoff so that a record created
  // on any day within the month counts as applicable.
  const cutoff = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last day of this month

  const applicable = history
    .filter(h => h.effectiveFrom <= cutoff)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());

  if (applicable.length === 0) return fallback;

  const { effectiveFrom: _ignored, ...settings } = applicable[0];
  return settings;
}
