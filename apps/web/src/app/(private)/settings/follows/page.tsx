'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'
import { useDebounce } from '@/hooks/useDebounce'

interface FollowedArtist { id: string; slug: string; name: string }
interface FollowedAuthor { id: string; slug: string; name: string }
interface FollowedBook { id: string; slug: string; title: string; seriesName: string | null }

interface FollowsResponse {
  artists: FollowedArtist[]
  authors: FollowedAuthor[]
  books: FollowedBook[]
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

function FollowSection({ type, items }: { type: FollowType; items: Followed[] }) {
  const queryClient = useQueryClient()
  const config = CONFIG[type]
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follows'] }),
  })

  const follow = useMutation({
    mutationFn: (id: string) => authFetch<unknown>(`/follows/${config.segment}/${id}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follows'] })
      setQuery('')
    },
  })

  const followedIds = new Set(items.map((i) => i.id))
  const showResults = debouncedQuery.trim().length >= 2 && query.trim().length >= 2

  return (
    <section className="bg-navy-900 border border-navy-800 rounded-2xl p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-300">{config.label}</h2>

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

      {items.length === 0 ? (
        <p className="text-sm text-navy-500">Not following any {config.label.toLowerCase()} yet.</p>
      ) : (
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
      )}
    </section>
  )
}

export default function FollowsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['follows'],
    queryFn: () => authFetch<FollowsResponse>('/follows'),
  })

  if (isLoading || !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="h-8 bg-navy-800 rounded-lg w-48 animate-pulse" />
        <div className="h-32 bg-navy-800 rounded-2xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-serif text-navy-100">My Follows</h1>
        <p className="text-sm text-navy-400 mt-1">
          Get notified when a new edition appears for an artist, author, or book you follow.
        </p>
      </div>

      <FollowSection type="artist" items={data.artists} />
      <FollowSection type="author" items={data.authors} />
      <FollowSection type="book" items={data.books} />
    </div>
  )
}
