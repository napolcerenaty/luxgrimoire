'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { BookForm, type BookFormState } from '@/components/admin/BookForm'
import Link from 'next/link'

// ─── Types ─────────────────────────────────────────────────────────────────

interface DashboardCounts {
  communityImagesPending: number
  dataRequestsPending: number
  dataRequestsAdded: number
  saleRequestsPending: number
  bugReportsOpen: number
  featureRequestsPending: number
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
  const isModerator = user?.role === 'MODERATOR'

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

  const totalAttention = counts
    ? counts.communityImagesPending + counts.dataRequestsPending + counts.saleRequestsPending +
      (!isModerator ? counts.bugReportsOpen + counts.featureRequestsPending : 0)
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
          {!isModerator && (
            <>
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
            </>
          )}
        </div>
      </section>
    </div>
  )
}
