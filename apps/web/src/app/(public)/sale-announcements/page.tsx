'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
import type { PaginatedResponse } from '@luxgrimoire/shared-types'
import { Megaphone, Search, LayoutGrid, List, X } from 'lucide-react'
import { SaleInterestButton } from '@/components/sales/SaleInterestButton'
import { useDebounce } from '@/hooks/useDebounce'

const PAGE_SIZE = 15

interface ListSaleAnnouncement {
  id: string
  title: string
  imageUrl: string | null
  basePrice: number | null
  subscriberBasePrice: number | null
  currency: string | null
  isBundle: boolean
  availableForPurchase: boolean
  generalSaleDate: string | null
  firstAccessDate: string | null
  earlyAccessDate: string | null
  company: { name: string; brandColors?: string[] } | null
  editions: Array<{ edition: { additionalImages: string[] } | null }>
  regions: Array<{ id: string; name: string; isDefault: boolean; firstAccessDate: string | null; earlyAccessDate: string | null; generalSaleDate: string | null }>
}

interface ListCompany {
  id: string
  name: string
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function AnnouncementCard({ a }: { a: ListSaleAnnouncement }) {
  const firstEdition = a.editions?.[0]?.edition
  const cover = firstEdition?.additionalImages?.[0] ?? a.imageUrl ?? null
  const imgUrl = cover ? cloudinaryUrl(cover, 'w_400,h_600,c_fill,q_auto,f_auto') : null
  const saleDate = formatDate(a.generalSaleDate)

  return (
    <Link
      href={`/sale-announcements/${a.id}`}
      className="group flex flex-col rounded-2xl bg-stone-900 border border-stone-800 hover:border-amber-700/60 transition-all hover:shadow-xl hover:shadow-amber-900/10"
    >
      {/* Image — same 2/3 portrait ratio as EditionCard */}
      <div className="relative aspect-[2/3] bg-stone-950 overflow-hidden rounded-t-2xl">
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgUrl}
            alt={a.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="relative w-full h-full flex items-center justify-center text-stone-600">
            <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(a.company?.brandColors)} />
            <p className="relative z-10 font-serif font-semibold text-center px-3 text-sm leading-snug line-clamp-4 text-stone-300">
              {a.title}
            </p>
          </div>
        )}

        {/* Company ribbon — same style as EditionCarousel */}
        {a.company?.name && (
          <div
            className="absolute bottom-0 left-0 right-0 px-2 py-2 text-center pointer-events-none"
            style={{ background: 'rgba(5,10,18,0.88)', borderTop: '1px solid rgba(200,180,140,0.2)' }}
          >
            <span
              className="font-serif font-semibold uppercase leading-none line-clamp-1 text-white"
              style={{ fontSize: '10px', letterSpacing: '0.12em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
            >
              {a.company.name}
            </span>
          </div>
        )}

        {a.isBundle && (
          <span className="absolute top-2 left-2 text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-950/80 border border-stone-600 text-amber-400">
            Bundle
          </span>
        )}
        {a.availableForPurchase && (
          <span className="absolute top-2 right-2 text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-900/80 border border-green-700 text-green-400">
            Live
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col flex-1">
        <div className="flex-1 flex flex-col gap-1">
          <p className="font-serif font-semibold text-stone-100 text-sm leading-snug line-clamp-2 group-hover:text-amber-400 transition-colors">
            {a.title}
          </p>
          {saleDate && <p className="text-xs text-amber-500">🗓 {saleDate}</p>}
          {a.basePrice != null && a.currency && (
            <p className="text-xs text-stone-400">from {a.basePrice} {a.currency}</p>
          )}
          {a.subscriberBasePrice != null && (
            <p className="text-[10px] text-emerald-400/80">🏷 Subscriber price available</p>
          )}
        </div>
        <div className="mt-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <SaleInterestButton sale={a as any} />
        </div>
      </div>
    </Link>
  )
}

function AnnouncementListRow({ a }: { a: ListSaleAnnouncement }) {
  const firstEdition = a.editions?.[0]?.edition
  const cover = firstEdition?.additionalImages?.[0] ?? a.imageUrl ?? null
  const thumb = cover ? cloudinaryUrl(cover, 'w_80,h_80,c_fill,q_auto,f_auto') : null
  const saleDate = formatDate(a.generalSaleDate)

  return (
    <Link
      href={`/sale-announcements/${a.id}`}
      className="group flex items-center gap-4 py-3 hover:bg-stone-900/50 px-2 -mx-2 rounded-lg transition-colors"
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-stone-800 flex items-center justify-center relative">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={a.title} className="w-full h-full object-cover" />
        ) : (
          <>
            <div className="absolute inset-0 opacity-20" style={brandGradientStyle(a.company?.brandColors)} />
            <p className="relative z-10 font-serif text-center text-[10px] leading-tight px-1 line-clamp-3 text-stone-300">
              {a.title}
            </p>
          </>
        )}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-stone-100 group-hover:text-amber-400 transition-colors truncate leading-tight text-sm">
          {a.title}
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {a.company?.name && <span className="text-xs text-amber-600/80">{a.company.name}</span>}
          {saleDate && <span className="text-xs text-stone-400">🗓 {saleDate}</span>}
          {a.basePrice != null && a.currency && (
            <span className="text-xs text-stone-500">from {a.basePrice} {a.currency}</span>
          )}
          {a.subscriberBasePrice != null && (
            <span className="text-[10px] text-emerald-400/80">🏷 sub price</span>
          )}
        </div>
      </div>
      {/* Badges */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {a.availableForPurchase && (
          <span className="text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-900/80 border border-green-700 text-green-400">Live</span>
        )}
        {a.isBundle && (
          <span className="text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-800 border border-stone-600 text-amber-400">Bundle</span>
        )}
      </div>
    </Link>
  )
}


export default function SaleAnnouncementsPage() {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [companyId, setCompanyId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const hasDateFilter = dateFrom || dateTo
  const hasFilters = debouncedSearch || companyId || hasDateFilter

  const { data: companiesData } = useQuery<PaginatedResponse<ListCompany>>({
    queryKey: ['companies-list-filter'],
    queryFn: () => apiFetch('/companies?pageSize=200'),
    staleTime: 5 * 60_000,
  })
  const companies = companiesData?.data ?? []

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['sale-announcements', 'list', debouncedSearch, companyId, dateFrom, dateTo],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        pageSize: String(PAGE_SIZE),
        sort: 'date',
        page: String(pageParam),
      })
      if (!hasDateFilter) params.set('upcoming', 'true')
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      if (companyId) params.set('companyId', companyId)
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
          className="bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-stone-300 focus:outline-none focus:border-amber-500 min-w-[160px]"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Date from */}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          title="Date from (FA / EA / GS)"
          className="bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-stone-300 focus:outline-none focus:border-amber-500"
        />

        {/* Date to */}
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          title="Date to (FA / EA / GS)"
          className="bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-stone-300 focus:outline-none focus:border-amber-500"
        />

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
