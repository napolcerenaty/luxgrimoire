'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { useAuth } from '@/components/AuthProvider'
import type { ApiAdminStats, ApiBookEdition, PaginatedResponse, ApiBook, ApiAuthor } from '@luxgrimoire/shared-types'

interface RecentEdition extends ApiBookEdition {
  createdAt: string
  updatedAt: string
  book?: Pick<ApiBook, 'id' | 'slug' | 'title' | 'coverImage' | 'seriesName' | 'volumeNumber'> & {
    authors?: ApiAuthor[]
  }
  bookBoxCompany?: { id: string; name: string; slug: string } | null
  lastAudit: {
    entityId: string | null
    action: string
    username: string | null
    userId: string | null
    createdAt: string
  } | null
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-stone-800 ${className}`} />
}

export default function AdminDashboard() {
  const router = useRouter()
  const { user } = useAuth()
  const qc = useQueryClient()

  useEffect(() => {
    if (user?.role === 'COMPANY_MANAGER') {
      router.replace('/admin/companies')
    }
  }, [user, router])

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['admin', 'pending-editions'],
    queryFn: () => authFetch<PaginatedResponse<RecentEdition>>('/editions?needsVerification=true&pageSize=50'),
  })

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => authFetch<ApiAdminStats>('/admin/stats'),
    staleTime: 1000 * 60 * 5,
  })

  const STAT_CARDS = [
    { label: 'Books',         value: stats?.totalBooks,         color: 'text-amber-400' },
    { label: 'Editions',      value: stats?.totalEditions,      color: 'text-sky-400' },
    { label: 'Authors',       value: stats?.totalAuthors,       color: 'text-violet-400' },
    { label: 'Artists',       value: stats?.totalArtists,       color: 'text-pink-400' },
    { label: 'Box Companies', value: stats?.totalCompanies,     color: 'text-teal-400' },
    { label: 'Subscriptions', value: stats?.totalSubscriptions, color: 'text-emerald-400' },
    { label: 'Users',         value: stats?.totalUsers,         color: 'text-stone-300' },
    { label: 'Actions (7d)',  value: stats?.actionsLast7Days,   color: 'text-orange-400' },
  ]

  const pendingEditions = pendingData?.data ?? []
  const pendingCount = pendingData?.total ?? 0

  async function verifyEdition(slug: string) {
    await authFetch(`/editions/${slug}/verify`, { method: 'POST' })
    void qc.invalidateQueries({ queryKey: ['admin', 'pending-editions'] })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-100 mb-1">Dashboard</h1>
          <p className="text-stone-400 text-sm">Monitor content changes and recent activity</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
        {STAT_CARDS.map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border border-stone-800 bg-stone-900 px-4 py-3 flex flex-col gap-1"
          >
            <span className={`text-2xl font-bold font-serif ${color}`}>
              {value ?? <span className="inline-block w-8 h-6 bg-stone-800 animate-pulse rounded" />}
            </span>
            <span className="text-[11px] text-stone-500 uppercase tracking-wider font-sans">{label}</span>
          </div>
        ))}
      </div>

      {/* Pending Review */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-stone-100">Pending Review</h2>
        {pendingCount > 0 && (
          <span className="bg-amber-700 text-amber-100 text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
            {pendingCount}
          </span>
        )}
      </div>
      <section>
        <p className="text-sm text-stone-400 mb-4">
          Editions submitted by users that have not yet been verified by an admin or moderator.
        </p>
        {pendingLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : pendingEditions.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            <p className="text-4xl mb-3">✓</p>
            <p className="font-serif">Nothing pending — all caught up!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingEditions.map((edition) => (
              <div key={edition.id} className="rounded-xl border border-amber-800/40 bg-stone-900 p-4 flex items-start gap-4">
                {edition.additionalImages?.[0] && cloudinaryUrl(edition.additionalImages[0], 'w_60,h_90,c_fill,q_auto') && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cloudinaryUrl(edition.additionalImages[0], 'w_60,h_90,c_fill,q_auto')!}
                    alt=""
                    className="w-12 h-[72px] object-cover rounded border border-stone-700 flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-100 text-sm">
                    {edition.book?.title ?? '—'}
                    {edition.editionName && <span className="text-stone-400 ml-1">· {edition.editionName}</span>}
                  </p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {edition.publisher ?? ''}
                  </p>
                  {edition.book?.authors && edition.book.authors.length > 0 && (
                    <p className="text-xs text-amber-600/80 mt-0.5">
                      by {edition.book.authors.map(a => a.name).join(', ')}
                    </p>
                  )}
                  <p className="text-[11px] text-stone-600 mt-1 font-mono">{edition.slug}</p>
                </div>
                <div className="flex gap-2 items-center flex-shrink-0">
                  <a
                    href={edition.book?.slug ? `/books/${edition.book.slug}` : '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-stone-400 hover:text-amber-400 border border-stone-700 px-2 py-1 rounded transition-colors"
                  >
                    View
                  </a>
                  <button
                    onClick={() => verifyEdition(edition.slug)}
                    className="text-xs bg-emerald-800 hover:bg-emerald-700 text-emerald-100 px-3 py-1 rounded transition-colors font-medium"
                  >
                    ✓ Verify
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
