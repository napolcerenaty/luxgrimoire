const MONTH_NAMES_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Returns the start {year, month} of the bundle period that contains the given {year, month}.
 * Bundle cycles begin at `startingMonth` and repeat every `intervalMonths` months.
 */
export function getBundleStart(
  year: number,
  month: number,
  startingMonth: number,
  intervalMonths: number,
): { year: number; month: number } {
  // Convert to 0-indexed absolute month count from year 0
  const absMonth = year * 12 + (month - 1)
  const absStart = 2000 * 12 + (startingMonth - 1) // reference anchor
  const intervals = Math.floor((absMonth - absStart) / intervalMonths)
  const bundleAbsStart = absStart + intervals * intervalMonths
  return {
    year: Math.floor(bundleAbsStart / 12),
    month: (bundleAbsStart % 12) + 1,
  }
}

export interface BundleGroup<T> {
  key: string
  startYear: number
  startMonth: number
  endYear: number
  endMonth: number
  label: string
  items: T[]
}

/**
 * Groups items (SubscriptionMonth-like) into bundle periods.
 * Each item must have `year` and `month` fields.
 */
export function groupIntoBundles<T extends { year: number; month: number }>(
  items: T[],
  intervalMonths: number,
  startingMonth: number,
): BundleGroup<T>[] {
  const groups = new Map<string, BundleGroup<T>>()
  for (const item of items) {
    const start = getBundleStart(item.year, item.month, startingMonth, intervalMonths)
    const key = `${start.year}-${start.month}`
    if (!groups.has(key)) {
      let endYear = start.year
      let endMonth = start.month + intervalMonths - 1
      while (endMonth > 12) { endMonth -= 12; endYear++ }
      const label =
        start.year === endYear
          ? `${MONTH_NAMES_SHORT[start.month]}–${MONTH_NAMES_SHORT[endMonth]} ${start.year}`
          : `${MONTH_NAMES_SHORT[start.month]} ${start.year}–${MONTH_NAMES_SHORT[endMonth]} ${endYear}`
      groups.set(key, { key, startYear: start.year, startMonth: start.month, endYear, endMonth, label, items: [] })
    }
    groups.get(key)!.items.push(item)
  }
  return Array.from(groups.values())
}
