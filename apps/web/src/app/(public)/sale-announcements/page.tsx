'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiSaleAnnouncement, PaginatedResponse } from '@luxgrimoire/shared-types'
import { Megaphone, Search } from 'lucide-react'
import { AddToCollectionButton } from './[id]/AddToCollectionButton'
import { useAuth } from '@/components/AuthProvider'
import { useDebounce } from '@/hooks/useDebounce'

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function AnnouncementCard({ a, user }: { a: ApiSaleAnnouncement; user: object | null | undefined }) {
  const firstEdition = a.editions?.[0]?.edition
  const cover = firstEdition?.additionalImages?.[0] ?? a.imageUrl ?? null
  const imgUrl = cover ? cloudinaryUrl(cover, 'w_400,h_300,c_fill,q_auto,f_auto') : null
  const saleDate = formatDate(a.generalSaleDate)
  const editionIds = a.editions?.map((e) => e.editionId) ?? []

  return (
    <div
      className="flex flex-col rounded-xl border border-stone-700 overflow-hidden transition-all hover:border-amber-600/40"
      style={{ background: 'var(--bg-raised)' }}
    >
      <Link href={`/sale-announcements/${a.id}`} className="group block">
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4/3', background: 'var(--bg-surface)' }}>
          {imgUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgUrl}
              alt={a.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Megaphone size={32} className="text-amber-700/40" />
            </div>
          )}
          {a.isBundle && (
            <span className="absolute top-2 left-2 text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-900/80 border border-stone-600 text-amber-400">
              Bundle
            </span>
          )}
          {a.availableForPurchase && (
            <span className="absolute top-2 right-2 text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-900/80 border border-green-700 text-green-400">
              Live
            </span>
          )}
        </div>

        <div className="px-4 py-3 flex flex-col gap-1">
          <p className="text-sm font-serif font-semibold text-stone-200 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">
            {a.title}
          </p>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(a as any).company?.name && (
            <p className="text-[11px] text-stone-500">{(a as any).company.name}</p>
          )}
          {saleDate && <p className="text-xs text-amber-500 font-sans">🗓 {saleDate}</p>}
          {a.basePrice != null && a.currency && (
            <p className="text-xs text-stone-400">from {a.basePrice} {a.currency}</p>
          )}
        </div>
      </Link>

      {user && editionIds.length > 0 && (
        <div className="px-4 pb-4 mt-auto">
          <AddToCollectionButton
            saleAnnouncementId={a.id}
            editionIds={editionIds}
            basePrice={a.basePrice ?? undefined}
            currency={a.currency ?? 'USD'}
            compact
          />
        </div>
      )}
    </div>
  )
}

function SectionGrid({ title, items, user }: { title: string; items: ApiSaleAnnouncement[]; user: object | null | undefined }) {
  if (items.length === 0) return null
  return (
    <div className="mb-10">
      <h2 className="text-xs font-sans uppercase tracking-widest text-stone-500 mb-4 border-b border-stone-800 pb-2">
        {title} <span className="ml-1 text-stone-600">({items.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((a) => <AnnouncementCard key={a.id} a={a} user={user} />)}
      </div>
    </div>
  )
}

export default function SaleAnnouncementsPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const { user } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['sale-announcements', 'list', debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ pageSize: '200' })
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      return apiFetch<PaginatedResponse<ApiSaleAnnouncement>>(`/announcements?${params}`)
    },
    staleTime: 60_000,
  })

  const announcements = data?.data ?? []

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const { upcoming, past } = useMemo(() => {
    const upcoming: ApiSaleAnnouncement[] = []
    const past: ApiSaleAnnouncement[] = []
    for (const a of announcements) {
      const saleDate = a.generalSaleDate ? new Date(a.generalSaleDate) : null
      if (!saleDate || saleDate >= today) upcoming.push(a)
      else past.push(a)
    }
    return { upcoming, past }
  }, [announcements, today])

  const isEmpty = announcements.length === 0

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-stone-800 bg-stone-900 animate-pulse" style={{ aspectRatio: '3/4' }} />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="text-center py-20 text-stone-500">
          <Megaphone size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">{search ? 'No results found.' : 'No sales at the moment.'}</p>
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
          <SectionGrid title="Upcoming" items={upcoming} user={user} />
          <SectionGrid title="Past" items={past} user={user} />
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
