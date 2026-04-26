'use client'

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { useSaleInterest, type SaleTier } from '@/hooks/useSaleInterest'
import { formatTierDate } from '@/lib/saleDates'

const ALL_TIERS: { value: SaleTier; label: string }[] = [
  { value: 'FA', label: 'First Access' },
  { value: 'EA', label: 'Early Access' },
  { value: 'GS', label: 'General Sale' },
]

interface Props {
  announcementId: string
  /** compact mode: just an icon button (for cards). full mode: wider pill with text */
  compact?: boolean
  /** Resolved dates for each tier — user sees them in the picker */
  dates?: { FA?: string | null; EA?: string | null; GS?: string | null }
  /** True when the sale has multiple regions with potentially different dates */
  hasRegions?: boolean
}

export function SaleInterestButton({ announcementId, compact = false, dates, hasRegions }: Props) {
  const { isInterested, tier, loading, setInterest, removeInterest } = useSaleInterest(announcementId)
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const availableTiers = ALL_TIERS.filter(t => {
    if (t.value === 'FA') return !!(dates?.FA)
    if (t.value === 'EA') return !!(dates?.EA)
    return true
  })
  const onlyGS = availableTiers.length === 1

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onlyGS) {
      if (isInterested) removeInterest()
      else setInterest('GS')
      return
    }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    setOpen(v => !v)
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

      {open && dropdownPos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[101] w-64 rounded-xl border border-stone-600 bg-stone-900 shadow-2xl p-2"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[10px] text-stone-500 uppercase tracking-wider px-2 pb-1.5">
              When are you planning to buy?
            </p>
            {availableTiers.map(t => {
              const formattedDate = formatTierDate(dates?.[t.value])
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={async () => { await setInterest(t.value); setOpen(false) }}
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
            {hasRegions && (
              <p className="text-[10px] text-stone-600 px-3 pt-1.5 pb-1 border-t border-stone-800 mt-1">
                Dates shown for default region
              </p>
            )}
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
        </>,
        document.body
      )}
    </div>
  )
}
