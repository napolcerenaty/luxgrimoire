export type FreshnessBucket = 'never' | 'day' | 'threeDays' | 'week' | 'month' | 'stale'

export interface Freshness {
  bucket: FreshnessBucket
  /** Tailwind classes for the pill (bg + text + border). */
  cls: string
  /** Show a warning icon: never checked, or older than a month. */
  warn: boolean
}

const PILL = {
  blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  orange: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  red: 'bg-red-500/15 text-red-300 border-red-500/30',
} as const

const HOUR = 36e5
const DAY = 24
const THREE_DAYS = 72
const WEEK = 24 * 7
const MONTH = 24 * 30

/**
 * Colour-codes how long ago a company's data was last checked.
 * `iso` at/before the Unix epoch means "never checked".
 */
export function freshness(iso: string, now: number = Date.now()): Freshness {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t) || t <= 0) return { bucket: 'never', cls: PILL.red, warn: true }

  const hours = (now - t) / HOUR
  if (hours < DAY) return { bucket: 'day', cls: PILL.blue, warn: false }
  if (hours < THREE_DAYS) return { bucket: 'threeDays', cls: PILL.yellow, warn: false }
  if (hours < WEEK) return { bucket: 'week', cls: PILL.orange, warn: false }
  if (hours < MONTH) return { bucket: 'month', cls: PILL.red, warn: false }
  return { bucket: 'stale', cls: PILL.red, warn: true }
}

/** True when the timestamp is the epoch sentinel (never checked). */
export function isNeverChecked(iso: string): boolean {
  const t = new Date(iso).getTime()
  return !Number.isFinite(t) || t <= 0
}
