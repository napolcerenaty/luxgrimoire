'use client'

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { INPUT_CLASS } from '@/lib/adminFormStyles'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Used only until the real earliest-year query resolves (or if it fails) — not a guess about
// catalog data, just a safe placeholder so the picker renders something before the fetch lands.
const FALLBACK_MIN_YEAR = 2015

export interface MonthPickerProps {
  year: number
  month: number
  onChange: (year: number, month: number) => void
  /** Disallow picking further than N calendar months ahead of today. Omit for no restriction. */
  maxAheadMonths?: number
  /** Earliest selectable year. Omit to derive it from the earliest subscription startDate across
   *  the whole catalog (GET /subscriptions/catalog-earliest-year) instead of a hardcoded guess —
   *  a fixed constant could either lock out a subscription that predates it, or offer years no
   *  subscription has ever had data for. */
  minYear?: number
  className?: string
}

export function MonthPicker({ year, month, onChange, maxAheadMonths, minYear, className }: MonthPickerProps) {
  const { data: earliestYearData } = useQuery({
    queryKey: ['catalog-earliest-year'],
    queryFn: () => authFetch<{ year: number }>('/subscriptions/catalog-earliest-year'),
    enabled: minYear == null,
    staleTime: 60 * 60 * 1000, // 1h client-side; the server itself already caches this for 7 days
  })
  const effectiveMinYear = minYear ?? earliestYearData?.year ?? FALLBACK_MIN_YEAR

  const now = new Date()
  const nowAbs = now.getFullYear() * 12 + now.getMonth()
  const maxAbs = maxAheadMonths != null ? nowAbs + maxAheadMonths : null
  const endYear = maxAbs != null ? Math.floor(maxAbs / 12) : now.getFullYear() + 5
  const years = Array.from({ length: Math.max(endYear - effectiveMinYear + 1, 1) }, (_, i) => effectiveMinYear + i)
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
    .filter((m) => maxAbs == null || year * 12 + (m - 1) <= maxAbs)

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
