import { describe, it, expect } from 'vitest'
import { parseDecimalInput } from '../lib/parseDecimalInput'

describe('parseDecimalInput', () => {
  it('returns 0 for nullish or empty input', () => {
    expect(parseDecimalInput(null)).toBe(0)
    expect(parseDecimalInput(undefined)).toBe(0)
    expect(parseDecimalInput('')).toBe(0)
  })

  it('passes a numeric value straight through', () => {
    expect(parseDecimalInput(12.5)).toBe(12.5)
    expect(parseDecimalInput(0)).toBe(0)
    expect(parseDecimalInput(-3)).toBe(-3)
  })

  it('accepts both dot and comma decimal separators', () => {
    expect(parseDecimalInput('12.99')).toBe(12.99)
    expect(parseDecimalInput('12,99')).toBe(12.99)
  })

  it('tolerates surrounding whitespace and a trailing unit', () => {
    expect(parseDecimalInput('  12.5 ')).toBe(12.5)
    expect(parseDecimalInput('12.5kg')).toBe(12.5)
  })

  it('returns 0 for non-numeric text', () => {
    expect(parseDecimalInput('abc')).toBe(0)
  })

  it('only swaps the first comma — a grouped "1,234.56" parses as 1.234', () => {
    expect(parseDecimalInput('1,234.56')).toBe(1.234)
  })
})
