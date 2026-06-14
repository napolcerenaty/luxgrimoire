/**
 * Computes the prefilled general sale date for a book edition created from a
 * subscription month.
 *
 * The general sale date equals the renewal date for that box month, which is
 * determined by:
 *  1. Subtracting `renewalMonthOffset` from the box month (box = renewal + offset).
 *  2. Using `renewalDay` as the day — or day 1 when `renewalDayUserSet=true`
 *     (each subscriber uses their own sign-up day, so no fixed day exists).
 *
 * Returns an ISO date string (YYYY-MM-DD) or empty string when prerequisites
 * are missing (no box month supplied, or no day info and not user-set).
 */
export function computeGeneralSaleDatePrefill(
  monthYear: number | undefined | null,
  monthMonth: number | undefined | null,
  renewalDay: number | undefined | null,
  renewalDayUserSet?: boolean | null,
  renewalMonthOffset?: number | null,
): string {
  if (monthYear == null || monthMonth == null) return ''
  if (!renewalDayUserSet && renewalDay == null) return ''

  const offset = renewalMonthOffset ?? 0

  // Compute renewal month: box month minus offset (with year rollover)
  let ry = monthYear
  let rm = monthMonth - offset
  while (rm <= 0) { rm += 12; ry-- }

  // When renewalDayUserSet=true, there is no shared fixed day — use 1st of the month
  const rd = renewalDayUserSet ? 1 : renewalDay!

  return `${ry}-${String(rm).padStart(2, '0')}-${String(rd).padStart(2, '0')}`
}
