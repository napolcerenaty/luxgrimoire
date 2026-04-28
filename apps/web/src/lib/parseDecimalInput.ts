/**
 * Parses a user-entered decimal string into a number.
 * Handles both dot (12.99) and comma (12,99) decimal separators,
 * as used in different locales.
 */
export function parseDecimalInput(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return value
  const normalized = String(value).replace(',', '.')
  const parsed = parseFloat(normalized)
  return isNaN(parsed) ? 0 : parsed
}
