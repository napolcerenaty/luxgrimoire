/** A book's volume number(s) within a series — usually one value, but an omnibus can
 * span several (possibly non-contiguous) volumes, e.g. [0.5, 2]. Formats as "0.5, 2". */
export function formatVolumeNumbers(numbers?: number[] | null): string {
  if (!numbers || numbers.length === 0) return ''
  return numbers.join(', ')
}

/** Parses a comma-separated admin input ("0.5, 2") into a volumeNumbers array, e.g. for omnibuses. */
export function parseVolumeNumbers(input: string): number[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b)
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
