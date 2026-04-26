'use client'

import { useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { useSaleInterest, type SaleTier } from '@/hooks/useSaleInterest'

const TIERS: { value: SaleTier; label: string; desc: string }[] = [
  { value: 'FA', label: 'First Access', desc: 'FA' },
  { value: 'EA', label: 'Early Access', desc: 'EA' },
  { value: 'GS', label: 'General Sale', desc: 'GS' },
]

interface Props {
  announcementId: string
  /** compact mode: just an icon button (for cards). full mode: wider pill with text */
  compact?: boolean
}

export function SaleInterestButton({ announcementId, compact = false }: Props) {
  const { isInterested, tier, loading, setInterest, removeInterest } = useSaleInterest(announcementId)
  const [open, setOpen] = useState(false)

  if (loading && !isInterested) {
    return (
      <button disabled className="p-1.5 rounded-full bg-stone-800/80 text-stone-500">
        <Loader2 size={14} className="animate-spin" />
      </button>
    )
  }

  return (
    <div className="relative">
      {/* Bell toggle */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
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

      {/* Tier picker dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute z-50 mt-2 right-0 w-52 rounded-xl border border-stone-600 bg-stone-900 shadow-2xl p-2"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[10px] text-stone-500 uppercase tracking-wider px-2 pb-1.5">
              Which sale tier?
            </p>
            {TIERS.map(t => (
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
        </>
      )}
    </div>
  )
}
