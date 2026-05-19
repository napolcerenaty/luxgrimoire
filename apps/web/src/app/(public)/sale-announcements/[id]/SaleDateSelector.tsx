'use client'

import { useState, useEffect } from 'react'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'
import { useAuth } from '@/components/AuthProvider'

type Region = NonNullable<ApiSaleAnnouncement['regions']>[0]

interface Props {
  regions: Region[]
  fallback: {
    generalSaleDate: string | null
    firstAccessDate: string | null
    earlyAccessDate: string | null
    endsAt?: string | null
    saleTimezone: string | null
    basePrice: number | null
    currency: string | null
  }
  userCountry?: string | null
}

const ACCESS_LABELS: Record<string, string> = {
  firstAccess: '🔑 First Access',
  earlyAccess: '⚡ Early Access',
  general: '🛒 General Sale',
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
          <div className="text-xl font-bold text-amber-400 tabular-nums">{String(val).padStart(2, '0')}</div>
          <div className="text-xs text-stone-500">{label}</div>
        </div>
      ))}
    </div>
  )
}

export default function SaleDateSelector({ regions, fallback, userCountry }: Props) {
  const { user } = useAuth()
  const hour12 = user?.timeFormat === '12h'
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [selectedAccess, setSelectedAccess] = useState<'earlyAccess' | 'firstAccess' | 'general'>('general')
  const [userTz, setUserTz] = useState<string | null>(null)

  useEffect(() => {
    try { setUserTz(Intl.DateTimeFormat().resolvedOptions().timeZone) } catch {}
    const saved = localStorage.getItem(`sale-region-${window.location.pathname}`)
    if (saved) setSelectedRegionId(saved)
  }, [])

  const hasRegions = regions.length > 0

  const autoRegion = findRegion(regions, user?.shippingCountry ?? userCountry, user?.preferredCurrency)
  const effectiveRegionId = selectedRegionId ?? autoRegion?.id ?? regions.find(r => r.isDefault)?.id ?? regions[0]?.id ?? null
  const region = regions.find(r => r.id === effectiveRegionId) ?? null

  const dates = {
    earlyAccess: region?.earlyAccessDate ?? fallback.earlyAccessDate,
    firstAccess: region?.firstAccessDate ?? fallback.firstAccessDate,
    general: region?.generalSaleDate ?? fallback.generalSaleDate,
  }
  const tz = region?.saleTimezone ?? fallback.saleTimezone
  const price = region?.basePrice ?? fallback.basePrice
  const currency = region?.currency ?? fallback.currency

  useEffect(() => {
    if (dates.firstAccess) setSelectedAccess('firstAccess')
    else if (dates.earlyAccess) setSelectedAccess('earlyAccess')
    else setSelectedAccess('general')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRegionId, dates.earlyAccess, dates.firstAccess])

  const targetDate = dates[selectedAccess]
  const countdown = useCountdown(targetDate)

  if (!hasRegions && !dates.general && !dates.firstAccess && !dates.earlyAccess) {
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
              localStorage.setItem(`sale-region-${window.location.pathname}`, e.target.value)
            }}
            className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm"
          >
            {regions.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {(dates.earlyAccess || dates.firstAccess) && (
        <div>
          <label className="block text-xs text-stone-500 mb-1">🎟️ Your access type</label>
          <select
            value={selectedAccess}
            onChange={e => setSelectedAccess(e.target.value as typeof selectedAccess)}
            className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm"
          >
            {dates.firstAccess && <option value="firstAccess">{ACCESS_LABELS.firstAccess}</option>}
            {dates.earlyAccess && <option value="earlyAccess">{ACCESS_LABELS.earlyAccess}</option>}
            {dates.general && <option value="general">{ACCESS_LABELS.general}</option>}
          </select>
        </div>
      )}

      {targetDate && (
        <div>
          <p className="text-xs text-stone-500">{ACCESS_LABELS[selectedAccess]} opens:</p>
          <p className="text-stone-100 font-medium text-sm mt-0.5">
            {formatDateInTz(targetDate, tz, userTz ?? undefined, hour12)}
          </p>
          <Countdown ms={countdown} />
        </div>
      )}

      {price != null && (
        <div className="pt-1 border-t border-stone-800">
          <span className="text-xl font-bold text-amber-400">{price} {currency ?? ''}</span>
          {region && <span className="text-xs text-stone-500 ml-2">(regional price)</span>}
        </div>
      )}
    </div>
  )
}
