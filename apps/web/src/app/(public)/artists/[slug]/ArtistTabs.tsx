'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { resolveEditionCoverUrl } from '@/lib/editionCover'
import { brandGradientStyle } from '@/lib/brandGradient'
import { API_BASE } from '@/lib/authFetch'

const PAGE_SIZE = 24

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const ROLE_COLORS: Record<string, string> = {}
function roleColor(_role: string) {
  return 'bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-dim)]'
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditionSnippet {
  id: string; slug: string; additionalImages: string[]
  variantLabel?: string | null
  bookBoxCompany: { name: string; brandColors?: string[] | null } | null; communityPhotoCover?: string | null
}

export interface GroupedEdition {
  edition: EditionSnippet
  roles: string[]
}

export interface CardMonth {
  id: string; year: number; month: number
  theme: string | null; coverImage: string | null; isSpoiler: boolean
  subscription: { id: string; name: string; slug: string }
}

interface PagedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ─── Load More button ─────────────────────────────────────────────────────────

function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div className="flex justify-center mt-10">
      <button
        onClick={onClick}
        disabled={loading}
        className="px-6 py-2.5 rounded-full border border-stone-700 text-stone-300 text-sm hover:border-brand-600 hover:text-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Loading…' : 'Load more'}
      </button>
    </div>
  )
}

// ─── Edition grid ─────────────────────────────────────────────────────────────

function EditionGrid({ artistSlug }: { artistSlug: string }) {
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<GroupedEdition[]>([])
  const [totalPages, setTotalPages] = useState<number | null>(null)

  const { data: res, isFetching } = useQuery<PagedResponse<GroupedEdition>>({
    queryKey: ['artist-contributions', artistSlug, page],
    queryFn: () =>
      fetch(`${API_BASE}/artists/${artistSlug}/contributions?page=${page}&pageSize=${PAGE_SIZE}`)
        .then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!res) return
    setItems((prev) => page === 1 ? res.data : [...prev, ...res.data])
    setTotalPages(res.totalPages)
  }, [res]) // eslint-disable-line react-hooks/exhaustive-deps

  const isInitialLoading = isFetching && items.length === 0

  if (isInitialLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] rounded-2xl bg-stone-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!items.length && !isFetching) {
    return <p className="text-stone-500 text-center py-20 font-serif text-lg">No book editions listed yet.</p>
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {items.map(({ edition, roles }) => {
          const cover = resolveEditionCoverUrl(edition, 'w_400,h_600,c_fill,q_auto,f_auto')
          const company = edition.bookBoxCompany
          return (
            <Link
              key={edition.id}
              href={`/editions/${edition.slug}`}
              className="group flex flex-col rounded-2xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-brand-700/60 transition-all hover:shadow-xl hover:shadow-brand-900/10"
            >
              <div className="relative aspect-[2/3] bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 overflow-hidden">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={company?.name ?? 'Edition cover'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center text-stone-600">
                    {company?.brandColors && company.brandColors.length > 0 && (
                      <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(company.brandColors)} />
                    )}
                    <svg className="w-10 h-10 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                )}
                {company && (
                  <div className="card-ribbon absolute bottom-0 left-0 right-0 px-2 py-2 text-center">
                    <span className="card-ribbon-text font-serif font-semibold uppercase tracking-widest leading-none line-clamp-1 text-white"
                      style={{ fontSize: '10px', letterSpacing: '0.12em' }}>
                      {company.name}
                    </span>
                  </div>
                )}
                {edition.variantLabel && (
                  <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight bg-stone-800/90 text-stone-300 border border-stone-600 max-w-[calc(100%-0.75rem)] truncate">
                    {edition.variantLabel}
                  </span>
                )}
              </div>
              <div className="p-3 flex flex-col gap-1 flex-1">
                {roles.map((role) => (
                  <p key={role} className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${roleColor(role)}`}>
                    {role}
                  </p>
                ))}
              </div>
            </Link>
          )
        })}
      </div>
      {totalPages !== null && page < totalPages && (
        <LoadMoreButton onClick={() => setPage((p) => p + 1)} loading={isFetching} />
      )}
    </>
  )
}

// ─── Card month grid ──────────────────────────────────────────────────────────

function CardMonthGrid({ artistSlug }: { artistSlug: string }) {
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<CardMonth[]>([])
  const [totalPages, setTotalPages] = useState<number | null>(null)

  const { data: res, isFetching } = useQuery<PagedResponse<CardMonth>>({
    queryKey: ['artist-card-months', artistSlug, page],
    queryFn: () =>
      fetch(`${API_BASE}/artists/${artistSlug}/months?page=${page}&pageSize=${PAGE_SIZE}`)
        .then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!res) return
    setItems((prev) => page === 1 ? res.data : [...prev, ...res.data])
    setTotalPages(res.totalPages)
  }, [res]) // eslint-disable-line react-hooks/exhaustive-deps

  const isInitialLoading = isFetching && items.length === 0

  if (isInitialLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] rounded-2xl bg-stone-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!items.length && !isFetching) {
    return <p className="text-stone-500 text-center py-20 font-serif text-lg">No card months listed yet.</p>
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {items.map((m) => {
          const cover = cloudinaryUrl(m.coverImage, 'w_400,h_400,c_fill,q_auto,f_auto')
          const label = `${MONTH_NAMES[(m.month - 1) % 12]} ${m.year}`
          return (
            <Link
              key={m.id}
              href={`/subscriptions/${m.subscription.slug}`}
              className="group flex flex-col rounded-2xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-brand-700/60 transition-all hover:shadow-xl hover:shadow-brand-900/10"
            >
              <div className="relative aspect-square bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 overflow-hidden">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={m.theme ?? label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-stone-600">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 16M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="card-ribbon absolute bottom-0 left-0 right-0 px-2 py-2 text-center">
                  <span className="card-ribbon-text font-serif font-semibold uppercase tracking-widest leading-none line-clamp-1 text-white"
                    style={{ fontSize: '10px', letterSpacing: '0.12em' }}>
                    {m.subscription.name}
                  </span>
                </div>
              </div>
              <div className="p-3 flex flex-col gap-1">
                <p className="text-xs font-semibold text-brand-400">{label}</p>
                {m.theme && <p className="text-xs text-stone-400 line-clamp-1">{m.theme}</p>}
              </div>
            </Link>
          )
        })}
      </div>
      {totalPages !== null && page < totalPages && (
        <LoadMoreButton onClick={() => setPage((p) => p + 1)} loading={isFetching} />
      )}
    </>
  )
}

// ─── Main tabs component ──────────────────────────────────────────────────────

type Tab = 'editions' | 'months'

export function ArtistTabs({ artistSlug }: { artistSlug: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('editions')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'editions', label: 'Book Editions' },
    { id: 'months',   label: 'Card Months' },
  ]

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-stone-800 mb-8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'editions' && <EditionGrid artistSlug={artistSlug} />}
      {activeTab === 'months'   && <CardMonthGrid artistSlug={artistSlug} />}
    </div>
  )
}
