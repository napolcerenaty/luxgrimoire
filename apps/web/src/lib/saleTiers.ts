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

export interface InterestOpenState {
  /** The tracked tier's own opening date (same value as resolveInterestDate). */
  openDate: string | null
  /** The sale's closing deadline, if it has one (common for OPEN_PREORDER, optional for others). */
  closesDate: string | null
  /** True only once the tier has actually started AND (if there's a deadline) before it closes. */
  isOpen: boolean
  /** True once a closing deadline has passed — distinct from "never opened". */
  hasClosed: boolean
}

/**
 * Whether a user's tracked tier is currently open for purchase, plus both dates needed to label
 * it unambiguously. Every sale type is treated the same way — started (openDate <= now) AND not
 * past its closing deadline if one is set — mirroring AnnouncementCard's isSaleLive, just scoped
 * to one specific tracked tier instead of "is any tier on this announcement live".
 *
 * Do not substitute endsAt for a not-yet-started tier's own date (a past bug did this for
 * OPEN_PREORDER specifically): that conflates "opens at" and "closes at", making a sale look
 * open before it starts and showing the wrong date next to the tier's name.
 */
export function getInterestOpenState(interest: {
  saleTier?: { date: string } | null
  announcement: { endsAt?: string | null }
}): InterestOpenState {
  const openDate = resolveInterestDate(interest)
  const closesDate = interest.announcement.endsAt ?? null
  const now = Date.now()
  const hasStarted = !!openDate && new Date(openDate).getTime() <= now
  const hasClosed = !!closesDate && new Date(closesDate).getTime() <= now
  return { openDate, closesDate, isOpen: hasStarted && !hasClosed, hasClosed }
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
