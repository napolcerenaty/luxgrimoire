'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, Loader2, MapPin } from 'lucide-react'
import { useSaleInterest, type SaleTier } from '@/hooks/useSaleInterest'
import { useAuth } from '@/components/AuthProvider'
import { formatTierDate } from '@/lib/saleDates'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'

type Region = NonNullable<ApiSaleAnnouncement['regions']>[0]

const ALL_TIERS: { value: SaleTier; label: string }[] = [
  { value: 'FA', label: 'First Access' },
  { value: 'EA', label: 'Early Access' },
  { value: 'GS', label: 'General Sale' },
]

function findDefaultRegion(regions: Region[]): Region | null {
  return regions.find(r => r.isDefault) ?? regions[0] ?? null
}

function resolveDates(
  sale: Pick<ApiSaleAnnouncement, 'firstAccessDate' | 'earlyAccessDate' | 'generalSaleDate'>,
  region: Region | null,
) {
  return {
    FA: region?.firstAccessDate ?? sale.firstAccessDate ?? null,
    EA: region?.earlyAccessDate ?? sale.earlyAccessDate ?? null,
    GS: region?.generalSaleDate ?? sale.generalSaleDate ?? null,
  }
}

interface Props {
  sale: Pick<ApiSaleAnnouncement, 'id' | 'firstAccessDate' | 'earlyAccessDate' | 'generalSaleDate' | 'regions'>
  compact?: boolean
}

