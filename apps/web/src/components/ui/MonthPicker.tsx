'use client'

import { INPUT_CLASS } from '@/lib/adminFormStyles'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export interface MonthPickerProps {
  year: number
  month: number
  onChange: (year: number, month: number) => void
  /** Disallow picking further than N calendar months ahead of today. Omit for no restriction. */
  maxAheadMonths?: number
  /** Earliest selectable year. Defaults to 2015. */
  minYear?: number
  className?: string
}

export function MonthPicker({ year, month, onChange, maxAheadMonths, minYear = 2015, className }: MonthPickerProps) {
  const now = new Date()
  const nowAbs = now.getFullYear() * 12 + now.getMonth()
  const maxAbs = maxAheadMonths != null ? nowAbs + maxAheadMonths : null
  const endYear = maxAbs != null ? Math.floor(maxAbs / 12) : now.getFullYear() + 5
  const years = Array.from({ length: Math.max(endYear - minYear + 1, 1) }, (_, i) => minYear + i)
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
