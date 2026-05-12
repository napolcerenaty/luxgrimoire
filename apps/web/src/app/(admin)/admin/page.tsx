'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { useAuth } from '@/components/AuthProvider'
import dynamic from 'next/dynamic'
import type { ApiBookEdition, PaginatedResponse, ApiBook, ApiAuthor } from '@luxgrimoire/shared-types'
import FormModal from '@/components/admin/FormModal'
import { BookForm, type BookFormState } from '@/components/admin/BookForm'
import Link from 'next/link'

const EditBookEditionForm = dynamic(() => import('@/components/admin/EditBookEditionForm'), { ssr: false })

// ─── Types ─────────────────────────────────────────────────────────────────

interface RecentEdition extends ApiBookEdition {
  createdAt: string
  updatedAt: string
  book?: Pick<ApiBook, 'id' | 'slug' | 'title' | 'seriesName' | 'volumeNumber'> & {
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
  _count?: { userEntries: number }
}

interface DashboardCounts {
  communityImagesPending: number
  dataRequestsPending: number
  dataRequestsAdded: number
  saleRequestsPending: number
  bugReportsOpen: number
  featureRequestsPending: number
  pendingEditions: number
}

// ─── Edit Edition helpers ──────────────────────────────────────────────────

function EditEditionLoader({ slug, onSuccess, onCancel }: { slug: string; onSuccess: () => void; onCancel: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['edition-detail', slug],
    queryFn: () => authFetch<ApiBookEdition>(`/editions/${slug}`),
    staleTime: 0, gcTime: 0,
  })
  if (isLoading || !data) return <div className="py-12 text-center text-stone-400">Loading…</div>
  return (
    <EditBookEditionForm
      edition={data}
      onSuccess={() => { qc.invalidateQueries({ queryKey: ['edition-detail', slug] }); onSuccess() }}
      onCancel={onCancel}
    />
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-stone-800 ${className}`} />
}

// ─── Dashboard count card ──────────────────────────────────────────────────

function CountCard({
  href,
  icon,
  label,
  count,
  countLabel,
  accent,
}: {
  href: string
  icon: string
  label: string
  count: number
  countLabel: string
  accent: 'amber' | 'red' | 'blue' | 'purple' | 'green'
}) {
  const accentClasses = {
    amber: { border: 'border-amber-700/50 hover:border-amber-600', badge: 'bg-amber-600 text-amber-100', ring: 'bg-amber-500/10' },
    red: { border: 'border-red-700/50 hover:border-red-600', badge: 'bg-red-700 text-red-100', ring: 'bg-red-500/10' },
    blue: { border: 'border-blue-700/50 hover:border-blue-600', badge: 'bg-blue-700 text-blue-100', ring: 'bg-blue-500/10' },
    purple: { border: 'border-purple-700/50 hover:border-purple-600', badge: 'bg-purple-700 text-purple-100', ring: 'bg-purple-500/10' },
    green: { border: 'border-green-700/50 hover:border-green-600', badge: 'bg-green-700 text-green-100', ring: 'bg-green-500/10' },
  }[accent]

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl border ${accentClasses.border} bg-stone-900 px-4 py-3 transition-colors group`}
    >
      <span className={`text-2xl flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg ${accentClasses.ring}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-stone-400 leading-tight">{label}</p>
        <p className="text-stone-200 font-semibold text-sm mt-0.5">{countLabel}</p>
      </div>
      {count > 0 && (
        <span className={`flex-shrink-0 text-[11px] font-bold rounded-full px-2 py-0.5 min-w-[22px] text-center ${accentClasses.badge}`}>
          {count}
        </span>
      )}
      {count === 0 && (
        <span className="flex-shrink-0 text-[11px] text-stone-600">✓</span>
      )}
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter()
  const { user } = useAuth()
  const qc = useQueryClient()
  const isAdmin = user?.role === 'ADMIN'
  const [editEditionSlug, setEditEditionSlug] = useState<string | null>(null)

  useEffect(() => {
    if (user?.role === 'COMPANY_MANAGER') {
      router.replace('/admin/companies')
    }
  }, [user, router])

  // ─── Maintenance mode ────────────────────────────────────────────────────
  const { data: maintenance } = useQuery<{ enabled: boolean; message: string }>({
    queryKey: ['admin', 'maintenance'],
    queryFn: () => authFetch('/admin/maintenance'),
    staleTime: 10_000,
  })

  const { mutate: toggleMaintenance, isPending: togglingMaintenance } = useMutation({
    mutationFn: (enabled: boolean) =>
      authFetch('/admin/maintenance', { method: 'PUT', body: JSON.stringify({ enabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'maintenance'] }),
    onError: (err: unknown) => alert(`Failed to toggle maintenance: ${err instanceof Error ? err.message : String(err)}`),
  })

  // ─── Dashboard counts ────────────────────────────────────────────────────
  const { data: counts } = useQuery<DashboardCounts>({
    queryKey: ['admin', 'dashboard-counts'],
    queryFn: () => authFetch('/admin/dashboard-counts'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  // ─── Pending editions ────────────────────────────────────────────────────
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['admin', 'pending-editions'],
    queryFn: () => authFetch<PaginatedResponse<RecentEdition>>('/editions?needsVerification=true&pageSize=50'),
  })

  const pendingEditions = pendingData?.data ?? []

  async function verifyEdition(slug: string) {
    await authFetch(`/editions/${slug}/verify`, { method: 'POST' })
    void qc.invalidateQueries({ queryKey: ['admin', 'pending-editions'] })
    void qc.invalidateQueries({ queryKey: ['admin', 'dashboard-counts'] })
  }

  async function rejectEdition(slug: string, collectionCount?: number) {
    const warningMsg = collectionCount && collectionCount > 0
      ? `This edition is in ${collectionCount} user collection(s). Deleting it will remove it from their collections too. Continue?`
      : 'Reject and delete this edition? This cannot be undone.'
    if (!confirm(warningMsg)) return
    try {
      await authFetch(`/editions/${slug}`, { method: 'DELETE' })
      void qc.invalidateQueries({ queryKey: ['admin', 'pending-editions'] })
      void qc.invalidateQueries({ queryKey: ['admin', 'dashboard-counts'] })
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const totalAttention = counts
    ? counts.communityImagesPending + counts.dataRequestsPending + counts.saleRequestsPending + counts.bugReportsOpen + counts.featureRequestsPending + counts.pendingEditions
    : null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-100 mb-1">Dashboard</h1>
          <p className="text-stone-400 text-sm">
            {totalAttention === null ? 'Loading…' : totalAttention === 0 ? '✓ Everything is up to date' : `${totalAttention} item${totalAttention !== 1 ? 's' : ''} need attention`}
          </p>
        </div>
      </div>

      {/* Maintenance mode banner — ADMIN only */}
      {isAdmin && (
        <div className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 mb-6 transition-colors ${
          maintenance?.enabled
            ? 'bg-red-950/40 border-red-700/50'
            : 'bg-stone-900 border-stone-800'
        }`}>
          <div>
            <p className={`text-sm font-semibold ${maintenance?.enabled ? 'text-red-300' : 'text-stone-200'}`}>
              {maintenance?.enabled ? '🔴 Maintenance mode is ON' : '🟢 Site is live'}
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              {maintenance?.enabled
                ? 'Non-admin users see the maintenance page.'
                : 'All users can access the site normally.'}
            </p>
          </div>
          <button
            onClick={() => toggleMaintenance(!maintenance?.enabled)}
            disabled={togglingMaintenance}
            className={`shrink-0 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 ${
              maintenance?.enabled
                ? 'bg-green-700 hover:bg-green-600 text-white'
                : 'bg-red-700 hover:bg-red-600 text-white'
            }`}
          >
            {togglingMaintenance ? '…' : maintenance?.enabled ? 'Turn off' : 'Enable maintenance'}
          </button>
        </div>
      )}

      {/* Needs attention — count cards */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-stone-500 mb-3">Needs attention</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CountCard
            href="/admin/community-images"
            icon="📷"
            label="Community Images"
            count={counts?.communityImagesPending ?? 0}
            countLabel={counts ? `${counts.communityImagesPending} pending review` : '…'}
            accent="amber"
          />
          <CountCard
            href="/admin/data-requests"
            icon="📦"
            label="Data Requests"
            count={counts?.dataRequestsPending ?? 0}
            countLabel={counts ? `${counts.dataRequestsPending} pending · ${counts.dataRequestsAdded} added` : '…'}
            accent="blue"
          />
          <CountCard
            href="/admin/sale-announcement-requests"
            icon="🏷"
            label="Sale Announcement Requests"
            count={counts?.saleRequestsPending ?? 0}
            countLabel={counts ? `${counts.saleRequestsPending} pending` : '…'}
            accent="purple"
          />
          <CountCard
            href="/admin/bug-reports"
            icon="🐛"
            label="Bug Reports"
            count={counts?.bugReportsOpen ?? 0}
            countLabel={counts ? `${counts.bugReportsOpen} open` : '…'}
            accent="red"
          />
          <CountCard
            href="/admin/feature-requests"
            icon="✨"
            label="Feature Requests"
            count={counts?.featureRequestsPending ?? 0}
            countLabel={counts ? `${counts.featureRequestsPending} pending` : '…'}
            accent="green"
          />
          <CountCard
            href="/admin/editions"
            icon="📚"
            label="Editions"
            count={counts?.pendingEditions ?? 0}
            countLabel={counts ? `${counts.pendingEditions} pending verification` : '…'}
            accent="amber"
          />
        </div>
      </section>

      {/* Pending editions — actionable list */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-stone-500 mb-3">Pending editions</h2>
        <p className="text-sm text-stone-400 mb-4">
          Editions submitted by users that have not yet been verified.
        </p>
        {pendingLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : pendingEditions.length === 0 ? (
          <div className="text-center py-10 text-stone-500">
            <p className="text-3xl mb-3">✓</p>
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
                  <p className="text-xs text-stone-500 mt-0.5">{edition.publisher ?? ''}</p>
                  {edition.book?.authors && edition.book.authors.length > 0 && (
                    <p className="text-xs text-amber-600/80 mt-0.5">
                      by {edition.book.authors.map(a => a.name).join(', ')}
                    </p>
                  )}
                  <p className="text-[11px] text-stone-600 mt-1 font-mono">{edition.slug}</p>
                  {(edition._count?.userEntries ?? 0) > 0 && (
                    <p className="text-[11px] text-amber-500/70 mt-1">
                      ⚠ In {edition._count!.userEntries} user collection(s)
                    </p>
                  )}
                </div>
                <div className="flex gap-2 items-center flex-shrink-0">
                  <a
                    href={edition.book?.slug ? `/editions/${edition.slug}` : '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-stone-400 hover:text-amber-400 border border-stone-700 px-2 py-1 rounded transition-colors"
                  >
                    View
                  </a>
                  <button
                    onClick={() => setEditEditionSlug(edition.slug)}
                    className="text-xs text-stone-300 hover:text-amber-400 border border-stone-700 px-2 py-1 rounded transition-colors"
                  >
                    ✎ Edit
                  </button>
                  <button
                    onClick={() => rejectEdition(edition.slug, edition._count?.userEntries)}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-700/60 px-2 py-1 rounded transition-colors"
                  >
                    ✕ Reject
                  </button>
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

      {/* Edit Edition modal */}
      <FormModal open={editEditionSlug !== null} title="Edit Edition" onClose={() => setEditEditionSlug(null)}>
        {editEditionSlug && (
          <EditEditionLoader
            slug={editEditionSlug}
            onSuccess={() => { qc.invalidateQueries({ queryKey: ['admin', 'pending-editions'] }); setEditEditionSlug(null) }}
            onCancel={() => setEditEditionSlug(null)}
          />
        )}
      </FormModal>
    </div>
  )
}
