import { describe, it, expect } from 'vitest'
import { formatVolumeNumbers, parseVolumeNumbers, compareVolumeNumbers } from '../lib/volumeNumbers'

describe('formatVolumeNumbers', () => {
  it('returns an empty string for empty / nullish input', () => {
    expect(formatVolumeNumbers(null)).toBe('')
    expect(formatVolumeNumbers(undefined)).toBe('')
    expect(formatVolumeNumbers([])).toBe('')
  })

  it('renders a single volume as-is', () => {
    expect(formatVolumeNumbers([3])).toBe('3')
    expect(formatVolumeNumbers([0.5])).toBe('0.5')
  })

  it('collapses a consecutive whole-number run to a range, sorting first', () => {
    expect(formatVolumeNumbers([1, 2, 3])).toBe('1-3')
    expect(formatVolumeNumbers([3, 1, 2])).toBe('1-3')
    expect(formatVolumeNumbers([2, 3])).toBe('2-3')
  })

  it('joins a non-contiguous or fractional set as a plain list', () => {
    expect(formatVolumeNumbers([1, 2, 4])).toBe('1, 2, 4')
    expect(formatVolumeNumbers([0.5, 2])).toBe('0.5, 2')
  })
})

describe('parseVolumeNumbers', () => {
  it('expands whole-number ranges and keeps standalone values, e.g. "1-3, 5"', () => {
    expect(parseVolumeNumbers('1-3, 5')).toEqual([1, 2, 3, 5])
  })

  it('accepts a fractional standalone value', () => {
    expect(parseVolumeNumbers('0.5')).toEqual([0.5])
  })

  it('trims, de-duplicates and sorts', () => {
    expect(parseVolumeNumbers(' 3 , 1 , 2 ')).toEqual([1, 2, 3])
    expect(parseVolumeNumbers('1-3, 2')).toEqual([1, 2, 3])
  })

  it('ignores empty parts and non-numeric junk', () => {
    expect(parseVolumeNumbers('')).toEqual([])
    expect(parseVolumeNumbers('abc')).toEqual([])
    expect(parseVolumeNumbers('2, , 4')).toEqual([2, 4])
  })

  it('rejects a reversed or fractional range (falls through, produces no numbers)', () => {
    expect(parseVolumeNumbers('3-1')).toEqual([])
    expect(parseVolumeNumbers('1.5-3')).toEqual([])
  })
})

describe('compareVolumeNumbers', () => {
  it('orders by the first differing element', () => {
    expect(compareVolumeNumbers([1], [2])).toBeLessThan(0)
    expect(compareVolumeNumbers([2], [1])).toBeGreaterThan(0)
    expect(compareVolumeNumbers([1, 2], [1, 3])).toBeLessThan(0)
  })

  it('treats a shorter prefix as smaller (Postgres array semantics)', () => {
    expect(compareVolumeNumbers([1], [1, 2])).toBe(-1)
    expect(compareVolumeNumbers([1, 2], [1])).toBe(1)
  })

  it('returns 0 for equal arrays', () => {
    expect(compareVolumeNumbers([1, 2], [1, 2])).toBe(0)
  })

  it('sorts a list the same way the API would', () => {
    const sorted = [[2], [1, 5], [1], [10]].sort(compareVolumeNumbers)
    expect(sorted).toEqual([[1], [1, 5], [2], [10]])
  })
})
