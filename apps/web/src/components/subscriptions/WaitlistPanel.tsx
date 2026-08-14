'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import Image from 'next/image'
import { Clock, X, Loader2, History } from 'lucide-react'
import { getMyWaitlist, leaveWaitlist } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiWaitlistEntry } from '@luxgrimoire/shared-types'

export default function WaitlistPanel() {
  const queryClient = useQueryClient()

  const { data: entries = [], isLoading } = useQuery<ApiWaitlistEntry[]>({
    queryKey: ['waitlist'],
    queryFn: getMyWaitlist,
  })

  const leaveMutation = useMutation({
    mutationFn: (slug: string) => leaveWaitlist(slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
  })

  const active = entries.filter((e) => e.isActive)
  const history = entries.filter((e) => !e.isActive)

  if (isLoading) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
        <h2 className="font-serif font-semibold text-stone-100 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-400" /> Waitlists
        </h2>
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 text-stone-500 animate-spin" />
        </div>
      </div>
    )
  }

  if (entries.length === 0) return null

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
      <h2 className="font-serif font-semibold text-stone-100 flex items-center gap-2">
        <Clock className="w-4 h-4 text-brand-400" />
        Waitlists
      </h2>

      {/* Active waitlist entries */}
      {active.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Currently Waiting</p>
          {active.map((entry) => (
            <WaitlistRow
              key={entry.id}
              entry={entry}
              onLeave={() => leaveMutation.mutate(entry.subscription.slug)}
              leaving={leaveMutation.isPending && leaveMutation.variables === entry.subscription.slug}
            />
          ))}
        </div>
      )}

      {/* Historical entries */}
      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Past Waitlists
          </p>
          {history.map((entry) => (
            <WaitlistHistoryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

function WaitlistRow({
  entry,
  onLeave,
  leaving,
}: {
  entry: ApiWaitlistEntry
  onLeave: () => void
  leaving: boolean
}) {
  const sub = entry.subscription
  const logoUrl = cloudinaryUrl(sub.company?.logoUrl ?? null, 'w_40,h_40,c_fill,q_auto,f_auto')

  return (
    <div className="flex items-center gap-3 bg-stone-800/60 border border-stone-700/50 rounded-xl px-4 py-3 group">
      {logoUrl ? (
        <Image src={logoUrl} alt={sub.company?.name ?? ''} width={32} height={32} className="w-8 h-8 rounded-lg object-cover shrink-0" unoptimized />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-stone-700 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <Link
          href={`/subscriptions/${sub.slug}`}
          className="text-sm font-medium text-stone-100 hover:text-brand-400 transition-colors line-clamp-1"
        >
          {sub.name}
        </Link>
        <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5">
          <Clock className="w-3 h-3 text-brand-500/70 shrink-0" />
          <span>
            Joined {new Date(entry.joinedAt).toLocaleDateString()} &middot;{' '}
            <span className="text-brand-400 font-medium">
              {entry.daysOnList} day{entry.daysOnList !== 1 ? 's' : ''} waiting
            </span>
          </span>
        </div>
      </div>

      <button
        onClick={onLeave}
        disabled={leaving}
        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-stone-500 hover:text-red-400 transition-all disabled:opacity-50 shrink-0"
        title="Leave waitlist"
      >
        {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

function WaitlistHistoryRow({ entry }: { entry: ApiWaitlistEntry }) {
  const sub = entry.subscription
  const logoUrl = cloudinaryUrl(sub.company?.logoUrl ?? null, 'w_40,h_40,c_fill,q_auto,f_auto')

  return (
    <div className="flex items-center gap-3 bg-stone-800/30 border border-stone-800 rounded-xl px-4 py-3 opacity-70">
      {logoUrl ? (
        <Image src={logoUrl} alt={sub.company?.name ?? ''} width={32} height={32} className="w-8 h-8 rounded-lg object-cover shrink-0" unoptimized />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-stone-700 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <Link
          href={`/subscriptions/${sub.slug}`}
          className="text-sm font-medium text-stone-300 hover:text-brand-400 transition-colors line-clamp-1"
        >
          {sub.name}
        </Link>
        <p className="text-xs text-stone-500 mt-0.5">
          Waited{' '}
          <span className="text-stone-400 font-medium">
            {entry.daysOnList} day{entry.daysOnList !== 1 ? 's' : ''}
          </span>{' '}
          &middot; subscribed {new Date(entry.leftAt!).toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}
