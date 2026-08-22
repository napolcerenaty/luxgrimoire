'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { resolveEditionCoverUrl } from '@/lib/editionCover'
import { brandGradientStyle } from '@/lib/brandGradient'
import { API_BASE } from '@/lib/authFetch'
import { LoadMoreButton, type EditionSnippet, type PagedResponse } from './ArtistTabs'

const PAGE_SIZE = 24
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudioMember {
  id: string
  name: string
  slug: string
  photoUrl: string | null
}

interface Attribution { artistId: string; artistName: string; artistSlug: string; role: string }

interface StudioEditionEntry {
  edition: EditionSnippet
  attributions: Attribution[]
}

interface StudioCardMonth {
  id: string; year: number; month: number
  theme: string | null; coverImage: string | null; isSpoiler: boolean
  subscription: { id: string; name: string; slug: string }
  cardArtist: { id: string; name: string; slug: string } | null
}

type SortDirection = 'newest' | 'oldest'

// ─── Filter chip row ──────────────────────────────────────────────────────────

function FilterChips({
  studioId, studioName, studioPhotoUrl, members, activeId, onSelect,
}: {
  studioId: string; studioName: string; studioPhotoUrl: string | null
  members: StudioMember[]; activeId: string | undefined; onSelect: (id: string | undefined) => void
}) {
  function Chip({ id, label, photoUrl, linkSlug }: { id: string | undefined; label: string; photoUrl: string | null; linkSlug?: string }) {
    const isActive = activeId === id
    const avatar = photoUrl ? cloudinaryUrl(photoUrl, 'w_48,h_48,c_fill,q_auto,f_auto') : null
    return (
      <div className={`flex items-center gap-1 shrink-0 rounded-full pl-1 pr-1 py-1 border transition-colors ${
        isActive ? 'border-brand-500 bg-brand-900/20' : 'border-navy-700'
      }`}>
        <button
          onClick={() => onSelect(id)}
          className={`flex items-center gap-2 rounded-full pl-1 pr-2 py-0.5 text-sm transition-colors ${
            isActive ? 'text-brand-400' : 'text-navy-300 hover:text-navy-100'
          }`}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt={label} className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-navy-800 flex items-center justify-center text-[10px] text-navy-500">
              {label[0]?.toUpperCase()}
            </div>
          )}
          <span className="whitespace-nowrap">{label}</span>
        </button>
        {linkSlug && (
          <Link
            href={`/artists/${linkSlug}`}
            title={`Zobacz profil ${label}`}
            className="text-navy-500 hover:text-brand-400 transition-colors px-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 mb-6">
      <Chip id={undefined} label="Wszyscy" photoUrl={null} />
      <Chip id={studioId} label={studioName} photoUrl={studioPhotoUrl} />
      {members.map((m) => (
        <Chip key={m.id} id={m.id} label={m.name} photoUrl={m.photoUrl} linkSlug={m.slug} />
      ))}
    </div>
  )
}

// ─── Sort toggle ──────────────────────────────────────────────────────────────

function SortToggle({ sort, onChange }: { sort: SortDirection; onChange: (s: SortDirection) => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {(['newest', 'oldest'] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            sort === s
              ? 'border-brand-500 text-brand-400 bg-brand-900/20'
              : 'border-navy-700 text-navy-400 hover:text-navy-200'
          }`}
        >
          {s === 'newest' ? 'Najnowsze' : 'Od najstarszych'}
        </button>
      ))}
    </div>
  )
}

// ─── Edition grid ─────────────────────────────────────────────────────────────

function StudioEditionGrid({ studioSlug, artistId, sort }: { studioSlug: string; artistId: string | undefined; sort: SortDirection }) {
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<StudioEditionEntry[]>([])
  const [totalPages, setTotalPages] = useState<number | null>(null)

  useEffect(() => { setPage(1); setItems([]) }, [studioSlug, artistId, sort])

  const { data: res, isFetching } = useQuery<PagedResponse<StudioEditionEntry>>({
    queryKey: ['studio-contributions', studioSlug, artistId, sort, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort })
      if (artistId) params.set('artistId', artistId)
      return fetch(`${API_BASE}/artists/${studioSlug}/studio-contributions?${params}`).then((r) => r.json())
    },
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!res) return
    setItems((prev) => (page === 1 ? res.data : [...prev, ...res.data]))
    setTotalPages(res.totalPages)
  }, [res]) // eslint-disable-line react-hooks/exhaustive-deps

  const isInitialLoading = isFetching && items.length === 0 && page === 1

  if (isInitialLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] rounded-2xl bg-navy-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!items.length && !isFetching) {
    return <p className="text-navy-500 text-center py-20 font-serif text-lg">No book editions listed yet.</p>
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {items.map(({ edition, attributions }) => {
          const cover = resolveEditionCoverUrl(edition, 'w_400,h_600,c_fill,q_auto,f_auto')
          const company = edition.bookBoxCompany
          return (
            <Link
              key={edition.id}
              href={`/editions/${edition.slug}`}
              className="group flex flex-col rounded-2xl overflow-hidden bg-navy-900 border border-navy-800 hover:border-brand-700/60 transition-all hover:shadow-xl hover:shadow-brand-900/10"
            >
              <div className="relative aspect-[2/3] bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900 overflow-hidden">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={company?.name ?? 'Edition cover'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center text-navy-600">
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
                  <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight bg-navy-800/90 text-navy-300 border border-navy-600 max-w-[calc(100%-0.75rem)] truncate">
                    {edition.variantLabel}
                  </span>
                )}
              </div>
              <div className="p-3 flex flex-col gap-1 flex-1">
                {attributions.map((a, i) => (
                  <p key={`${a.artistId}-${a.role}-${i}`} className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-dim)] line-clamp-1">
                    {a.artistName} · {a.role}
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

function StudioCardMonthGrid({ studioSlug, artistId }: { studioSlug: string; artistId: string | undefined }) {
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<StudioCardMonth[]>([])
  const [totalPages, setTotalPages] = useState<number | null>(null)

  useEffect(() => { setPage(1); setItems([]) }, [studioSlug, artistId])

  const { data: res, isFetching } = useQuery<PagedResponse<StudioCardMonth>>({
    queryKey: ['studio-card-months', studioSlug, artistId, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (artistId) params.set('artistId', artistId)
      return fetch(`${API_BASE}/artists/${studioSlug}/studio-months?${params}`).then((r) => r.json())
    },
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!res) return
    setItems((prev) => (page === 1 ? res.data : [...prev, ...res.data]))
    setTotalPages(res.totalPages)
  }, [res]) // eslint-disable-line react-hooks/exhaustive-deps

  const isInitialLoading = isFetching && items.length === 0 && page === 1

  if (isInitialLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] rounded-2xl bg-navy-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!items.length && !isFetching) {
    return <p className="text-navy-500 text-center py-20 font-serif text-lg">No card months listed yet.</p>
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
              className="group flex flex-col rounded-2xl overflow-hidden bg-navy-900 border border-navy-800 hover:border-brand-700/60 transition-all hover:shadow-xl hover:shadow-brand-900/10"
            >
              <div className="relative aspect-square bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900 overflow-hidden">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={m.theme ?? label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-navy-600">
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
                {m.theme && <p className="text-xs text-navy-400 line-clamp-1">{m.theme}</p>}
                {!artistId && m.cardArtist && (
                  <p className="text-[11px] text-navy-500 line-clamp-1">{m.cardArtist.name}</p>
                )}
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

export function StudioTabs({
  studioSlug, studioId, studioName, studioPhotoUrl, members,
}: {
  studioSlug: string; studioId: string; studioName: string; studioPhotoUrl: string | null; members: StudioMember[]
}) {
  const [activeTab, setActiveTab] = useState<Tab>('editions')
  const [filterArtistId, setFilterArtistId] = useState<string | undefined>(undefined)
  const [sort, setSort] = useState<SortDirection>('newest')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'editions', label: 'Book Editions' },
    { id: 'months',   label: 'Card Months' },
  ]

  return (
    <div>
      <FilterChips
        studioId={studioId}
        studioName={studioName}
        studioPhotoUrl={studioPhotoUrl}
        members={members}
        activeId={filterArtistId}
        onSelect={setFilterArtistId}
      />

      <div className="flex items-center justify-between gap-3 border-b border-navy-800 mb-8 flex-wrap">
        <div className="flex items-center gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-navy-400 hover:text-navy-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === 'editions' && <SortToggle sort={sort} onChange={setSort} />}
      </div>

      {activeTab === 'editions' && <StudioEditionGrid studioSlug={studioSlug} artistId={filterArtistId} sort={sort} />}
      {activeTab === 'months'   && <StudioCardMonthGrid studioSlug={studioSlug} artistId={filterArtistId} />}
    </div>
  )
}
