'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Plus, Trash2, BookOpen } from 'lucide-react'

interface CollectionEntry {
  id: string
  isWishlist: boolean
  condition: string | null
  acquiredAt: string | null
  edition: {
    id: string
    slug: string
    coverImage: string | null
    publisher: string | null
    publishYear: number | null
    format: string | null
    book: {
      id: string
      title: string
      slug: string
      seriesName: string | null
      authors: Array<{ id: string; name: string; slug: string }>
    }
  }
}

interface CollectionStats {
  totalOwned: number
  totalWishlist?: number
}

const CONDITION_COLORS: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  MINT: 'success',
  NEAR_MINT: 'success',
  FINE: 'default',
  VERY_GOOD: 'default',
  GOOD: 'warning',
  FAIR: 'warning',
  POOR: 'destructive',
}

type FilterMode = 'ALL' | 'SERIES' | 'YEAR'

export default function CollectionPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<FilterMode>('ALL')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['collection', false],
    queryFn: () => authFetch<CollectionEntry[]>('/collection?isWishlist=false'),
  })

  const { data: stats } = useQuery({
    queryKey: ['collection-stats'],
    queryFn: () => authFetch<CollectionStats>('/collection/stats'),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => authFetch<void>(`/collection/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection'] })
      void queryClient.invalidateQueries({ queryKey: ['collection-stats'] })
    },
  })

  const filtered = entries.filter((e) => {
    if (filter === 'SERIES') return !!e.edition.book.seriesName
    if (filter === 'YEAR') return !!e.acquiredAt
    return true
  })

  const grouped: CollectionEntry[][] = (() => {
    if (filter === 'SERIES') {
      const map = new Map<string, CollectionEntry[]>()
      for (const e of filtered) {
        const key = e.edition.book.seriesName ?? 'Standalone'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      return Array.from(map.values())
    }
    if (filter === 'YEAR') {
      const map = new Map<string, CollectionEntry[]>()
      for (const e of filtered) {
        const key = e.acquiredAt ? new Date(e.acquiredAt).getFullYear().toString() : 'Unknown'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      return Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([, v]) => v)
    }
    return [filtered]
  })()

  if (entriesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-stone-400 animate-pulse">Loading collection…</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-100">My Collection</h1>
          <p className="text-stone-400 text-sm mt-1">Your physical book library</p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          <Plus size={16} />
          Add Book
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Total Owned</p>
          <p className="text-2xl font-serif font-bold text-amber-400">{stats?.totalOwned ?? entries.length}</p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Series</p>
          <p className="text-2xl font-serif font-bold text-stone-100">
            {new Set(entries.map((e) => e.edition.book.seriesName).filter(Boolean)).size}
          </p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Authors</p>
          <p className="text-2xl font-serif font-bold text-stone-100">
            {new Set(entries.flatMap((e) => e.edition.book.authors.map((a) => a.id))).size}
          </p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">This Year</p>
          <p className="text-2xl font-serif font-bold text-stone-100">
            {
              entries.filter(
                (e) => e.acquiredAt && new Date(e.acquiredAt).getFullYear() === new Date().getFullYear(),
              ).length
            }
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['ALL', 'SERIES', 'YEAR'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              filter === f
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'text-stone-400 border-stone-700 hover:border-stone-500'
            }`}
          >
            {f === 'ALL' ? 'All' : f === 'SERIES' ? 'By Series' : 'By Year'}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-stone-500">
          <BookOpen size={48} className="mb-4 opacity-30" />
          <p className="font-serif text-lg">Your collection is empty</p>
          <p className="text-sm mt-1">Start adding books you own</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group, gi) => {
            const groupLabel =
              filter === 'SERIES'
                ? (group[0]?.edition.book.seriesName ?? 'Standalone')
                : filter === 'YEAR'
                  ? (group[0]?.acquiredAt
                      ? new Date(group[0].acquiredAt).getFullYear().toString()
                      : 'Unknown')
                  : null

            return (
              <div key={gi}>
                {groupLabel && (
                  <h2 className="text-lg font-serif font-semibold text-stone-300 mb-4 border-b border-stone-800 pb-2">
                    {groupLabel}
                  </h2>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {group.map((entry) => {
                    const cover = cloudinaryUrl(entry.edition.coverImage)
                    return (
                      <div
                        key={entry.id}
                        className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden group hover:border-stone-600 transition-colors"
                      >
                        <div className="aspect-[2/3] bg-stone-800 relative overflow-hidden">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover}
                              alt={entry.edition.book.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-stone-600">
                              <BookOpen size={32} />
                            </div>
                          )}
                          <button
                            onClick={() => removeMutation.mutate(entry.id)}
                            disabled={removeMutation.isPending}
                            className="absolute top-2 right-2 p-1.5 bg-stone-950/80 text-stone-400 hover:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                            aria-label="Remove"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-medium text-stone-100 leading-tight line-clamp-2 mb-1">
                            {entry.edition.book.title}
                          </p>
                          {entry.edition.book.authors[0] && (
                            <p className="text-xs text-stone-400 truncate">
                              {entry.edition.book.authors[0].name}
                            </p>
                          )}
                          <div className="flex items-center gap-1 mt-2 flex-wrap">
                            {entry.condition && (
                              <Badge variant={CONDITION_COLORS[entry.condition] ?? 'default'}>
                                {entry.condition.replace('_', ' ')}
                              </Badge>
                            )}
                          </div>
                          {entry.acquiredAt && (
                            <p className="text-xs text-stone-500 mt-1">
                              {new Date(entry.acquiredAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add to Collection modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add to Collection">
        <div className="space-y-4">
          <p className="text-sm text-stone-400">
            Search for an edition to add to your collection.
          </p>
          <input
            type="text"
            placeholder="Search by title, author, series…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
          />
          <a
            href={`/search?q=${encodeURIComponent(searchQuery)}`}
            className="block w-full text-center bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            Go to Search
          </a>
        </div>
      </Modal>
    </div>
  )
}
