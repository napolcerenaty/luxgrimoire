'use client'

import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { PaginatedResponse } from '@luxgrimoire/shared-types'
import { LayoutGrid, List, Search, Megaphone } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { AnnouncementCard, AnnouncementListRow, type ListSaleAnnouncement } from '@/components/sales/AnnouncementCard'

const PAGE_SIZE = 20

interface Props {
  companyId: string
}

export function CompanySaleAnnouncementsList({ companyId }: Props) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'live' | 'past'>('live')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['company-sale-announcements', companyId, tab, debouncedSearch],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        companyId,
        pageSize: String(PAGE_SIZE),
        sort: 'date',
        page: String(pageParam),
      })
      if (tab === 'live') params.set('upcoming', 'true')
      else params.set('pastOnly', 'true')
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      return apiFetch<PaginatedResponse<ListSaleAnnouncement>>(`/announcements?${params}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
    staleTime: 30_000,
  })

  const announcements = data?.pages.flatMap((p) => p.data) ?? []
  const isEmpty = !isLoading && announcements.length === 0

  return (
    <div>
      {/* Filters row — same shape as the site-wide /sale-announcements toolbar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search announcements…"
            className="w-full bg-stone-800 border border-stone-700 rounded-xl pl-9 pr-4 py-2.5 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 text-sm"
          />
        </div>

        <div className="inline-flex items-center gap-1 rounded-xl border border-stone-700 bg-stone-800 p-1 shrink-0">
          <button
            onClick={() => setTab('live')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'live' ? 'bg-stone-700 text-amber-400' : 'text-stone-400 hover:text-stone-200'}`}
          >
            Live &amp; Upcoming
          </button>
          <button
            onClick={() => setTab('past')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'past' ? 'bg-stone-700 text-amber-400' : 'text-stone-400 hover:text-stone-200'}`}
          >
            Past
          </button>
        </div>

        <div className="flex items-center gap-1 bg-stone-800 border border-stone-700 rounded-xl px-1 shrink-0">
          <button
            onClick={() => setView('grid')}
            className={`p-1.5 rounded transition-colors ${view === 'grid' ? 'bg-stone-700 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
            aria-label="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('list')}
            className={`p-1.5 rounded transition-colors ${view === 'list' ? 'bg-stone-700 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
            aria-label="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-stone-800 bg-stone-900 animate-pulse aspect-[2/3]" />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="text-center py-20 text-stone-500">
          <Megaphone size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">{tab === 'past' ? 'No past announcements.' : 'No live or upcoming announcements.'}</p>
        </div>
      ) : (
        <>
          {view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {announcements.map((a) => <AnnouncementCard key={a.id} a={a} />)}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-stone-800">
              {announcements.map((a) => <AnnouncementListRow key={a.id} a={a} />)}
            </div>
          )}

          {hasNextPage && (
            <div className="flex justify-center pt-8">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-6 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading…' : 'Show more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
