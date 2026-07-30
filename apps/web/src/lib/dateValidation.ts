/**
 * Validates that a "YYYY-MM-DD" string (the format native <input type="date"> commits)
 * represents a real calendar date. Two failure modes this catches that are easy to miss:
 *  - Some browsers let the date-input's segmented text entry commit an out-of-range
 *    day for the given month (e.g. typing day=30 while month=02) without validating it,
 *    unlike picking from the calendar UI.
 *  - `new Date(str)` never throws on an invalid day-of-month — it silently rolls the
 *    value over into the next month instead (e.g. "2024-02-30" becomes March 1st), so a
 *    naive `!isNaN(new Date(str).getTime())` check does not catch this at all.
 */
export function isValidCalendarDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}
