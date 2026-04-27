'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { useRouter } from 'next/navigation'

// ── Constants ─────────────────────────────────────────────────────────────────

const METRICS = [
  { id: 'edition_view',       label: 'Edition Views',          defaultGroupBy: 'entity' },
  { id: 'collection_add',     label: 'Collection Additions',   defaultGroupBy: 'entity' },
  { id: 'wishlist_add',       label: 'Wishlist Additions',     defaultGroupBy: 'entity' },
  { id: 'book_status_change', label: 'Reading Status Changes', defaultGroupBy: 'value'  },
  { id: 'subscription_view',  label: 'Subscription Views',     defaultGroupBy: 'entity' },
]

const GROUP_BY_OPTIONS = [
  { id: 'entity', label: 'By Edition / Entity' },
  { id: 'value',  label: 'By Value / Status'   },
  { id: 'user',   label: 'By User'              },
  { id: 'day',    label: 'By Day'               },
  { id: 'month',  label: 'By Month'             },
]

const PERIODS = [
  { id: '7',   label: 'Last 7 days'  },
  { id: '30',  label: 'Last 30 days' },
  { id: '90',  label: 'Last 90 days' },
  { id: '365', label: 'Last year'    },
  { id: 'all', label: 'All time'     },
]

const LIMITS = [5, 10, 20, 50]

interface QueryResult { label: string; count: number }

// ── Component ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const router  = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && user && user.role !== 'ADMIN' && user.role !== 'MODERATOR') router.replace('/admin')
  }, [user, loading, router])

  if (loading || !user) return null

  const [metric,  setMetric ] = useState(METRICS[0].id)
  const [groupBy, setGroupBy] = useState<string>(METRICS[0].defaultGroupBy)
  const [period,  setPeriod ] = useState('30')
  const [limit,   setLimit  ] = useState(20)

  // queryKey drives whether the query runs; null = not yet run
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const { data, isLoading, isFetching, error } = useQuery<QueryResult[]>({
    queryKey: ['analytics', activeKey],
    queryFn: () =>
      authFetch<QueryResult[]>(
        `/analytics/admin/query?metric=${metric}&groupBy=${groupBy}&period=${period}&limit=${limit}`,
      ),
    enabled: activeKey !== null,
    staleTime: 1000 * 60,
  })

  function handleMetricChange(id: string) {
    setMetric(id)
    setGroupBy(METRICS.find(m => m.id === id)?.defaultGroupBy ?? 'entity')
    setActiveKey(null) // reset results when query config changes
  }

  function handleRun() {
    setActiveKey(`${metric}|${groupBy}|${period}|${limit}|${Date.now()}`)
  }

  const total = data?.reduce((s, r) => s + r.count, 0) ?? 0
  const maxCount = data?.[0]?.count ?? 1

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-100 mb-1">Analytics</h1>
        <p className="text-stone-400 text-sm">
          Query aggregated usage data. No data is shown until you run a query.
        </p>
      </div>

      {/* Query Builder */}
      <div className="rounded-xl border border-stone-800 bg-stone-900 p-5 mb-6">
        <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider mb-4">Query Builder</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {/* Metric */}
          <div>
            <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wide">Metric</label>
            <select
              value={metric}
              onChange={e => handleMetricChange(e.target.value)}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 text-stone-100 px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            >
              {METRICS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Group By */}
          <div>
            <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wide">Group by</label>
            <select
              value={groupBy}
              onChange={e => { setGroupBy(e.target.value); setActiveKey(null) }}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 text-stone-100 px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            >
              {GROUP_BY_OPTIONS.map(g => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          </div>

          {/* Period */}
          <div>
            <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wide">Time range</label>
            <select
              value={period}
              onChange={e => { setPeriod(e.target.value); setActiveKey(null) }}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 text-stone-100 px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            >
              {PERIODS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Limit */}
          <div>
            <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wide">Top N</label>
            <select
              value={limit}
              onChange={e => { setLimit(Number(e.target.value)); setActiveKey(null) }}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 text-stone-100 px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            >
              {LIMITS.map(n => (
                <option key={n} value={n}>Top {n}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={isLoading || isFetching}
          className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors"
        >
          {isLoading || isFetching ? 'Running…' : '▶ Run Query'}
        </button>
      </div>

      {/* Results */}
      {activeKey === null && (
        <div className="rounded-xl border border-stone-800 bg-stone-900/50 py-16 text-center text-stone-500">
          <p className="text-3xl mb-3">📊</p>
          <p className="font-serif text-stone-400">Configure your query above and click Run</p>
        </div>
      )}

      {activeKey !== null && (isLoading || isFetching) && (
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-6 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 rounded animate-pulse bg-stone-800" />
          ))}
        </div>
      )}

      {activeKey !== null && !isLoading && !isFetching && error && (
        <div className="rounded-xl border border-red-800/50 bg-stone-900 p-6 text-center text-red-400 text-sm">
          Failed to load results. Please try again.
        </div>
      )}

      {activeKey !== null && !isLoading && !isFetching && !error && data && (
        <div className="rounded-xl border border-stone-800 bg-stone-900 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-stone-800">
            <h3 className="text-sm font-semibold text-stone-300">
              {METRICS.find(m => m.id === metric)?.label} ·{' '}
              {GROUP_BY_OPTIONS.find(g => g.id === groupBy)?.label} ·{' '}
              {PERIODS.find(p => p.id === period)?.label}
            </h3>
            <span className="text-xs text-stone-500">{data.length} row(s) · {total.toLocaleString()} total events</span>
          </div>

          {data.length === 0 ? (
            <div className="py-12 text-center text-stone-500 text-sm">No data for this query yet.</div>
          ) : (
            <div className="divide-y divide-stone-800/60">
              {data.map((row, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3 group hover:bg-stone-800/40">
                  <span className="text-xs text-stone-600 font-mono w-5 flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-stone-200 truncate block">{row.label}</span>
                    {/* Bar */}
                    <div className="mt-1 h-1 rounded bg-stone-700 overflow-hidden">
                      <div
                        className="h-full rounded bg-amber-600"
                        style={{ width: `${Math.round((row.count / maxCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-amber-400 flex-shrink-0 tabular-nums">
                    {row.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Future integrations notice */}
      <p className="mt-4 text-xs text-stone-600 text-center">
        Events are stored locally. Future: Mixpanel / Amplitude export via event type filter.
      </p>
    </div>
  )
}
