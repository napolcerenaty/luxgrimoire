import type { CSSProperties } from 'react'

/**
 * Returns a CSS background gradient style using company brand colors.
 * Mirrors the same pattern used in MonthCard / FeaturedMonthCard.
 */
export function brandGradientStyle(colors?: string[] | null): CSSProperties {
  if (colors?.length) {
    return {
      background: `linear-gradient(135deg, ${colors[1] ?? '#1c1917'} 0%, ${colors[0] ?? '#292524'} 60%, ${colors[2] ?? '#1c1917'} 100%)`,
    }
  }
  return { background: 'linear-gradient(135deg, #1c1917 0%, #0c0a09 60%, #1c1917 100%)' }
}

/**
 * Returns true if a hex colour is perceptually light (W3C relative luminance > 0.35).
 * Accepts "#rgb", "#rrggbb" or bare "rrggbb".
 */
export function isLightColor(hex: string): boolean {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean
  if (full.length !== 6) return false
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return L > 0.35
}

/**
 * Given brand accent colors, returns Tailwind text classes appropriate for
 * overlaid text (adapts to light vs dark background).
 */
export function brandTextClasses(colors?: string[] | null): { primary: string; secondary: string } {
  const base = colors?.[0] ?? '#1c1917'
  if (isLightColor(base)) {
    return { primary: 'text-stone-800', secondary: 'text-stone-600' }
  }
  return { primary: 'text-stone-300', secondary: 'text-stone-500' }
}
