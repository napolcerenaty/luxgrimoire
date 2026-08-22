'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'
import { useDebounce } from '@/hooks/useDebounce'

const PAGE_SIZE = 20

interface FollowedArtist { id: string; slug: string; name: string }
interface FollowedAuthor { id: string; slug: string; name: string }
interface FollowedBook { id: string; slug: string; title: string; seriesName: string | null }

interface PagedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface SearchItem { id: string; slug: string; name?: string; title?: string }

type FollowType = 'artist' | 'author' | 'book'
type Followed = FollowedArtist | FollowedAuthor | FollowedBook

const CONFIG: Record<FollowType, { segment: string; searchFilter: string; label: string; href: (slug: string) => string }> = {
  artist: { segment: 'artists', searchFilter: 'artists', label: 'Artists', href: (slug) => `/artists/${slug}` },
  author: { segment: 'authors', searchFilter: 'authors', label: 'Authors', href: (slug) => `/authors/${slug}` },
  book: { segment: 'books', searchFilter: 'books', label: 'Books', href: (slug) => `/books/${slug}` },
}

function displayName(item: SearchItem | Followed): string {
  return (item as { name?: string }).name ?? (item as { title?: string }).title ?? ''
}

function FollowSection({ type }: { type: FollowType }) {
  const queryClient = useQueryClient()
  const config = CONFIG[type]

  // Paginated, accumulating "load more" list — kept independent per section so a large
  // Artists list, say, never forces Authors/Books to load or re-render along with it.
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Followed[]>([])
  const [total, setTotal] = useState<number | null>(null)

  const { data: res, isFetching } = useQuery<PagedResponse<Followed>>({
    queryKey: ['follows', config.segment, page],
    queryFn: () => authFetch<PagedResponse<Followed>>(`/follows/${config.segment}?page=${page}&pageSize=${PAGE_SIZE}`),
  })

  useEffect(() => {
    if (!res) return
    setItems((prev) => (page === 1 ? res.data : [...prev, ...res.data]))
    setTotal(res.total)
  }, [res]) // eslint-disable-line react-hooks/exhaustive-deps

  const refetchFromStart = () => {
    setPage(1)
    setItems([])
    setTotal(null)
    void queryClient.invalidateQueries({ queryKey: ['follows', config.segment] })
  }

  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)

  const { data: results, isFetching: searching } = useQuery({
    queryKey: ['follow-search', config.searchFilter, debouncedQuery],
    queryFn: () =>
      authFetch<Record<string, SearchItem[]>>(
        `/search?q=${encodeURIComponent(debouncedQuery)}&filter=${config.searchFilter}`,
      ).then((res) => res[config.searchFilter] ?? []),
    enabled: debouncedQuery.trim().length >= 2,
  })

  const unfollow = useMutation({
    mutationFn: (id: string) => authFetch<void>(`/follows/${config.segment}/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      setItems((prev) => prev.filter((i) => i.id !== id))
      setTotal((prev) => (prev != null ? prev - 1 : prev))
      // refetchType: 'none' — mark the cached pages stale without an immediate active refetch.
      // The list here is already accurate via the local filter above; auto-refetching the
      // currently-loaded page(s) would re-append server data whose pagination window just
      // shifted by one, producing a duplicate id (and a duplicate React key) for any page > 1.
      void queryClient.invalidateQueries({ queryKey: ['follows', config.segment], refetchType: 'none' })
    },
  })

  const follow = useMutation({
    mutationFn: (id: string) => authFetch<unknown>(`/follows/${config.segment}/${id}`, { method: 'POST' }),
    onSuccess: () => {
      setQuery('')
      refetchFromStart()
    },
  })

  const followedIds = new Set(items.map((i) => i.id))
  const showResults = debouncedQuery.trim().length >= 2 && query.trim().length >= 2
  const isInitialLoading = isFetching && items.length === 0
  const hasMore = total != null && items.length < total

  return (
    <section className="bg-navy-900 border border-navy-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-300">{config.label}</h2>
        {total != null && total > 0 && <span className="text-xs text-navy-500">{total}</span>}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Find ${config.label.toLowerCase()} to follow…`}
          className="w-full bg-navy-800 border border-navy-700 rounded-lg pl-9 pr-3 py-2 text-sm text-navy-100 placeholder:text-navy-500 focus:outline-none focus:border-brand-600/60"
        />
        {showResults && (
          <div className="absolute z-10 mt-1 w-full bg-navy-800 border border-navy-700 rounded-lg overflow-hidden shadow-xl max-h-64 overflow-y-auto">
            {searching ? (
              <p className="px-3 py-2 text-sm text-navy-500">Searching…</p>
            ) : !results?.length ? (
              <p className="px-3 py-2 text-sm text-navy-500">No matches.</p>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => follow.mutate(r.id)}
                  disabled={followedIds.has(r.id) || follow.isPending}
                  className="w-full text-left px-3 py-2 text-sm text-navy-200 hover:bg-navy-700 disabled:opacity-50 flex items-center justify-between"
                >
                  <span>{displayName(r)}</span>
                  {followedIds.has(r.id) && <span className="text-xs text-brand-400">Following</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {isInitialLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 bg-navy-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-navy-500">Not following any {config.label.toLowerCase()} yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-navy-800">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between py-2.5">
                <Link href={config.href(item.slug)} className="text-sm text-navy-200 hover:text-brand-400 transition-colors">
                  {displayName(item)}
                </Link>
                <button
                  onClick={() => unfollow.mutate(item.id)}
                  disabled={unfollow.isPending}
                  title="Unfollow"
                  className="text-navy-500 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={isFetching}
              className="w-full text-center text-sm text-navy-400 hover:text-brand-400 disabled:opacity-50 py-1.5 transition-colors"
            >
              {isFetching ? 'Loading…' : `Load more (${total! - items.length} remaining)`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/** Follow/unfollow management for artists, authors, and books — used as the "Follows" tab in
 *  the profile settings page. Each of the three sections paginates and loads independently. */
export function FollowsManager() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-navy-400">
        Get notified when a new edition appears for an artist, author, or book you follow.
      </p>
      <FollowSection type="artist" />
      <FollowSection type="author" />
      <FollowSection type="book" />
    </div>
  )
}
