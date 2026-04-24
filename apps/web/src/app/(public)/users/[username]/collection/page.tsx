'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import {
  OWNERSHIP_GROUPS,
  OWNERSHIP_STATUS_LABELS,
  OWNERSHIP_STATUSES,
  READING_STATUSES,
  type OwnershipStatus,
  type ReadingStatus,
} from '@luxgrimoire/shared-types'

interface BookEntry {
  id: string
  ownershipStatus: string
  readingStatus: string
  condition: string | null
  addedAt: string
  edition: {
    id: string
    slug: string
    coverImage: string | null
    bookBoxCompany: { id: string; slug: string; name: string; logoUrl: string | null } | null
    book: {
      id: string
      slug: string
      title: string
      authors: { author: { id: string; name: string } }[]
    }
  } | null
}

const OWNERSHIP_STATUS_COLORS: Record<string, string> = {
  PREORDER: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
  SHIPPING: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/50',
  OWNED: 'bg-green-900/40 text-green-300 border-green-700/50',
  BORROWED: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
  LENDED: 'bg-orange-900/40 text-orange-300 border-orange-700/50',
  SOLD: 'bg-stone-700/40 text-stone-400 border-stone-600',
  GIFTED_AWAY: 'bg-pink-900/40 text-pink-300 border-pink-700/50',
}

