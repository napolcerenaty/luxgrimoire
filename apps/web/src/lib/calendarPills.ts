// Shared styling helpers for calendar pills/dots — used by both the private (per-user) and
// global (public) calendar grids so their visual language stays identical.

import type { CSSProperties } from 'react'

/** Deterministic hue from a string (fallback when no brand color is available). */
export function strHue(str?: string | null) {
  let h = 0
  for (let i = 0; i < (str?.length ?? 0); i++) h = (h * 31 + str!.charCodeAt(i)) & 0xffff
  return h % 360
}

/** Relative luminance (0=black, 1=white) of a #rrggbb hex color. */
export function hexLuminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0.5
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const r = lin(parseInt(hex.slice(1, 3), 16) / 255)
  const g = lin(parseInt(hex.slice(3, 5), 16) / 255)
  const b = lin(parseInt(hex.slice(5, 7), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Returns inline style for a calendar pill.
 *  variant='sale'    → filled background (brand primary color)
 *  variant='renewal' → outline only (transparent bg, border in brand primary color)
 *  lightMode: adapt for light calendar background
 *
 *  Text color is chosen via luminance so both light-brand (lavender) and dark-brand (near-black)
 *  pills stay readable in both themes.
 */
export function pillStyle(
  brandColors: string[] | null | undefined,
  hue: number,
  variant: 'renewal' | 'sale',
  lightMode = false,
) {
  const isFilled = variant === 'sale'
  // Always use primary brand color (brandColors[0])
  const c = brandColors?.[0]

  if (c) {
    // lum > 0.25 → "light" brand (pastels, light teal) → needs dark text to contrast
    const isLightBrand = hexLuminance(c) > 0.25

    if (lightMode) {
      // Dilute the brand color heavily so even very dark brands produce a light enough background.
      // Always use near-black text — any 55%-diluted color will have sufficient contrast.
      const bg = `color-mix(in srgb, ${c} 55%, #dce8f4)`
      const borderColor = `color-mix(in srgb, ${c} 65%, #444444)`
      const outlineText = `color-mix(in srgb, ${c} 80%, #1a1a2e)`
      return isFilled
        ? { background: bg, color: '#1a1a2e', border: `1px solid ${borderColor}` }
        : { background: 'transparent', color: outlineText, border: `1px solid ${borderColor}` }
    }

    // Dark mode: light brands get a more transparent bg so the dark calendar bg bleeds through,
    // darkening the effective pill colour enough for dark text to contrast.
    const bgOpacity = isLightBrand ? '99' : 'cc' // 60% vs 80%
    const textColor = isLightBrand
      ? `color-mix(in srgb, ${c} 15%, #111111)` // dark text on light-brand pill
      : `color-mix(in srgb, ${c} 25%, #f0ece6)` // light text on dark-brand pill
    // Renewal (outline) colors: dark brands need a much lighter mix so they're visible on dark bg
    const outlineColor = isLightBrand
      ? `color-mix(in srgb, ${c} 55%, #c0b8d4)`
      : `color-mix(in srgb, ${c} 30%, #b0cce0)` // heavily diluted toward light for dark brands
    const outlineBorder = isLightBrand
      ? `${c}cc`
      : `color-mix(in srgb, ${c} 40%, #7ab0cc)` // ensure visible border for dark brands
    return isFilled
      ? { background: `${c}${bgOpacity}`, color: textColor, border: `1px solid ${c}` }
      : { background: 'transparent', color: outlineColor, border: `1px solid ${outlineBorder}` }
  }

  // Fallback: hue-based
  if (lightMode) {
    return isFilled
      ? { background: `hsla(${hue},60%,60%,0.55)`, color: `hsl(${hue},80%,15%)`, border: `1px solid hsla(${hue},60%,35%,0.9)` }
      : { background: 'transparent', color: `hsl(${hue},80%,28%)`, border: `1px solid hsla(${hue},60%,35%,0.55)` }
  }
  return isFilled
    ? { background: `hsla(${hue},55%,50%,0.80)`, color: `hsl(${hue},80%,95%)`, border: `1px solid hsla(${hue},55%,65%,0.90)` }
    : { background: 'transparent', color: `hsl(${hue},80%,75%)`, border: `1px solid hsla(${hue},55%,65%,0.55)` }
}

// Same color language as the site-wide edition-glow-gold/red classes (globals.css) — 'mine'
// (subscribed / tracked interest) and 'skipped' (subscribed but not renewing/attending this
// occurrence), adapted to a thin ring since calendar pills are far smaller than a card.
const GLOW_GOLD = 'rgba(212,175,55,0.9)'
const GLOW_RED = 'rgba(220,38,38,0.9)'

export function withHighlightGlow(
  style: CSSProperties,
  highlight: 'mine' | 'skipped' | null | undefined,
): CSSProperties {
  if (!highlight) return style
  const color = highlight === 'mine' ? GLOW_GOLD : GLOW_RED
  const ring = `0 0 0 1.5px ${color}`
  return { ...style, boxShadow: style.boxShadow ? `${style.boxShadow}, ${ring}` : ring }
}

/** Same glow, expressed as an extra outline layer for the mobile dot markers. */
export function highlightDotShadow(highlight: 'mine' | 'skipped' | null | undefined): string {
  if (!highlight) return ''
  const color = highlight === 'mine' ? GLOW_GOLD : GLOW_RED
  return `, 0 0 0 2px ${color}`
}
