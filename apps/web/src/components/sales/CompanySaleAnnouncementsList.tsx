'use client'

import { useState, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiSaleAnnouncement, PaginatedResponse } from '@luxgrimoire/shared-types'
import { SaleAnnouncementModal } from '@/components/sales/SaleAnnouncementModal'
import { useDebounce } from '@/hooks/useDebounce'
import { Search } from 'lucide-react'

const PAGE_SIZE = 20

interface ListItem {
  id: string
  title: string
  imageUrl: string | null
  saleType: string | null
  generalSaleDate: string | null
  firstAccessDate: string | null
  earlyAccessDate: string | null
  endsAt: string | null
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Props {
  companyId: string
}

export function CompanySaleAnnouncementsList({ companyId }: Props) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'live' | 'past'>('live')
  const [selected, setSelected] = useState<ApiSaleAnnouncement | null>(null)
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
      return apiFetch<PaginatedResponse<ListItem>>(`/announcements?${params}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
    staleTime: 30_000,
  })

  const announcements = data?.pages.flatMap((p) => p.data) ?? []

  const handleOpen = useCallback(async (id: string) => {
    try {
      const full = await apiFetch<ApiSaleAnnouncement>(`/announcements/${id}`)
      setSelected(full)
    } catch {
      // ignore — clicking again will retry
    }
  }, [])

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="inline-flex items-center gap-1 rounded-lg border border-stone-700 bg-stone-900/60 p-1 shrink-0">
          <button
            onClick={() => setTab('live')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'live' ? 'bg-stone-700 text-stone-100' : 'text-stone-400 hover:text-stone-200'}`}
          >
            Live &amp; Upcoming
          </button>
          <button
            onClick={() => setTab('past')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'past' ? 'bg-stone-700 text-stone-100' : 'text-stone-400 hover:text-stone-200'}`}
          >
            Past
          </button>
        </div>
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none">
            <Search size={14} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search announcements…"
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg bg-stone-800 border border-stone-700 text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-600/60 w-full"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-stone-900 animate-pulse" />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <p className="text-stone-500 text-sm text-center py-16">
          {tab === 'past' ? 'No past announcements.' : 'No live or upcoming announcements.'}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-stone-800">
          {announcements.map((a) => {
            const cover = a.imageUrl ? cloudinaryUrl(a.imageUrl, 'w_120,h_180,c_fill,q_auto,f_auto') : null
            const date = formatDate(a.generalSaleDate ?? a.earlyAccessDate ?? a.firstAccessDate)
            return (
              <button
                key={a.id}
                onClick={() => handleOpen(a.id)}
                className="flex items-center gap-3 py-3 text-left hover:bg-stone-900/60 transition-colors rounded-lg px-1 -mx-1"
              >
                <div className="w-10 h-14 shrink-0 rounded bg-stone-900 overflow-hidden">
                  {cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-serif font-semibold text-stone-100 line-clamp-1">{a.title}</p>
                  {date && <p className="text-xs text-stone-500 mt-0.5">{date}</p>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center pt-6 pb-2">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="px-5 py-2 text-sm rounded-lg bg-stone-800 border border-stone-700 text-stone-300 hover:bg-stone-700 hover:text-amber-400 transition-colors disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}

      <SaleAnnouncementModal sale={selected} onClose={() => setSelected(null)} />
    </>
  )
}