export default function CollectionPage() {
  const params = useParams<{ username: string }>()
  const { user: currentUser } = useAuth()
  // Check if logged in via localStorage token presence
  const [hasToken, setHasToken] = useState(false)
  useEffect(() => {
    setHasToken(!!localStorage.getItem('luxgrimoire_token'))
  }, [])
  const [entries, setEntries] = useState<BookEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState<string>('all')

  const isOwner = currentUser?.username === params.username
  const pageSize = 50

  const fetchCollection = useCallback(async () => {
    setLoading(true)
    try {
      // If owner, use authenticated endpoint for full data
      // If visitor, use public profile endpoint (future)
      const data = await authFetch<{ data: BookEntry[]; total: number }>(
        `/collection?page=${page}&pageSize=${pageSize}`,
      )
      setEntries(data.data)
      setTotal(data.total)
    } catch {
      // not logged in or not the owner — empty for now
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    if (hasToken) fetchCollection()
    else setLoading(false)
  }, [hasToken, fetchCollection])

  async function updateStatus(entryId: string, field: 'ownershipStatus' | 'readingStatus', value: string) {
    setUpdating(entryId + field)
    try {
      await authFetch(`/collection/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value }),
      })
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, [field]: value } : e)),
      )
    } finally {
      setUpdating(null)
    }
  }

  // Group entries
  const grouped = OWNERSHIP_GROUPS.map((g) => ({
    ...g,
    entries: entries.filter((e) => g.statuses.includes(e.ownershipStatus as OwnershipStatus)),
  })).filter((g) => g.entries.length > 0)

  const visibleGroups =
    activeGroup === 'all'
      ? grouped
      : grouped.filter((g) => g.label === activeGroup)

  const allGroupLabels = grouped.map((g) => g.label)

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <div className="flex items-center gap-3 mb-8 flex-wrap">
        <Link
          href={`/users/${params.username}`}
          className="text-stone-400 hover:text-amber-400 text-sm transition-colors"
        >
          ← {params.username}
        </Link>
        <h1 className="text-3xl font-serif font-bold text-stone-100">
          Collection
          {total > 0 && <span className="text-stone-500 font-normal text-xl ml-2">({total})</span>}
        </h1>
      </div>

      {/* Group filter tabs */}
      {allGroupLabels.length > 1 && (
        <div className="flex gap-2 mb-8 flex-wrap">
          <button
            onClick={() => setActiveGroup('all')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeGroup === 'all'
                ? 'bg-amber-600 text-stone-950'
                : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
            }`}
          >
            All ({entries.length})
          </button>
          {allGroupLabels.map((label) => {
            const g = grouped.find((x) => x.label === label)!
            return (
              <button
                key={label}
                onClick={() => setActiveGroup(label)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeGroup === label
                    ? 'bg-amber-600 text-stone-950'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                }`}
              >
                {label} ({g.entries.length})
              </button>
            )
          })}
        </div>
      )}

      {loading && (
        <p className="text-stone-400 text-sm animate-pulse">Loading collection…</p>
      )}

      {!loading && entries.length === 0 && (
        <p className="text-stone-500 text-sm italic">
          {isOwner ? 'Your collection is empty.' : 'This user has no public collection.'}
        </p>
      )}

      {!loading && visibleGroups.map((group) => (
        <section key={group.label} className="mb-10">
          <h2 className="text-lg font-serif font-semibold text-stone-300 mb-4 flex items-center gap-2">
            {group.label}
            <span className="text-stone-600 text-sm font-normal">({group.entries.length})</span>
          </h2>
          <div className="flex flex-col gap-3">
            {group.entries.map((entry) => (
              <BookEntryRow
                key={entry.id}
                entry={entry}
                isOwner={isOwner}
                updating={updating}
                onUpdateStatus={updateStatus}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex gap-3 justify-center mt-8">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 rounded bg-stone-800 text-stone-300 disabled:opacity-40 hover:bg-stone-700 transition-colors text-sm"
          >
            ← Previous
          </button>
          <span className="text-stone-400 text-sm self-center">
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          <button
            disabled={page >= Math.ceil(total / pageSize)}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded bg-stone-800 text-stone-300 disabled:opacity-40 hover:bg-stone-700 transition-colors text-sm"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Book entry row ────────────────────────────────────────────────────────────

interface BookEntryRowProps {
  entry: BookEntry
  isOwner: boolean
  updating: string | null
  onUpdateStatus: (id: string, field: 'ownershipStatus' | 'readingStatus', value: string) => void
}

function BookEntryRow({ entry, isOwner, updating, onUpdateStatus }: BookEntryRowProps) {
  const coverUrl = cloudinaryUrl(
    entry.edition?.coverImage ?? null,
    'w_80,c_fill,q_auto,f_auto',
  )
  const title = entry.edition?.book?.title ?? '—'
  const authors = entry.edition?.book?.authors?.map((a) => a.author.name).join(', ') ?? ''
  const editionSlug = entry.edition?.slug
  const bookSlug = entry.edition?.book?.slug

  const ownershipColor = OWNERSHIP_STATUS_COLORS[entry.ownershipStatus] ?? 'bg-stone-800 text-stone-400 border-stone-700'
  const isUpdatingOwnership = updating === entry.id + 'ownershipStatus'
  const isUpdatingReading = updating === entry.id + 'readingStatus'

  return (
    <div className="flex items-center gap-4 p-3 rounded-xl bg-stone-900/60 border border-stone-800 hover:border-stone-700 transition-colors">
      {/* Cover */}
      <div className="shrink-0 w-10 h-14 rounded overflow-hidden bg-stone-800">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-600 text-[10px]">?</div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link
          href={editionSlug ? `/editions/${editionSlug}` : bookSlug ? `/books/${bookSlug}` : '#'}
          className="text-stone-100 font-medium text-sm hover:text-amber-400 transition-colors line-clamp-1"
        >
          {title}
        </Link>
        {authors && <p className="text-stone-500 text-xs mt-0.5 line-clamp-1">{authors}</p>}
      </div>

      {/* Read/Unread badge + toggle */}
      <div className="shrink-0">
        {isOwner ? (
          <button
            disabled={isUpdatingReading}
            onClick={() =>
              onUpdateStatus(entry.id, 'readingStatus', entry.readingStatus === 'READ' ? 'UNREAD' : 'READ')
            }
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border transition-colors ${
              entry.readingStatus === 'READ'
                ? 'bg-amber-900/40 text-amber-300 border-amber-700/50 hover:bg-amber-900/60'
                : 'bg-stone-800 text-stone-500 border-stone-700 hover:bg-stone-700'
            } ${isUpdatingReading ? 'opacity-50 cursor-wait' : ''}`}
            title="Toggle read/unread"
          >
            {entry.readingStatus === 'READ' ? 'Read' : 'Unread'}
          </button>
        ) : (
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              entry.readingStatus === 'READ'
                ? 'bg-amber-900/40 text-amber-300 border-amber-700/50'
                : 'bg-stone-800 text-stone-500 border-stone-700'
            }`}
          >
            {entry.readingStatus === 'READ' ? 'Read' : 'Unread'}
          </span>
        )}
      </div>

      {/* Ownership status */}
      <div className="shrink-0">
        {isOwner ? (
          <select
            disabled={isUpdatingOwnership}
            value={entry.ownershipStatus}
            onChange={(e) => onUpdateStatus(entry.id, 'ownershipStatus', e.target.value)}
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border bg-transparent cursor-pointer transition-colors ${ownershipColor} ${isUpdatingOwnership ? 'opacity-50 cursor-wait' : ''}`}
          >
            {OWNERSHIP_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-stone-900 text-stone-100">
                {OWNERSHIP_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        ) : (
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${ownershipColor}`}>
            {OWNERSHIP_STATUS_LABELS[entry.ownershipStatus as OwnershipStatus] ?? entry.ownershipStatus}
          </span>
        )}
      </div>
    </div>
  )
}
