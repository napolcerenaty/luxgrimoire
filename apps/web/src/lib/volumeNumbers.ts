/** A book's volume number(s) within a series — usually one value, but an omnibus can
 * span several (possibly non-contiguous) volumes, e.g. [0.5, 2]. A consecutive whole-number
 * run collapses to a range ("1, 2, 3" -> "1-3"); anything else joins as a plain list. */
export function formatVolumeNumbers(numbers?: number[] | null): string {
  if (!numbers || numbers.length === 0) return ''
  if (numbers.length === 1) return String(numbers[0])

  const sorted = [...numbers].sort((a, b) => a - b)
  const isConsecutiveRun = sorted.every((n, i) => i === 0 || (Number.isInteger(n) && n === sorted[i - 1] + 1))
  if (isConsecutiveRun) return `${sorted[0]}-${sorted[sorted.length - 1]}`
  return sorted.join(', ')
}

/** Parses a comma-separated admin input into a volumeNumbers array, e.g. for omnibuses.
 * Each comma-separated part is either a single number ("0.5") or a whole-number range
 * ("1-3", expanded to [1, 2, 3]) — so "1-3, 5" produces [1, 2, 3, 5]. */
export function parseVolumeNumbers(input: string): number[] {
  const result: number[] = []
  for (const rawPart of input.split(',')) {
    const part = rawPart.trim()
    if (!part) continue

    const rangeMatch = part.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/)
    if (rangeMatch) {
      const start = Number(rangeMatch[1])
      const end = Number(rangeMatch[2])
      if (Number.isInteger(start) && Number.isInteger(end) && start <= end) {
        for (let n = start; n <= end; n++) result.push(n)
        continue
      }
    }

    const n = Number(part)
    if (!Number.isNaN(n)) result.push(n)
  }
  return Array.from(new Set(result)).sort((a, b) => a - b)
}

/** Mirrors Postgres's element-by-element array comparison, so sorting a list of books
 * by volumeNumbers in the browser matches the ordering the series detail page gets from the API. */
export function compareVolumeNumbers(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const av = a[i]
    const bv = b[i]
    if (av === undefined) return -1
    if (bv === undefined) return 1
    if (av !== bv) return av - bv
  }
  return 0
}
