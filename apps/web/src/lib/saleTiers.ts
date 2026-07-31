import type { ApiSaleTier } from '@luxgrimoire/shared-types'

/**
 * Returns the tiers that apply for a given region: that region's own tiers if it has any,
 * otherwise the sale's default tier set (regionId === null). Sorted chronologically.
 * Replaces the old hardcoded 3-item FA/EA/GS arrays used across sale components.
 */
export function getTiersForRegion(tiers: ApiSaleTier[] | undefined, regionId: string | null): ApiSaleTier[] {
  const all = tiers ?? []
  const regionTiers = regionId ? all.filter(t => t.regionId === regionId) : []
  const tiersToUse = regionTiers.length > 0 ? regionTiers : all.filter(t => t.regionId === null)
  return [...tiersToUse].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

/** A tier's display label is just its own free-text name — no FA/EA/GS-to-label lookup needed anymore. */
export function formatTierLabel(tier: Pick<ApiSaleTier, 'name'>): string {
  return tier.name
}

/** A user's interest now points directly at one concrete SaleTier row via the saleTier relation —
 *  its date IS the resolved date, no FA/EA/GS fallback chain needed. */
export function resolveInterestDate(interest: { saleTier?: { date: string } | null }): string | null {
  return interest.saleTier?.date ?? null
}

/** Earliest tier date for card/badge displays (homepage carousels, company lists, search results)
 *  that previously read the single fixed generalSaleDate column. Same "default region if flagged,
 *  else the announcement's own regionId:null tier set" precedence as getTiersForRegion/the backend
 *  resolveEditionSaleDate — a sale with tiers only on its regions (no top-level default set, e.g.
 *  every region has its own distinct dates) still resolves correctly instead of coming back empty.
 *  Falls back to the legacy generalSaleDate for historical announcements that haven't been
 *  backfilled with tiers (shouldn't happen post-migration, but keeps old cached/SSR data from
 *  going blank). */
export function getEarliestTierDate(sale: {
  tiers?: ApiSaleTier[]
  generalSaleDate?: string | null
  regions?: { id: string; isDefault: boolean }[]
}): string | null {
  const defaultRegionId = sale.regions?.find(r => r.isDefault)?.id ?? null
  const tiers = getTiersForRegion(sale.tiers, defaultRegionId)
  if (tiers.length === 0) return sale.generalSaleDate ?? null
  return tiers[0]!.date
}