export function SaleInterestButton({ sale, compact = false }: Props) {
  const { user } = useAuth()
  const router = useRouter()
  const { isInterested, tier, regionId: savedRegionId, loading, setInterest, removeInterest } = useSaleInterest(sale.id)
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Lock body scroll when bottom sheet is open on mobile
  useEffect(() => {
    if (isMobile && open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [isMobile, open])

  const regions = (sale.regions ?? []) as Region[]
  const hasRegions = regions.length > 1

  // Selected region: saved from DB → localStorage → default
  const lsKey = `sale-interest-region-${sale.id}`
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem(lsKey) ?? null
    return null
  })

  // Sync selectedRegionId from DB when interest loads
  useEffect(() => {
    if (savedRegionId) {
      setSelectedRegionId(savedRegionId)
      if (typeof window !== 'undefined') localStorage.setItem(lsKey, savedRegionId)
    }
  }, [savedRegionId, lsKey])

  const effectiveRegion = regions.find(r => r.id === selectedRegionId) ?? findDefaultRegion(regions)
  const dates = resolveDates(sale, effectiveRegion)

  const availableTiers = ALL_TIERS.filter(t => {
    if (t.value === 'FA') return !!dates.FA
    if (t.value === 'EA') return !!dates.EA
    return true
  })
  const onlyGS = availableTiers.length === 1

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search)
      router.push(`/login?returnTo=${returnTo}`)
      return
    }
    if (onlyGS && !hasRegions) {
      if (isInterested) removeInterest()
      else setInterest('GS', effectiveRegion?.id ?? null)
      return
    }
    if (!isMobile && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const dropdownWidth = 288 // w-72
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = rect.right - dropdownWidth
      left = Math.max(8, Math.min(left, vw - dropdownWidth - 8))
      const right = vw - left - dropdownWidth
      const ESTIMATED_HEIGHT = 320
      const spaceBelow = vh - rect.bottom - 8
      if (spaceBelow >= ESTIMATED_HEIGHT || spaceBelow >= rect.top - 8) {
        setDropdownPos({ top: rect.bottom + 8, right })
      } else {
        setDropdownPos({ bottom: vh - rect.top + 8, right })
      }
    }
    setOpen(v => !v)
  }

  const pickTier = async (t: SaleTier) => {
    await setInterest(t, effectiveRegion?.id ?? null)
    setOpen(false)
  }

  const changeRegion = (regionId: string) => {
    setSelectedRegionId(regionId)
    if (typeof window !== 'undefined') localStorage.setItem(lsKey, regionId)
  }

  if (loading && !isInterested) {
    return (
      <button disabled className="p-1.5 rounded-full bg-stone-800/80 text-stone-500">
        <Loader2 size={14} className="animate-spin" />
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        title={isInterested ? `Interested (${tier}) — click to change` : 'Mark as interested'}
        className={`
          flex items-center gap-1.5 rounded-full transition-all duration-150
          ${compact ? 'p-1.5' : 'px-3 py-1.5 text-xs font-medium'}
          ${isInterested
            ? 'bg-violet-700/80 hover:bg-violet-700 text-white border border-violet-500'
            : 'bg-stone-800/80 hover:bg-stone-700 text-stone-400 hover:text-stone-200 border border-stone-600'}
        `}
      >
        {isInterested ? <Bell size={14} className="fill-current" /> : <Bell size={14} />}
        {!compact && (
          <span>{isInterested ? `Interested · ${tier}` : 'Interested?'}</span>
        )}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />

          {isMobile ? (
            /* Bottom sheet on mobile */
            <div
              className="fixed inset-x-0 bottom-0 z-[101] rounded-t-2xl border-t border-stone-700 bg-stone-900 shadow-2xl p-4 pb-8"
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone-700" />

              {hasRegions && (
                <div className="mb-3 pb-3 border-b border-stone-800">
                  <div className="flex items-center gap-1.5 mb-2">
                    <MapPin size={12} className="text-stone-500" />
                    <span className="text-xs text-stone-500 uppercase tracking-wider">Your region</span>
                  </div>
                  <select
                    value={effectiveRegion?.id ?? ''}
                    onChange={e => changeRegion(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2.5 text-stone-200 text-sm focus:outline-none focus:border-violet-500"
                  >
                    {regions.map(r => (
                      <option key={r.id} value={r.id}>{r.name}{r.isDefault ? ' (default)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">
                When are you planning to buy?
              </p>

              <div className="flex flex-col gap-2">
                {availableTiers.map(t => {
                  const formattedDate = formatTierDate(dates[t.value])
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => pickTier(t.value)}
                      className={`
                        w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-sm transition-colors
                        ${tier === t.value && isInterested
                          ? 'bg-violet-800/60 text-violet-200 border border-violet-600'
                          : 'bg-stone-800 text-stone-300 border border-stone-700 active:bg-stone-700'}
                      `}
                    >
                      <span className="font-medium">{t.label}</span>
                      {formattedDate
                        ? <span className="text-xs text-stone-400 font-mono tabular-nums">{formattedDate}</span>
                        : <span className="text-xs text-stone-600 font-mono">–</span>
                      }
                    </button>
                  )
                })}
              </div>

              {isInterested && (
                <>
                  <div className="my-3 border-t border-stone-700" />
                  <button
                    type="button"
                    onClick={async () => { await removeInterest(); setOpen(false) }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm text-red-400 bg-stone-800 border border-stone-700 active:bg-stone-700 transition-colors"
                  >
                    <BellOff size={14} />
                    Remove interest
                  </button>
                </>
              )}
            </div>
          ) : (
            /* Positioned dropdown on desktop */
            dropdownPos && (
              <div
                className="fixed z-[101] w-72 rounded-xl border border-stone-600 bg-stone-900 shadow-2xl p-2 overflow-y-auto"
                style={{
                  ...(dropdownPos.top != null ? { top: dropdownPos.top } : { bottom: dropdownPos.bottom }),
                  right: dropdownPos.right,
                  maxHeight: 'calc(100vh - 16px)',
                }}
                onClick={e => e.stopPropagation()}
              >
                {hasRegions && (
                  <div className="px-2 pb-2 mb-1 border-b border-stone-800">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MapPin size={11} className="text-stone-500" />
                      <span className="text-[10px] text-stone-500 uppercase tracking-wider">Your region</span>
                    </div>
                    <select
                      value={effectiveRegion?.id ?? ''}
                      onChange={e => changeRegion(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="w-full bg-stone-800 border border-stone-700 rounded-lg px-2 py-1.5 text-stone-200 text-xs focus:outline-none focus:border-violet-500"
                    >
                      {regions.map(r => (
                        <option key={r.id} value={r.id}>{r.name}{r.isDefault ? ' (default)' : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                <p className="text-[10px] text-stone-500 uppercase tracking-wider px-2 pb-1.5 pt-0.5">
                  When are you planning to buy?
                </p>

                {availableTiers.map(t => {
                  const formattedDate = formatTierDate(dates[t.value])
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => pickTier(t.value)}
                      className={`
                        w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors
                        ${tier === t.value && isInterested
                          ? 'bg-violet-800/60 text-violet-200'
                          : 'hover:bg-stone-800 text-stone-300'}
                      `}
                    >
                      <span className="font-medium">{t.label}</span>
                      {formattedDate
                        ? <span className="text-xs text-stone-400 font-mono tabular-nums">{formattedDate}</span>
                        : <span className="text-xs text-stone-600 font-mono">–</span>
                      }
                    </button>
                  )
                })}

                {isInterested && (
                  <>
                    <div className="my-1.5 border-t border-stone-700" />
                    <button
                      type="button"
                      onClick={async () => { await removeInterest(); setOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-stone-800 transition-colors"
                    >
                      <BellOff size={13} />
                      Remove interest
                    </button>
                  </>
                )}
              </div>
            )
          )}
        </>,
        document.body
      )}
    </div>
  )
}
