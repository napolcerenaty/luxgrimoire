'use client'

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { useSaleInterest, type SaleTier } from '@/hooks/useSaleInterest'

const ALL_TIERS: { value: SaleTier; label: string; desc: string }[] = [
  { value: 'FA', label: 'First Access', desc: 'FA' },
  { value: 'EA', label: 'Early Access', desc: 'EA' },
  { value: 'GS', label: 'General Sale', desc: 'GS' },
]

interface Props {
  announcementId: string
  /** compact mode: just an icon button (for cards). full mode: wider pill with text */
  compact?: boolean
  firstAccessDate?: string | null
  earlyAccessDate?: string | null
}

export function SaleInterestButton({ announcementId, compact = false, firstAccessDate, earlyAccessDate }: Props) {
  const { isInterested, tier, loading, setInterest, removeInterest } = useSaleInterest(announcementId)
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Only show tiers that have dates (GS always shown)
  const availableTiers = ALL_TIERS.filter(t => {
    if (t.value === 'FA') return !!firstAccessDate
    if (t.value === 'EA') return !!earlyAccessDate
    return true
  })
  const onlyGS = availableTiers.length === 1

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onlyGS) {
      // Toggle directly — no picker needed
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

      {/* Tier picker — rendered in portal to escape overflow:hidden */}
      {open && dropdownPos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[101] w-52 rounded-xl border border-stone-600 bg-stone-900 shadow-2xl p-2"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[10px] text-stone-500 uppercase tracking-wider px-2 pb-1.5">
              Which sale tier?
            </p>
            {availableTiers.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={async () => { await setInterest(t.value); setOpen(false) }}
                className={`
                  w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors
                  ${tier === t.value && isInterested
                    ? 'bg-violet-800/60 text-violet-200'
                    : 'hover:bg-stone-800 text-stone-300'}
                `}
              >
                <span>{t.label}</span>
                <span className="text-xs text-stone-500 font-mono">{t.desc}</span>
              </button>
            ))}
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
