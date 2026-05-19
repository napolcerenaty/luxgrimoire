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
 * Returns relative luminance (0–1) for a hex color.
 * Accepts "#rgb", "#rrggbb" or bare "rrggbb".
 */
function getLuminance(hex: string): number {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean
  if (full.length !== 6) return 0
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * Returns true if a hex colour is perceptually light (W3C relative luminance > 0.22).
 */
export function isLightColor(hex: string): boolean {
  return getLuminance(hex) > 0.22
}

/**
 * Given brand accent colors, returns Tailwind text classes appropriate for
 * overlaid text. Uses weighted luminance matching the gradient composition:
 * colors[0] is dominant (60%), colors[1] and colors[2] each contribute 20%.
 */
export function brandTextClasses(colors?: string[] | null): { primary: string; secondary: string } {
  if (!colors?.length) return { primary: 'text-stone-300', secondary: 'text-stone-500' }
  // Gradient: colors[1]@0%, colors[0]@60%, colors[2]@100% — weight accordingly
  const c0 = colors[0] ?? '#1c1917'
  const c1 = colors[1] ?? c0
  const c2 = colors[2] ?? c0
  const weightedL = getLuminance(c0) * 0.6 + getLuminance(c1) * 0.2 + getLuminance(c2) * 0.2
  // Use theme-independent colors: stone palette is remapped in light theme,
  // so white/neutral are used here for text that lives on brand gradient backgrounds.
  if (weightedL > 0.18) {
    return { primary: 'text-neutral-900', secondary: 'text-neutral-700' }
  }
  return { primary: 'text-white/90', secondary: 'text-white/60' }
}
