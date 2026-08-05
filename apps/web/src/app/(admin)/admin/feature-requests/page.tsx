'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiFeatureRequest } from '@luxgrimoire/shared-types'
import {
  adminGetFeatureRequests,
  adminReviewFeatureRequest,
  adminDeleteFeatureRequest,
} from '@/lib/api'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { useAuth } from '@/components/AuthProvider'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-900/40 text-amber-400',
  accepted: 'bg-green-900/40 text-green-400',
  rejected: 'bg-red-900/40 text-red-400',
  implemented: 'bg-purple-900/40 text-purple-400',
}

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-brand-400 text-sm'

function ReviewPanel({ req, onDone }: { req: ApiFeatureRequest; onDone: () => void }) {
  const [adminNote, setAdminNote] = useState(req.adminNote ?? '')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: (status: 'accepted' | 'rejected' | 'implemented') =>
      adminReviewFeatureRequest(req.id, { status, adminNote: adminNote || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'feature-requests'] }); onDone() },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  return (
    <div className="mt-3 border-t border-stone-700 pt-3 space-y-3">
      <div>
        <label className="block text-xs text-stone-400 mb-1">Admin note (optional)</label>
        <textarea rows={2} className={INP} value={adminNote}
          onChange={e => setAdminNote(e.target.value)}
          placeholder="Add context, link to roadmap, explain rejection…" />
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => mutation.mutate('accepted')}
          disabled={mutation.isPending}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-700 text-green-100 hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          ✅ Accept
        </button>
        <button
          onClick={() => mutation.mutate('implemented')}
          disabled={mutation.isPending}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-700 text-purple-100 hover:bg-purple-600 disabled:opacity-50 transition-colors"
        >
          🎉 Mark Implemented
        </button>
        <button
          onClick={() => mutation.mutate('rejected')}
          disabled={mutation.isPending}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-800 text-red-200 hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          ✗ Reject
        </button>
        <button onClick={onDone}
          className="px-3 py-1.5 rounded-lg text-xs text-stone-400 hover:text-stone-200 border border-stone-700 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

function RequestCard({ req, onDelete }: { req: ApiFeatureRequest; onDelete: () => void }) {
  const [reviewing, setReviewing] = useState(false)

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 space-y-2">
      <div className="flex items-start gap-3">
        {/* Vote count */}
        <div className="flex flex-col items-center min-w-[44px] pt-0.5">
          <svg className="w-3.5 h-3.5 text-stone-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
          <span className="text-lg font-bold text-stone-300 leading-tight">{req.voteCount}</span>
          <span className="text-[10px] text-stone-600">votes</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[req.status] ?? STATUS_BADGE.pending}`}>
              {req.status}
            </span>
            <span className="text-stone-100 font-medium">{req.title}</span>
          </div>
          <p className="text-stone-400 text-sm leading-relaxed whitespace-pre-line">{req.description}</p>
          {req.adminNote && (
            <div className="mt-2 text-xs text-amber-400/80 bg-amber-900/10 border border-amber-900/20 rounded-lg px-3 py-2">
              <span className="font-semibold">Note:</span> {req.adminNote}
            </div>
          )}
          <div className="mt-1.5 text-xs text-stone-600">
            by {req.user?.username ?? req.user?.email ?? 'anonymous'} · {new Date(req.createdAt).toLocaleString()}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 shrink-0">
          {(req.status === 'pending' || req.status === 'accepted') && !reviewing && (
            <button onClick={() => setReviewing(true)}
              className="px-2.5 py-1 rounded-lg text-xs bg-stone-700 text-stone-200 hover:bg-stone-600 transition-colors">
              {req.status === 'pending' ? 'Review' : 'Edit'}
            </button>
          )}
          {(req.status === 'rejected' || req.status === 'implemented') && (
            <button onClick={() => setReviewing(true)}
              className="px-2.5 py-1 rounded-lg text-xs bg-stone-700 text-stone-400 hover:bg-stone-600 transition-colors">
              Edit
            </button>
          )}
          <button onClick={onDelete}
            className="px-2.5 py-1 rounded-lg text-xs bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors">
            Delete
          </button>
        </div>
      </div>

      {reviewing && (
        <ReviewPanel req={req} onDone={() => setReviewing(false)} />
      )}
    </div>
  )
}

export default function AdminFeatureRequestsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [deleteItem, setDeleteItem] = useState<ApiFeatureRequest | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'feature-requests', statusFilter],
    queryFn: () => adminGetFeatureRequests({ status: statusFilter || undefined, pageSize: 100 } as any),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminDeleteFeatureRequest(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'feature-requests'] }); setDeleteItem(null) },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  if (user && user.role !== 'ADMIN') {
    router.replace('/admin')
    return null
  }

  const items: ApiFeatureRequest[] = data?.data ?? []
  const pending = items.filter(r => r.status === 'pending')
  const rest = items.filter(r => r.status !== 'pending')

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-stone-100">Feature Requests</h1>
          <p className="text-stone-500 text-sm mt-0.5">Review community suggestions and manage the public voting list</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {['', 'pending', 'accepted', 'implemented', 'rejected'].map(s => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-brand-400 text-stone-950' : 'bg-stone-800 text-stone-400 hover:bg-stone-700'}`}
            >
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-16 text-center">Loading…</div>
      ) : (
        <div className="space-y-6">
          {/* Pending queue */}
          {(!statusFilter || statusFilter === 'pending') && pending.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-brand-500 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 text-[10px] font-bold">{pending.length}</span>
                Pending Review
              </h2>
              <div className="space-y-2">
                {pending.map(req => (
                  <RequestCard key={req.id} req={req} onDelete={() => setDeleteItem(req)} />
                ))}
              </div>
            </section>
          )}

          {/* Accepted / rejected */}
          {(!statusFilter || statusFilter !== 'pending') && rest.length > 0 && (
            <section>
              {!statusFilter && (
                <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Reviewed</h2>
              )}
              <div className="space-y-2">
                {rest.map(req => (
                  <RequestCard key={req.id} req={req} onDelete={() => setDeleteItem(req)} />
                ))}
              </div>
            </section>
          )}

          {items.length === 0 && (
            <div className="text-center py-16 text-stone-500">No feature requests yet</div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteItem !== null}
        message={`Delete "${deleteItem?.title}"? This cannot be undone.`}
        onConfirm={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
        onCancel={() => setDeleteItem(null)}
      />
    </div>
  )
}
