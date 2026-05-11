'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { PaginatedResponse } from '@luxgrimoire/shared-types'
import { Megaphone, Search } from 'lucide-react'
import { SaleInterestButton } from '@/components/sales/SaleInterestButton'
import { useDebounce } from '@/hooks/useDebounce'

const PAGE_SIZE = 15

interface ListSaleAnnouncement {
  id: string
  title: string
  imageUrl: string | null
  basePrice: number | null
  currency: string | null
  isBundle: boolean
  availableForPurchase: boolean
  generalSaleDate: string | null
  firstAccessDate: string | null
  earlyAccessDate: string | null
  company: { name: string } | null
  editions: Array<{ edition: { additionalImages: string[] } | null }>
  regions: Array<{ id: string; name: string; isDefault: boolean; firstAccessDate: string | null; earlyAccessDate: string | null; generalSaleDate: string | null }>
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
      <div className="relative aspect-[2/3] bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 overflow-hidden rounded-t-2xl">
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgUrl}
            alt={a.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-600">
            <Megaphone size={32} className="text-amber-700/40" />
          </div>
        )}

        {/* Company ribbon */}
        {a.company?.name && (
          <div className="absolute bottom-0 left-0 right-0 bg-stone-950/80 backdrop-blur-sm px-3 py-1.5 pointer-events-none">
            <p className="text-[11px] font-medium text-amber-300 truncate">{a.company.name}</p>
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
        </div>
        <div className="mt-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <SaleInterestButton sale={a as any} />
        </div>
      </div>
    </Link>
  )
}

export default function SaleAnnouncementsPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['sale-announcements', 'upcoming', debouncedSearch],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        pageSize: String(PAGE_SIZE),
        upcoming: 'true',
        page: String(pageParam),
      })
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      return apiFetch<PaginatedResponse<ListSaleAnnouncement>>(`/announcements?${params}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    staleTime: 60_000,
  })

  const announcements = data?.pages.flatMap((p) => p.data) ?? []
  const isEmpty = !isLoading && announcements.length === 0

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

      {/* Search */}
      <div className="relative mb-8">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, company or book…"
          className="w-full bg-stone-800 border border-stone-700 rounded-xl pl-9 pr-4 py-2.5 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-stone-800 bg-stone-900 animate-pulse aspect-[2/3]" />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="text-center py-20 text-stone-500">
          <Megaphone size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">{search ? 'No results found.' : 'No upcoming sales at the moment.'}</p>
          {!search && (
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {announcements.map((a) => <AnnouncementCard key={a.id} a={a} />)}
          </div>
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
