'use client'

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { INPUT_CLASS } from '@/lib/adminFormStyles'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Used only until the real earliest-month query resolves (or if it fails) — not a guess about
// catalog data, just a safe placeholder so the picker renders something before the fetch lands.
const FALLBACK_MIN_YEAR = 2015
const FALLBACK_MIN_MONTH = 1

export interface MonthPickerProps {
  year: number
  month: number
  onChange: (year: number, month: number) => void
  /** Disallow picking further than N calendar months ahead of today. Omit for no restriction. */
  maxAheadMonths?: number
  /** Earliest selectable year/month. Provide both or neither — omit both to derive them from the
   *  earliest subscription startDate across the whole catalog
   *  (GET /subscriptions/catalog-earliest-month) instead of a hardcoded guess. A year-only floor
   *  isn't enough: a subscription starting 2015-03 would still let the picker offer Jan/Feb 2015,
   *  months before it existed. */
  minYear?: number
  minMonth?: number
  className?: string
}

export function MonthPicker({ year, month, onChange, maxAheadMonths, minYear, minMonth, className }: MonthPickerProps) {
  const { data: earliestData } = useQuery({
    queryKey: ['catalog-earliest-month'],
    queryFn: () => authFetch<{ year: number; month: number }>('/subscriptions/catalog-earliest-month'),
    enabled: minYear == null,
    staleTime: 60 * 60 * 1000, // 1h client-side; the server itself already caches this for 7 days
  })
  const effectiveMinYear = minYear ?? earliestData?.year ?? FALLBACK_MIN_YEAR
  const effectiveMinMonth = minYear != null ? (minMonth ?? 1) : (earliestData?.month ?? FALLBACK_MIN_MONTH)
  const minAbs = effectiveMinYear * 12 + (effectiveMinMonth - 1)

  const now = new Date()
  const nowAbs = now.getFullYear() * 12 + now.getMonth()
  const maxAbs = maxAheadMonths != null ? nowAbs + maxAheadMonths : null
  const endYear = maxAbs != null ? Math.floor(maxAbs / 12) : now.getFullYear() + 5
  const years = Array.from({ length: Math.max(endYear - effectiveMinYear + 1, 1) }, (_, i) => effectiveMinYear + i)
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
    .filter((m) => {
      const abs = year * 12 + (m - 1)
      if (maxAbs != null && abs > maxAbs) return false
      if (abs < minAbs) return false
      return true
    })

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <select
        value={month}
        onChange={(e) => onChange(year, Number(e.target.value))}
        className={INPUT_CLASS}
        aria-label="Month"
      >
        {monthOptions.map((m) => (
          <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => onChange(Number(e.target.value), month)}
        className={INPUT_CLASS}
        aria-label="Year"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  )
}
