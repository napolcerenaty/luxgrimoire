'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { API_BASE } from '@/lib/authFetch'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const ROLE_COLORS: Record<string, string> = {
  cover:        'bg-amber-700/80 text-amber-100',
  illustration: 'bg-violet-700/80 text-violet-100',
  map:          'bg-teal-700/80 text-teal-100',
  typography:   'bg-sky-700/80 text-sky-100',
  design:       'bg-pink-700/80 text-pink-100',
}
function roleColor(role: string) {
  return ROLE_COLORS[role.toLowerCase()] ?? 'bg-stone-700/80 text-stone-100'
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditionSnippet {
  id: string; slug: string; additionalImages: string[]; editionName: string | null
  bookBoxCompany: { name: string } | null
}

export interface GroupedEdition {
  edition: EditionSnippet
  roles: string[]
}

interface CardMonth {
  id: string; year: number; month: number
  theme: string | null; coverImage: string | null; isSpoiler: boolean
  subscription: { id: string; name: string; slug: string }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EditionGrid({ editions }: { editions: GroupedEdition[] }) {
  if (!editions.length) {
    return <p className="text-stone-500 text-center py-20 font-serif text-lg">No book editions listed yet.</p>
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
      {editions.map(({ edition, roles }) => {
        const cover = cloudinaryUrl(edition.additionalImages?.[0] ?? null, 'w_400,h_600,c_fill,q_auto,f_auto')
        const company = edition.bookBoxCompany
        return (
          <Link
            key={edition.id}
            href={`/editions/${edition.slug}`}
            className="group flex flex-col rounded-2xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/60 transition-all hover:shadow-xl hover:shadow-amber-900/10"
          >
            <div className="relative aspect-[2/3] bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 overflow-hidden">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt={edition.editionName ?? company?.name ?? 'Edition cover'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-600">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
              )}
              {company && (
                <div className="absolute bottom-0 left-0 right-0 px-2 py-2 text-center"
                  style={{ background: 'rgba(5,10,18,0.88)', borderTop: '1px solid rgba(200,180,140,0.2)' }}>
                  <span className="font-serif font-semibold uppercase tracking-widest leading-none line-clamp-1 text-white"
                    style={{ fontSize: '10px', letterSpacing: '0.12em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                    {company.name}
                  </span>
                </div>
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
  )
}

function CardMonthGrid({ artistSlug }: { artistSlug: string }) {
  const { data: months, isLoading } = useQuery<CardMonth[]>({
    queryKey: ['artist-card-months', artistSlug],
    queryFn: () => fetch(`${API_BASE}/artists/${artistSlug}/months`)
      .then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] rounded-2xl bg-stone-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!months?.length) {
    return <p className="text-stone-500 text-center py-20 font-serif text-lg">No card months listed yet.</p>
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
      {months.map((m) => {
        const cover = cloudinaryUrl(m.coverImage, 'w_400,h_400,c_fill,q_auto,f_auto')
        const label = `${MONTH_NAMES[(m.month - 1) % 12]} ${m.year}`
        return (
          <Link
            key={m.id}
            href={`/subscriptions/${m.subscription.slug}`}
            className="group flex flex-col rounded-2xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/60 transition-all hover:shadow-xl hover:shadow-amber-900/10"
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
              <div className="absolute bottom-0 left-0 right-0 px-2 py-2 text-center"
                style={{ background: 'rgba(5,10,18,0.88)', borderTop: '1px solid rgba(200,180,140,0.2)' }}>
                <span className="font-serif font-semibold uppercase tracking-widest leading-none line-clamp-1 text-white"
                  style={{ fontSize: '10px', letterSpacing: '0.12em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                  {m.subscription.name}
                </span>
              </div>
            </div>
            <div className="p-3 flex flex-col gap-1">
              <p className="text-xs font-semibold text-amber-400">{label}</p>
              {m.theme && <p className="text-xs text-stone-400 line-clamp-1">{m.theme}</p>}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ─── Main tabs component ──────────────────────────────────────────────────────

type Tab = 'editions' | 'months'

export function ArtistTabs({
  artistSlug,
  groupedEditions,
}: {
  artistSlug: string
  groupedEditions: GroupedEdition[]
}) {
  const [activeTab, setActiveTab] = useState<Tab>('editions')

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'editions', label: 'Book Editions', count: groupedEditions.length },
    { id: 'months',   label: 'Card Months' },
  ]

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-stone-800 mb-8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-xs rounded-full px-2 py-0.5 ${activeTab === tab.id ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-800 text-stone-500'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === 'editions' && <EditionGrid editions={groupedEditions} />}
      {activeTab === 'months'   && <CardMonthGrid artistSlug={artistSlug} />}
    </div>
  )
}
