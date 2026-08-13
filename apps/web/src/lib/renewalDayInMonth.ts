// Per-user renewal-day computation, shared by the private calendar (its own source of truth for
// "when do I renew") and the global calendar (to cross-reference "is this global renewal pill
// actually mine, and would it fire for me this month" for the mine/skipped glow).

export interface CalEntry {
  id: string
  active: boolean
  startDate: string | null
  renewalDay: number | null
  nextRenewalAmount: string | null
  nextRenewalCurrency: string | null
  skipRecords: { month: { year: number; month: number } }[]
  subscription: {
    id: string
    slug: string
    name: string
    logoUrl: string | null
    coverImage: string | null
    intervalMonths: number
    startingMonth: number
    renewalDay: number | null
    renewalMonthOffset: number
    startDate: Date | string | null
    company: { name: string; slug: string; brandColors?: string[] | null }
  }
}

// month0 is 0-indexed (JavaScript Date convention)
export function renewalDayInMonth(entry: CalEntry, year: number, month0: number): number | null {
  const sub = entry.subscription
  const renewalDay = entry.renewalDay ?? sub.renewalDay
  if (!renewalDay) return null

  // Don't show renewals before the user's join date
  if (entry.startDate) {
    const startYear = parseInt(entry.startDate.slice(0, 4))
    const startMonth0 = parseInt(entry.startDate.slice(5, 7)) - 1
    if (year < startYear || (year === startYear && month0 < startMonth0)) return null
  }

  // Don't show renewals before the subscription's own start date (e.g. future subscriptions)
  if (sub.startDate) {
    const sd = typeof sub.startDate === 'string' ? sub.startDate : (sub.startDate as Date).toISOString()
    const subStartYear = parseInt(sd.slice(0, 4))
    const subStartMonth0 = parseInt(sd.slice(5, 7)) - 1
    if (year < subStartYear || (year === subStartYear && month0 < subStartMonth0)) return null
  }

  const offset = sub.renewalMonthOffset ?? 0

  const interval = sub.intervalMonths ?? 1
  if (interval > 1) {
    const step = interval
    // startingMonth is always a box (content) month — shift it back by the offset to get
    // the actual renewal-month alignment before computing the step cycle. Mirrors the
    // backend's getRenewalAlignmentBaseMonth (renewal-date.util.ts); missing this shift
    // showed the renewal pill in the box month instead of the real (offset) billing month.
    const alignBase = (((sub.startingMonth ?? 1) - offset - 1 + 1200) % 12) + 1
    const startMonthIdx = (alignBase - 1) % step
    if (((month0 - startMonthIdx) % step + step) % step !== 0) return null
  }

  // A renewal in calendar month (year, month0) pays for box month = renewal month + offset.
  // If that box month is skipped, no renewal fires for this calendar month.
  if (offset !== 0 || (entry.skipRecords?.length ?? 0) > 0) {
    const rawBox = month0 + 1 + offset  // 1-indexed, may exceed 12
    const boxYear = year + Math.floor((rawBox - 1) / 12)
    const boxMonth = ((rawBox - 1) % 12) + 1
    const isSkipped = (entry.skipRecords ?? []).some(
      r => r.month.year === boxYear && r.month.month === boxMonth,
    )
    if (isSkipped) return null
  }

  return renewalDay
}
