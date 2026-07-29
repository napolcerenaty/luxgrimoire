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

/** Earliest tier date across the sale's own default tier set (regionId: null) — used for
 *  card/badge displays (homepage carousels, company lists) that previously read the single
 *  fixed generalSaleDate column. Falls back to the legacy generalSaleDate for historical
 *  announcements that haven't been backfilled with tiers (shouldn't happen post-migration,
 *  but keeps old cached/SSR data from going blank). */
export function getEarliestTierDate(sale: { tiers?: ApiSaleTier[]; generalSaleDate?: string | null }): string | null {
  const defaultTiers = (sale.tiers ?? []).filter(t => t.regionId === null)
  if (defaultTiers.length === 0) return sale.generalSaleDate ?? null
  return defaultTiers.reduce((earliest, t) => (!earliest || t.date < earliest ? t.date : earliest), null as string | null)
}

/** Preview of what an edition would resolve to (via resolveEditionSaleDate on the backend) if
 *  linked to this announcement — same "default region if flagged, else the announcement's own
 *  tiers" precedence as the backend resolver, computed client-side from already-loaded data so
 *  the edition-creation form can show it before the edition (and its real link) exist yet. */
export function getResolvedTierPreview(
  sale: { tiers?: ApiSaleTier[]; regions?: { id: string; isDefault: boolean }[] },
): { label: string; date: string } | null {
  const defaultRegionId = sale.regions?.find(r => r.isDefault)?.id ?? null
  const tiers = getTiersForRegion(sale.tiers, defaultRegionId)
  return tiers[0] ? { label: tiers[0].name, date: tiers[0].date } : null
}
