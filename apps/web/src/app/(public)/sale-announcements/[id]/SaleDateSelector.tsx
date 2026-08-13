'use client'

import { useState, useEffect } from 'react'
import type { ApiSaleAnnouncement, ApiSaleTier } from '@luxgrimoire/shared-types'
import { useAuth } from '@/components/AuthProvider'
import { getTiersForRegion } from '@/lib/saleTiers'

type Region = NonNullable<ApiSaleAnnouncement['regions']>[0]

interface Props {
  /** Used to scope the remembered-region localStorage key to this specific sale — without it,
   *  every sale rendered on the same page/pathname (e.g. modals opened from the homepage, where
   *  the URL never changes) would share one key and a region picked for one sale could silently
   *  leak into another that doesn't have a region with that id, breaking tier resolution. */
  saleId: string
  regions: Region[]
  tiers: ApiSaleTier[]
  fallback: {
    saleTimezone: string | null
    basePrice: number | null
    currency: string | null
  }
  userCountry?: string | null
  /** Notifies the parent of the currently-resolved tier whenever region/tier selection changes,
   *  so "Interested?" can register directly against it instead of asking the user to pick again
   *  in its own dropdown. */
  onSelectionChange?: (tier: ApiSaleTier | null) => void
}

function findRegion(regions: Region[], countryCode: string | null | undefined, currency?: string | null): Region | null {
  if (regions.length === 0) return null
  if (countryCode) {
    const exact = regions.find(r => {
      try { return (JSON.parse(r.countryCodes) as string[]).includes(countryCode.toUpperCase()) }
      catch { return false }
    })
    if (exact) return exact
  }
  if (currency) {
    const byCurrency = regions.find(r => r.currency?.toUpperCase() === currency.toUpperCase())
    if (byCurrency) return byCurrency
  }
  return regions.find(r => r.isDefault) ?? null
}

function formatDateInTz(isoDate: string, tz: string | null | undefined, userTz?: string, hour12?: boolean) {
  const date = new Date(isoDate)
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    hour12: hour12 ?? false,
  }
  try {
    return date.toLocaleString(undefined, { ...opts, timeZone: userTz || tz || undefined })
  } catch {
    return date.toLocaleString(undefined, opts)
  }
}

function useCountdown(target: string | null | undefined) {
  const [diff, setDiff] = useState<number | null>(null)
  useEffect(() => {
    if (!target) return
    const tick = () => setDiff(new Date(target).getTime() - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])
  return diff
}

function Countdown({ ms }: { ms: number | null }) {
  if (ms === null) return null
  if (ms <= 0) return null

  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  const secs = Math.floor((ms % 60000) / 1000)

  return (
    <div className="flex items-center gap-3 text-center mt-3">
      {([['d', days], ['h', hours], ['m', mins], ['s', secs]] as [string, number][]).map(([label, val]) => (
        <div key={label} className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 min-w-[52px]">
          <div className="text-xl font-bold text-brand-400 tabular-nums">{String(val).padStart(2, '0')}</div>
          <div className="text-xs text-stone-500">{label}</div>
        </div>
      ))}
    </div>
  )
}

export default function SaleDateSelector({ saleId, regions, tiers, fallback, userCountry, onSelectionChange }: Props) {
  const { user } = useAuth()
  const hour12 = user?.timeFormat === '12h'
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null)
  const [userTz, setUserTz] = useState<string | null>(null)

  useEffect(() => {
    try { setUserTz(Intl.DateTimeFormat().resolvedOptions().timeZone) } catch {}
    const saved = localStorage.getItem(`sale-region-${saleId}`)
    if (saved) setSelectedRegionId(saved)
  }, [saleId])

  const hasRegions = regions.length > 0

  // Ignore a remembered region id that doesn't actually belong to this sale (stale data from a
  // key collision, or a region that's since been removed) — falling through to auto-detection
  // beats resolving to a region-with-no-tiers-for-this-sale and silently showing nothing.
  const validSelectedRegionId = selectedRegionId && regions.some(r => r.id === selectedRegionId) ? selectedRegionId : null

  const autoRegion = findRegion(regions, user?.shippingCountry ?? userCountry, user?.preferredCurrency)
  const effectiveRegionId = validSelectedRegionId ?? autoRegion?.id ?? regions.find(r => r.isDefault)?.id ?? regions[0]?.id ?? null
  const region = regions.find(r => r.id === effectiveRegionId) ?? null

  // Tiers are pre-sorted chronologically — the earliest one is the sensible default selection
  // (mirrors the old "prefer firstAccess, then earlyAccess, then general" fallback order).
  const availableTiers = getTiersForRegion(tiers, effectiveRegionId)
  const effectiveTierId = selectedTierId ?? availableTiers[0]?.id ?? null
  const selectedTier = availableTiers.find(t => t.id === effectiveTierId) ?? availableTiers[0] ?? null

  const tz = region?.saleTimezone ?? fallback.saleTimezone
  const price = region?.basePrice ?? fallback.basePrice
  const currency = region?.currency ?? fallback.currency

  // Reset tier selection when the region changes — that region's tiers may differ entirely.
  useEffect(() => {
    setSelectedTierId(null)
  }, [effectiveRegionId])

  useEffect(() => {
    onSelectionChange?.(selectedTier)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTier?.id])

  const targetDate = selectedTier?.date ?? null
  const countdown = useCountdown(targetDate)

  if (!hasRegions && availableTiers.length === 0) {
    return null
  }

  return (
    <div className="bg-stone-900/60 border border-stone-700 rounded-xl p-4 space-y-4">
      {hasRegions && (
        <div>
          <label className="block text-xs text-stone-500 mb-1">📍 Your region</label>
          <select
            value={effectiveRegionId ?? ''}
            onChange={e => {
              setSelectedRegionId(e.target.value)
              localStorage.setItem(`sale-region-${saleId}`, e.target.value)
            }}
            className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-brand-400 text-sm"
          >
            {regions.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {availableTiers.length > 1 && (
        <div>
          <label className="block text-xs text-stone-500 mb-1">🎟️ Your access type</label>
          <select
            value={effectiveTierId ?? ''}
            onChange={e => setSelectedTierId(e.target.value)}
            className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-brand-400 text-sm"
          >
            {availableTiers.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {targetDate && selectedTier && (
        <div>
          <p className="text-xs text-stone-500">{selectedTier.name} opens:</p>
          <p className="text-stone-100 font-medium text-sm mt-0.5" suppressHydrationWarning>
            {formatDateInTz(targetDate, tz, userTz ?? undefined, hour12)}
          </p>
          <Countdown ms={countdown} />
        </div>
      )}

      {price != null && (
        <div className="pt-1 border-t border-stone-800">
          <span className="text-xl font-bold text-brand-400">{price} {currency ?? ''}</span>
          {region && <span className="text-xs text-stone-500 ml-2">(regional price)</span>}
        </div>
      )}
    </div>
  )
}
