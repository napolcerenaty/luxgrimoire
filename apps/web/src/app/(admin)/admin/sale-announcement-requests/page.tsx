'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Trash2, RefreshCw, ExternalLink } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'
import { Pagination } from '@/components/admin/Pagination'

const STATUS_OPTIONS = ['pending', 'processed', 'declined']
const STATUS_STYLES: Record<string, string> = {
  pending: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  processed: 'text-green-400 bg-green-500/10 border-green-500/30',
  declined: 'text-stone-500 bg-stone-700/30 border-stone-600/30',
}

interface SaleAnnouncementRequest {
  id: string; url: string; notes: string | null; status: string; adminNote: string | null; createdAt: string
  user: { id: string; username: string; email: string } | null
}

export default function AdminSaleAnnouncementRequestsPage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'sale-announcement-requests', page, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '30' })
      if (statusFilter) params.set('status', statusFilter)
      return authFetch<{ items: SaleAnnouncementRequest[]; total: number; page: number; pageSize: number }>(
        `/sale-announcement-requests?${params}`
      )
    },
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      authFetch(`/sale-announcement-requests/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, adminNote: adminNotes[id] || undefined }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sale-announcement-requests'] }),
  })

  const del = useMutation({
    mutationFn: (id: string) => authFetch(`/sale-announcement-requests/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sale-announcement-requests'] }),
  })

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Megaphone size={22} className="text-amber-400" />
          <div>
            <h1 className="font-serif text-2xl font-bold text-stone-100">Sale Announcement Requests</h1>
            <p className="text-sm text-stone-500">{data?.total ?? 0} total submissions</p>
          </div>
        </div>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'sale-announcement-requests'] })}
          className="p-2 rounded-lg text-stone-400 hover:text-amber-400 hover:bg-stone-800 transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['', ...STATUS_OPTIONS].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'text-stone-400 border-stone-700 hover:border-stone-500'
            }`}>
            {s === '' ? 'All' : s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-stone-500">Loading…</div>
      ) : data?.items.length === 0 ? (
        <div className="text-center py-20 text-stone-500">No submissions found.</div>
      ) : (
        <div className="space-y-3">
          {data?.items.map(r => (
            <div key={r.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-4 hover:border-stone-700 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[r.status] ?? STATUS_STYLES.pending}`}>
                      {r.status.toUpperCase()}
                    </span>
                    {r.user && <span className="text-xs text-stone-500">by {r.user.username}</span>}
                    <span className="text-xs text-stone-600">{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1.5 font-medium break-all">
                    <ExternalLink size={13} className="shrink-0" /> {r.url}
                  </a>
                  {r.notes && <p className="text-sm text-stone-400 mt-2 whitespace-pre-wrap">{r.notes}</p>}
                  <input
                    className="mt-2 w-full text-xs bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-300 focus:outline-none focus:border-amber-500"
                    placeholder="Admin note (sent to user on status change)…"
                    value={adminNotes[r.id] ?? r.adminNote ?? ''}
                    onChange={e => setAdminNotes(n => ({ ...n, [r.id]: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <select value={r.status} onChange={e => updateStatus.mutate({ id: r.id, status: e.target.value })}
                    className="text-xs bg-stone-800 border border-stone-700 rounded-lg px-2 py-1 text-stone-300 focus:outline-none focus:border-amber-500">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => { if (confirm('Delete?')) del.mutate(r.id) }}
                    className="p-1.5 rounded-lg text-stone-600 hover:text-rose-400 hover:bg-rose-950/30 transition-colors self-end">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}