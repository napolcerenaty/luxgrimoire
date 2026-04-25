'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { useAuth } from '@/components/AuthProvider'
import type { ApiAuditLog, ApiAdminStats, ApiBookEdition, PaginatedResponse, ApiBook, ApiAuthor } from '@luxgrimoire/shared-types'

type Tab = 'editions' | 'audit' | 'pending'

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

const ACTION_COLORS: Record<string, string> = {
  CREATE_EDITION: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  UPDATE_EDITION: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_EDITION: 'bg-red-900/60 text-red-300 border-red-700',
  CREATE_BOOK: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  UPDATE_BOOK: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_BOOK: 'bg-red-900/60 text-red-300 border-red-700',
  CREATE_COMPANY: 'bg-sky-900/60 text-sky-300 border-sky-700',
  UPDATE_COMPANY: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_COMPANY: 'bg-red-900/60 text-red-300 border-red-700',
  CREATE_AUTHOR: 'bg-violet-900/60 text-violet-300 border-violet-700',
  UPDATE_AUTHOR: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_AUTHOR: 'bg-red-900/60 text-red-300 border-red-700',
  CREATE_ARTIST: 'bg-pink-900/60 text-pink-300 border-pink-700',
  UPDATE_ARTIST: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_ARTIST: 'bg-red-900/60 text-red-300 border-red-700',
  CREATE_SUBSCRIPTION: 'bg-teal-900/60 text-teal-300 border-teal-700',
  UPDATE_SUBSCRIPTION: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_SUBSCRIPTION: 'bg-red-900/60 text-red-300 border-red-700',
}

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_COLORS[action] ?? 'bg-stone-800 text-stone-400 border-stone-600'
  return (
    <span className={`inline-block text-[10px] font-mono font-semibold border rounded px-2 py-0.5 ${cls}`}>
      {action}
    </span>
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-stone-800 ${className}`} />
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const PAGE_SIZE = 30

export default function AdminDashboard() {
  const router = useRouter()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('editions')

  useEffect(() => {
    if (user?.role === 'COMPANY_MANAGER') {
      router.replace('/admin/companies')
    }
  }, [user, router])

  // Editions state
  const [editionsPage, setEditionsPage] = useState(1)
  const [editionsSearch, setEditionsSearch] = useState('')
  const [editionsSortBy, setEditionsSortBy] = useState('updatedAt')
  const [editionsOrder, setEditionsOrder] = useState('desc')

  // Audit state
  const [logsPage, setLogsPage] = useState(1)
  const [logsSearch, setLogsSearch] = useState('')
  const [logsEntityType, setLogsEntityType] = useState('')
  const [logsAction, setLogsAction] = useState('')
  const [logsSortBy, setLogsSortBy] = useState('createdAt')
  const [logsOrder, setLogsOrder] = useState('desc')

  const buildEditionsParams = useCallback(() => {
    const p = new URLSearchParams({
      page: String(editionsPage),
      pageSize: String(PAGE_SIZE),
      sortBy: editionsSortBy,
      order: editionsOrder,
    })
    if (editionsSearch) p.set('search', editionsSearch)
    return p.toString()
  }, [editionsPage, editionsSortBy, editionsOrder, editionsSearch])

  const buildLogsParams = useCallback(() => {
    const p = new URLSearchParams({
      page: String(logsPage),
      pageSize: String(PAGE_SIZE),
      sortBy: logsSortBy,
      order: logsOrder,
    })
    if (logsSearch) p.set('search', logsSearch)
    if (logsEntityType) p.set('entityType', logsEntityType)
    if (logsAction) p.set('action', logsAction)
    return p.toString()
  }, [logsPage, logsSortBy, logsOrder, logsSearch, logsEntityType, logsAction])

  const { data: editionsData, isLoading: editionsLoading } = useQuery({
    queryKey: ['admin', 'editions', buildEditionsParams()],
    queryFn: () => authFetch<PaginatedResponse<RecentEdition>>(`/admin/recent-editions?${buildEditionsParams()}`),
    placeholderData: keepPreviousData,
    enabled: tab === 'editions',
  })

  const qc = useQueryClient()

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['admin', 'pending-editions'],
    queryFn: () => authFetch<PaginatedResponse<RecentEdition>>('/editions?needsVerification=true&pageSize=100'),
    enabled: tab === 'pending',
  })

  async function verifyEdition(slug: string) {
    await authFetch(`/editions/${slug}/verify`, { method: 'POST' })
    void qc.invalidateQueries({ queryKey: ['admin', 'pending-editions'] })
    void qc.invalidateQueries({ queryKey: ['admin', 'editions'] })
  }

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['admin', 'audit-logs', buildLogsParams()],
    queryFn: () => authFetch<PaginatedResponse<ApiAuditLog>>(`/admin/audit-logs?${buildLogsParams()}`),
    placeholderData: keepPreviousData,
    enabled: tab === 'audit',
  })

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => authFetch<ApiAdminStats>('/admin/stats'),
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


  const editions = editionsData?.data ?? []
  const editionsTotalPages = Math.ceil((editionsData?.total ?? 0) / PAGE_SIZE)
  const logs = logsData?.data ?? []
  const logsTotalPages = Math.ceil((logsData?.total ?? 0) / PAGE_SIZE)
  const pendingEditions = pendingData?.data ?? []
  const pendingCount = pendingData?.total ?? 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-100 mb-1">Dashboard</h1>
        <p className="text-stone-400 text-sm">Monitor content changes and recent activity</p>
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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-stone-800">
        {(['editions', 'pending', 'audit'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              tab === t
                ? 'border-amber-500 text-amber-400 bg-stone-900'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            {t === 'editions' ? 'Recent Editions' : t === 'pending' ? 'Pending Review' : 'Audit Log'}
            {t === 'pending' && pendingCount > 0 && (
              <span className="bg-amber-700 text-amber-100 text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Recent Editions Tab */}
      {tab === 'editions' && (
        <section>
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder="Search editions, books…"
              value={editionsSearch}
              onChange={(e) => { setEditionsSearch(e.target.value); setEditionsPage(1) }}
              className="flex-1 min-w-[200px] bg-stone-900 border border-stone-800 rounded-xl px-4 py-2 text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            <select
              value={editionsSortBy}
              onChange={(e) => { setEditionsSortBy(e.target.value); setEditionsPage(1) }}
              className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500"
            >
              <option value="updatedAt">Sort: Updated</option>
              <option value="createdAt">Sort: Created</option>
            </select>
            <select
              value={editionsOrder}
              onChange={(e) => { setEditionsOrder(e.target.value); setEditionsPage(1) }}
              className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-stone-800 bg-stone-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-800 text-stone-400 text-left">
                  <th className="px-4 py-3 font-semibold">Cover</th>
                  <th className="px-4 py-3 font-semibold">Book</th>
                  <th className="px-4 py-3 font-semibold">Edition</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 font-semibold">Last Action</th>
                  <th className="px-4 py-3 font-semibold">By</th>
                </tr>
              </thead>
              <tbody>
                {editionsLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-stone-800">
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  : editions.length === 0
                  ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-stone-500">No editions found</td></tr>
                  )
                  : editions.map((edition) => (
                    <tr key={edition.id} className="border-b border-stone-800 hover:bg-stone-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="w-9 h-13 rounded overflow-hidden bg-stone-800 shrink-0">
                          {edition.coverImage
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={edition.coverImage} alt="" className="w-full h-full object-cover" />
                            : <div className="w-9 h-13 flex items-center justify-center text-stone-600 text-xs">?</div>
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-stone-200 line-clamp-1">{edition.book?.title ?? '—'}</span>
                        {edition.book?.authors?.[0] && (
                          <span className="text-xs text-stone-500 block">{edition.book.authors[0].name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-stone-300 font-mono text-xs">{edition.slug}</span>
                        {edition.editionName && <span className="text-stone-500 block text-xs">{edition.editionName}</span>}
                      </td>
                      <td className="px-4 py-3 text-stone-400 text-xs">
                        {edition.bookBoxCompany?.name ?? edition.bookBoxCompanyCustomName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-stone-400 text-xs whitespace-nowrap">
                        {formatDate(edition.updatedAt as unknown as string)}
                      </td>
                      <td className="px-4 py-3">
                        {edition.lastAudit
                          ? <ActionBadge action={edition.lastAudit.action} />
                          : <span className="text-stone-600 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-stone-400 text-xs">{edition.lastAudit?.username ?? '—'}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {editionsTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-stone-400">
              <span>{editionsData?.total ?? 0} total</span>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => setEditionsPage((p) => Math.max(1, p - 1))}
                  disabled={editionsPage === 1}
                  className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 disabled:opacity-40 hover:border-amber-600 transition-colors"
                >← Prev</button>
                <span className="text-stone-500">{editionsPage} / {editionsTotalPages}</span>
                <button
                  onClick={() => setEditionsPage((p) => Math.min(editionsTotalPages, p + 1))}
                  disabled={editionsPage === editionsTotalPages}
                  className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 disabled:opacity-40 hover:border-amber-600 transition-colors"
                >Next →</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Pending Review Tab */}
      {tab === 'pending' && (
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
                  {edition.coverImage && cloudinaryUrl(edition.coverImage, 'w_60,h_90,c_fill,q_auto') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cloudinaryUrl(edition.coverImage, 'w_60,h_90,c_fill,q_auto')!}
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
      )}

      {/* Audit Log Tab */}
      {tab === 'audit' && (
        <section>
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder="Search user, action, entity…"
              value={logsSearch}
              onChange={(e) => { setLogsSearch(e.target.value); setLogsPage(1) }}
              className="flex-1 min-w-[200px] bg-stone-900 border border-stone-800 rounded-xl px-4 py-2 text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            <select
              value={logsEntityType}
              onChange={(e) => { setLogsEntityType(e.target.value); setLogsPage(1) }}
              className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500"
            >
              <option value="">All entity types</option>
              {['edition', 'book', 'company', 'subscription', 'author', 'artist'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={logsAction}
              onChange={(e) => { setLogsAction(e.target.value); setLogsPage(1) }}
              className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500"
            >
              <option value="">All actions</option>
              {[
                'CREATE_EDITION','UPDATE_EDITION','DELETE_EDITION',
                'CREATE_BOOK','UPDATE_BOOK','DELETE_BOOK',
                'CREATE_COMPANY','UPDATE_COMPANY','DELETE_COMPANY',
                'CREATE_SUBSCRIPTION','UPDATE_SUBSCRIPTION','DELETE_SUBSCRIPTION',
                'CREATE_AUTHOR','UPDATE_AUTHOR','DELETE_AUTHOR',
                'CREATE_ARTIST','UPDATE_ARTIST','DELETE_ARTIST',
              ].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              value={logsSortBy}
              onChange={(e) => { setLogsSortBy(e.target.value); setLogsPage(1) }}
              className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500"
            >
              <option value="createdAt">Sort: Time</option>
              <option value="action">Sort: Action</option>
              <option value="entityType">Sort: Entity</option>
              <option value="username">Sort: User</option>
            </select>
            <select
              value={logsOrder}
              onChange={(e) => { setLogsOrder(e.target.value); setLogsPage(1) }}
              className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-stone-800 bg-stone-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-800 text-stone-400 text-left">
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">When</th>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Entity type</th>
                  <th className="px-4 py-3 font-semibold">Entity title</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {logsLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-stone-800">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  : logs.length === 0
                  ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-stone-500">No audit logs found</td></tr>
                  )
                  : logs.map((log) => (
                    <tr key={log.id} className="border-b border-stone-800 hover:bg-stone-800/40 transition-colors">
                      <td className="px-4 py-3 text-stone-400 text-xs whitespace-nowrap">{formatDate(log.createdAt)}</td>
                      <td className="px-4 py-3 text-stone-300 text-xs font-mono">{log.username ?? log.userId ?? '—'}</td>
                      <td className="px-4 py-3"><ActionBadge action={log.action} /></td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-mono text-stone-400 bg-stone-800 border border-stone-700 rounded px-2 py-0.5">
                          {log.entityType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-stone-300 text-xs max-w-[180px] truncate">
                        {log.entityTitle ?? log.entityId ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-stone-500 text-xs max-w-[200px] truncate">
                        {log.metadata ? JSON.stringify(log.metadata) : '—'}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {logsTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-stone-400">
              <span>{logsData?.total ?? 0} total</span>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  disabled={logsPage === 1}
                  className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 disabled:opacity-40 hover:border-amber-600 transition-colors"
                >← Prev</button>
                <span className="text-stone-500">{logsPage} / {logsTotalPages}</span>
                <button
                  onClick={() => setLogsPage((p) => Math.min(logsTotalPages, p + 1))}
                  disabled={logsPage === logsTotalPages}
                  className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 disabled:opacity-40 hover:border-amber-600 transition-colors"
                >Next →</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
