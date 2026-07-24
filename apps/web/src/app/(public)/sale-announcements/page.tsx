'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { PaginatedResponse } from '@luxgrimoire/shared-types'
import { Megaphone, Search, LayoutGrid, List, X } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { AnnouncementCard, AnnouncementListRow, type ListSaleAnnouncement } from '@/components/sales/AnnouncementCard'

const PAGE_SIZE = 15

export default function SaleAnnouncementsPage() {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [companyId, setCompanyId] = useState('')
  const [saleType, setSaleType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const hasDateFilter = dateFrom || dateTo
  const hasFilters = debouncedSearch || companyId || saleType || hasDateFilter

  const { data: companies = [], isLoading: companiesLoading } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['companies-names'],
    queryFn: () => apiFetch('/companies/names'),
    staleTime: 5 * 60_000,
  })

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['sale-announcements', 'list', debouncedSearch, companyId, saleType, dateFrom, dateTo],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        pageSize: String(PAGE_SIZE),
        sort: 'date',
        page: String(pageParam),
      })
      if (!hasDateFilter) params.set('upcoming', 'true')
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      if (companyId) params.set('companyId', companyId)
      if (saleType) params.set('saleType', saleType)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      return apiFetch<PaginatedResponse<ListSaleAnnouncement>>(`/announcements?${params}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    staleTime: 60_000,
  })

  const announcements = data?.pages.flatMap((p) => p.data) ?? []
  const isEmpty = !isLoading && announcements.length === 0

  function clearFilters() {
    setSearch('')
    setCompanyId('')
    setSaleType('')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Megaphone size={24} className="text-amber-400" />
          <h1 className="text-3xl font-serif font-bold text-stone-100">Sales</h1>
        </div>
        <Link
          href="/sale-announcement-requests"
          className="text-xs text-amber-500 hover:text-amber-400 border border-stone-700 hover:border-amber-700 px-3 py-1.5 rounded-full transition-colors font-serif"
        >
          + Report a sale
        </Link>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by sale title…"
            className="w-full bg-stone-800 border border-stone-700 rounded-xl pl-9 pr-4 py-2.5 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 text-sm"
          />
        </div>

        {/* Company filter */}
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          disabled={companiesLoading}
          className="bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-stone-300 focus:outline-none focus:border-amber-500 min-w-[160px] disabled:opacity-60"
        >
          <option value="">{companiesLoading ? 'Loading…' : 'All companies'}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Sale type filter */}
        <select
          value={saleType}
          onChange={(e) => setSaleType(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-stone-300 focus:outline-none focus:border-amber-500 min-w-[150px]"
        >
          <option value="">All types</option>
          <option value="LIMITED_PREORDER">⏳ Limited Preorder</option>
          <option value="OPEN_PREORDER">🔓 Open Preorder</option>
          <option value="OVERSTOCK">📦 Overstock</option>
          <option value="SALE">🏷️ Sale</option>
        </select>

        {/* Date from */}
        <label className="flex items-center gap-1.5 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-stone-400 focus-within:border-amber-500">
          <span className="shrink-0 text-stone-500 text-xs">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="First Access / Early Access / General Sale date from"
            className="bg-transparent text-stone-300 focus:outline-none"
          />
        </label>

        {/* Date to */}
        <label className="flex items-center gap-1.5 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-stone-400 focus-within:border-amber-500">
          <span className="shrink-0 text-stone-500 text-xs">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="First Access / Early Access / General Sale date to"
            className="bg-transparent text-stone-300 focus:outline-none"
          />
        </label>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-stone-800 border border-stone-700 rounded-xl px-1">
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

      {/* Active filters + clear */}
      {hasFilters && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-xs text-stone-500">Active filters:</span>
          {debouncedSearch && <span className="text-xs bg-stone-800 border border-stone-700 px-2 py-0.5 rounded-full text-stone-300">"{debouncedSearch}"</span>}
          {companyId && <span className="text-xs bg-stone-800 border border-stone-700 px-2 py-0.5 rounded-full text-stone-300">{companies.find(c => c.id === companyId)?.name ?? companyId}</span>}
          {saleType && <span className="text-xs bg-stone-800 border border-stone-700 px-2 py-0.5 rounded-full text-stone-300">{{ LIMITED_PREORDER: '⏳ Limited Preorder', OPEN_PREORDER: '🔓 Open Preorder', OVERSTOCK: '📦 Overstock', SALE: '🏷️ Sale' }[saleType] ?? saleType}</span>}
          {dateFrom && <span className="text-xs bg-stone-800 border border-stone-700 px-2 py-0.5 rounded-full text-stone-300">from {dateFrom}</span>}
          {dateTo && <span className="text-xs bg-stone-800 border border-stone-700 px-2 py-0.5 rounded-full text-stone-300">to {dateTo}</span>}
          <button onClick={clearFilters} className="text-xs text-stone-500 hover:text-stone-300 flex items-center gap-0.5 transition-colors">
            <X size={12} /> Clear all
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-stone-800 bg-stone-900 animate-pulse aspect-[2/3]" />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="text-center py-20 text-stone-500">
          <Megaphone size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">{hasFilters ? 'No results found.' : 'No upcoming sales at the moment.'}</p>
          {!hasFilters && (
            <p className="text-sm mt-2">
              Spotted one?{' '}
              <Link href="/sale-announcement-requests" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">
                Let us know!
              </Link>
            </p>
          )}
        </div>
      ) : (
        <>
          {view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {announcements.map((a) => <AnnouncementCard key={a.id} a={a} />)}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-stone-800">
              {announcements.map((a) => <AnnouncementListRow key={a.id} a={a} />)}
            </div>
          )}
          {hasNextPage && (
            <div className="text-center mt-10">
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

      <div className="mt-12 text-center text-stone-500 text-sm">
        Don&apos;t see a sale you know about?{' '}
        <Link href="/sale-announcement-requests" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">
          Let us know!
        </Link>
      </div>
    </div>
  )
}
