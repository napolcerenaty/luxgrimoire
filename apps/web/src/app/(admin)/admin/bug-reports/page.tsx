'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bug, Trash2, CheckCircle, Clock, XCircle, RefreshCw } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'wontfix']

const STATUS_STYLES: Record<string, string> = {
  open: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  in_progress: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  resolved: 'text-green-400 bg-green-500/10 border-green-500/30',
  wontfix: 'text-stone-500 bg-stone-700/30 border-stone-600/30',
}

interface BugReport {
  id: string
  title: string
  description: string
  pageUrl: string | null
  category: string
  status: string
  createdAt: string
  user: { id: string; username: string; email: string } | null
}

export default function AdminBugReportsPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'bug-reports', page, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '30' })
      if (statusFilter) params.set('status', statusFilter)
      return authFetch<{ items: BugReport[]; total: number; page: number; pageSize: number }>(
        `/bug-reports?${params}`
      )
    },
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      authFetch(`/bug-reports/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'bug-reports'] }),
  })

  const deleteReport = useMutation({
    mutationFn: (id: string) =>
      authFetch(`/bug-reports/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'bug-reports'] }),
  })

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bug size={22} className="text-amber-400" />
          <div>
            <h1 className="font-serif text-2xl font-bold text-stone-100">Bug Reports</h1>
            <p className="text-sm text-stone-500">{data?.total ?? 0} total reports</p>
          </div>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['admin', 'bug-reports'] })}
          className="p-2 rounded-lg text-stone-400 hover:text-amber-400 hover:bg-stone-800 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['', ...STATUS_OPTIONS].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'text-stone-400 border-stone-700 hover:border-stone-500'
            }`}
          >
            {s === '' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-stone-500">Loading…</div>
      ) : data?.items.length === 0 ? (
        <div className="text-center py-20 text-stone-500">No reports found.</div>
      ) : (
        <div className="space-y-3">
          {data?.items.map(report => (
            <div
              key={report.id}
              className="bg-stone-900 border border-stone-800 rounded-2xl p-4 hover:border-stone-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[report.status] ?? STATUS_STYLES.open}`}>
                      {report.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-stone-600 bg-stone-800 px-2 py-0.5 rounded-full">
                      {report.category}
                    </span>
                    {report.user && (
                      <span className="text-xs text-stone-500">by {report.user.username}</span>
                    )}
                    <span className="text-xs text-stone-600">
                      {new Date(report.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="font-medium text-stone-200 text-sm">{report.title}</p>
                  <p className="text-sm text-stone-400 mt-1 whitespace-pre-wrap">{report.description}</p>

                  {report.pageUrl && (
                    <p className="text-xs text-stone-600 mt-2 font-mono truncate">{report.pageUrl}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  <select
                    value={report.status}
                    onChange={e => updateStatus.mutate({ id: report.id, status: e.target.value })}
                    className="text-xs bg-stone-800 border border-stone-700 rounded-lg px-2 py-1 text-stone-300 focus:outline-none focus:border-amber-500"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (confirm('Delete this report?')) deleteReport.mutate(report.id)
                    }}
                    className="p-1.5 rounded-lg text-stone-600 hover:text-rose-400 hover:bg-rose-950/30 transition-colors self-end"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl border border-stone-700 text-sm text-stone-400 disabled:opacity-40 hover:bg-stone-800 transition-colors"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-stone-500">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-xl border border-stone-700 text-sm text-stone-400 disabled:opacity-40 hover:bg-stone-800 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
