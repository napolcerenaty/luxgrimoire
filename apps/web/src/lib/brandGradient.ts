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
