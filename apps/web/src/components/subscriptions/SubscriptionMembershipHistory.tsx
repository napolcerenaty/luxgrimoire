'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, History } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'

interface MembershipEntry {
  id: string
  active: boolean
  startDate: string | null
  cancellationDate: string | null
  cancellationReason: string | null
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SubscriptionMembershipHistory({ subscriptionSlug }: { subscriptionSlug: string }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<MembershipEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  const handleToggle = async () => {
    if (!open && !loaded) {
      setLoading(true)
      setError(null)
      try {
        const data = await authFetch<MembershipEntry[]>(`/subscriptions/${subscriptionSlug}/my-history`)
        setEntries(data)
        setLoaded(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load history')
      } finally {
        setLoading(false)
      }
    }
    setOpen(prev => !prev)
  }

  if (loaded && entries.length === 0) return (
    <div className="mt-6 border border-stone-800 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-stone-500">
      <History className="w-4 h-4 shrink-0" />
      No recorded membership history.
    </div>
  )

  return (
    <div className="mt-6 border border-stone-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-stone-400 shrink-0" />
          <span className="text-sm font-medium text-stone-300">My Membership History</span>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 text-stone-500 animate-spin shrink-0" />
        ) : open ? (
          <ChevronUp className="w-4 h-4 text-stone-500 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-stone-500 shrink-0" />
        )}
      </button>

      {error && (
        <p className="px-4 py-2 text-xs text-red-400 border-t border-stone-800">{error}</p>
      )}

      {open && loaded && entries.length > 0 && (
        <div className="border-t border-stone-800 divide-y divide-stone-800/50">
          {entries.map((entry, i) => (
            <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex flex-col items-center pt-1 shrink-0">
                <div className={`w-2 h-2 rounded-full ${entry.active ? 'bg-emerald-400' : 'bg-stone-600'}`} />
                {i < entries.length - 1 && <div className="w-px flex-1 bg-stone-700/50 mt-1 min-h-[16px]" />}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                {entry.active ? (
                  <p className="text-sm text-emerald-400 font-medium">
                    Active
                    {entry.startDate && (
                      <span className="text-stone-400 font-normal"> from {formatDate(entry.startDate)}</span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-stone-300">
                    {entry.startDate ? formatDate(entry.startDate) : '?'}
                    <span className="text-stone-500 mx-1.5">→</span>
                    {entry.cancellationDate ? formatDate(entry.cancellationDate) : '?'}
                  </p>
                )}
                {entry.cancellationReason && (
                  <p className="text-xs text-stone-500 italic mt-0.5">{entry.cancellationReason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
