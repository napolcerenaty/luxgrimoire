import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'

export interface TierDates {
  FA: string | null
  EA: string | null
  GS: string | null
}

/**
 * Resolve tier dates for a sale announcement.
 * Uses the specified region (or the default region if none given), falling back to top-level dates.
 */
export function resolveSaleDates(
  sale: ApiSaleAnnouncement,
  regionId?: string | null,
): TierDates {
  const regions = (sale.regions ?? []) as any[]

  let region: any = null
  if (regionId) {
    region = regions.find((r: any) => r.id === regionId) ?? null
  }
  if (!region && regions.length > 0) {
    region = regions.find((r: any) => r.isDefault) ?? regions[0]
  }

  return {
    FA: region?.firstAccessDate ?? sale.firstAccessDate ?? null,
    EA: region?.earlyAccessDate ?? sale.earlyAccessDate ?? null,
    GS: region?.generalSaleDate ?? sale.generalSaleDate ?? null,
  }
}

/** Format a date string compactly for tier picker: "15 May · 14:00" */
export function formatTierDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null
  try {
    const d = new Date(isoDate)
    const day = d.getDate()
    const month = d.toLocaleString('en', { month: 'short' })
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${day} ${month} · ${h}:${m}`
  } catch {
    return null
  }
}

/**
 * Returns true when the latest sale tier date (GS → EA → FA) is in the past.
 * Used to switch from "Interested?" to "Add to Collection".
 */
export function isSalePast(
  sale: ApiSaleAnnouncement,
  regionId?: string | null,
): boolean {
  const { FA, EA, GS } = resolveSaleDates(sale, regionId)
  const latest = GS ?? EA ?? FA
  if (!latest) return false
  return Date.now() > new Date(latest).getTime()
}
export function isOpenForPurchase(
  sale: ApiSaleAnnouncement,
  regionId?: string | null,
): boolean {
  const { FA, EA, GS } = resolveSaleDates(sale, regionId)
  const earliest = FA ?? EA ?? GS
  if (!earliest) return false
  return Date.now() >= new Date(earliest).getTime()
}
