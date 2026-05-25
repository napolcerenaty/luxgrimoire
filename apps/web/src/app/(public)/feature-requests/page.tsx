'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiFeatureRequest } from '@luxgrimoire/shared-types'
import {
  getFeatureRequests,
  getMyFeatureRequests,
  submitFeatureRequest,
  voteFeatureRequest,
} from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-stone-700 text-stone-400',
  accepted: 'bg-green-900/40 text-green-400',
  rejected: 'bg-red-900/40 text-red-400',
  implemented: 'bg-purple-900/40 text-purple-400',
}

function VoteButton({ req, onVote }: { req: ApiFeatureRequest; onVote: () => void }) {
  return (
    <button
      onClick={onVote}
      className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-all min-w-[52px]
        ${req.userHasVoted
          ? 'border-amber-500 bg-amber-500/10 text-amber-400'
          : 'border-stone-700 bg-stone-800/60 text-stone-400 hover:border-amber-500/60 hover:text-amber-400'
        }`}
    >
      <svg className="w-4 h-4" fill={req.userHasVoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
      <span className="text-sm font-bold">{req.voteCount}</span>
    </button>
  )
}

function SubmitModal({ onClose, onSubmit, submitting }: {
  onClose: () => void
  onSubmit: (d: { title: string; description: string }) => void
  submitting: boolean
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-stone-100">💡 Suggest a Feature</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 text-xl leading-none">×</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSubmit({ title, description }) }} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-stone-400 mb-1">Feature title *</label>
            <input
              required minLength={5} maxLength={120}
              className={INP}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Short, descriptive title…"
            />
          </div>
          <div>
            <label className="block text-sm text-stone-400 mb-1">Description *</label>
            <textarea
              required minLength={20} maxLength={2000} rows={4}
              className={INP}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the feature in detail. What problem does it solve? How should it work?"
            />
          </div>
          <p className="text-xs text-stone-500">
            Submissions are reviewed before appearing in the public list. You'll be notified of the outcome.
          </p>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-stone-400 hover:text-stone-200 border border-stone-700 hover:border-stone-500 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-400 text-stone-950 hover:bg-amber-300 disabled:opacity-50 transition-colors">
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function FeatureRequestsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showSubmit, setShowSubmit] = useState(false)
  const [showMine, setShowMine] = useState(false)
  const [showImplemented, setShowImplemented] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const { data: publicData, isLoading } = useQuery({
    queryKey: ['feature-requests', 'public'],
    queryFn: () => getFeatureRequests({ pageSize: 50 }),
  })

  const { data: implementedData, isLoading: implementedLoading } = useQuery({
    queryKey: ['feature-requests', 'implemented'],
    queryFn: () => getFeatureRequests({ pageSize: 100, status: 'implemented' }),
    enabled: showImplemented,
  })

  const { data: myRequests = [] } = useQuery({
    queryKey: ['feature-requests', 'my'],
    queryFn: getMyFeatureRequests,
    enabled: !!user && showMine,
  })

  const submitMutation = useMutation({
    mutationFn: submitFeatureRequest,
    onSuccess: () => {
      setShowSubmit(false)
      setSuccessMsg('✅ Your request has been submitted and will be reviewed soon!')
      setTimeout(() => setSuccessMsg(''), 5000)
      qc.invalidateQueries({ queryKey: ['feature-requests', 'my'] })
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const voteMutation = useMutation({
    mutationFn: voteFeatureRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-requests', 'public'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const requests: ApiFeatureRequest[] = publicData?.data ?? []
  const implemented: ApiFeatureRequest[] = implementedData?.data ?? []

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stone-100 mb-2">Feature Requests</h1>
          <p className="text-stone-400 text-sm">
            Have an idea? Submit a feature request. Vote on suggestions you'd love to see!
          </p>
        </div>
        <button
          onClick={() => setShowSubmit(true)}
          className="shrink-0 bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-xl hover:bg-amber-300 transition-colors text-sm"
        >
          + Suggest Feature
        </button>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="mb-4 bg-green-900/30 border border-green-700/40 text-green-400 rounded-xl px-4 py-3 text-sm">
          {successMsg}
        </div>
      )}

      {/* My submissions toggle */}
      {user && (
        <button
          onClick={() => setShowMine(v => !v)}
          className="text-sm text-amber-400 hover:text-amber-300 mb-6 transition-colors"
        >
          {showMine ? '▼' : '▶'} My submissions
        </button>
      )}

      {showMine && myRequests.length > 0 && (
        <div className="mb-6 space-y-2">
          {myRequests.map(req => (
            <div key={req.id} className="flex items-center gap-3 bg-stone-800/60 border border-stone-700 rounded-xl px-4 py-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[req.status] ?? STATUS_BADGE.pending}`}>
                {req.status}
              </span>
              <span className="text-stone-200 text-sm flex-1">{req.title}</span>
              {req.adminNote && (
                <span className="text-stone-500 text-xs italic truncate max-w-xs">Admin: {req.adminNote}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Public ranking */}
      {isLoading ? (
        <div className="text-stone-500 py-16 text-center">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 text-stone-500">
          <div className="text-5xl mb-4">💡</div>
          <div className="text-lg font-medium text-stone-400 mb-2">No accepted features yet</div>
          <div className="text-sm">Be the first to suggest one!</div>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req, i) => (
            <div key={req.id} className="flex gap-4 bg-stone-900 border border-stone-800 rounded-2xl p-4 hover:border-stone-700 transition-colors">
              {/* Rank */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-stone-600 font-mono w-6 text-center">#{i + 1}</span>
                {user ? (
                  <VoteButton req={req} onVote={() => voteMutation.mutate(req.id)} />
                ) : (
                  <div className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border border-stone-700 bg-stone-800/60 min-w-[52px]">
                    <svg className="w-4 h-4 text-stone-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                    <span className="text-sm font-bold text-stone-400">{req.voteCount}</span>
                  </div>
                )}
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-stone-100 font-semibold mb-1">{req.title}</div>
                <div className="text-stone-400 text-sm leading-relaxed whitespace-pre-line line-clamp-3">{req.description}</div>
                {req.adminNote && (
                  <div className="mt-2 text-xs text-amber-400/80 bg-amber-900/10 border border-amber-900/20 rounded-lg px-3 py-2">
                    <span className="font-semibold">Admin note:</span> {req.adminNote}
                  </div>
                )}
                <div className="mt-2 text-xs text-stone-600">
                  {req.user?.username && <span>by {req.user.username} · </span>}
                  {new Date(req.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!user && requests.length > 0 && (
        <p className="text-center text-stone-600 text-sm mt-8">
          <a href="/login" className="text-amber-400 hover:text-amber-300">Log in</a> to vote and submit feature requests
        </p>
      )}

      {/* Implemented section */}
      <div className="mt-12 border-t border-stone-800 pt-8">
        <button
          onClick={() => setShowImplemented(v => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-purple-400 hover:text-purple-300 transition-colors"
        >
          <span className="text-base">{showImplemented ? '▼' : '▶'}</span>
          <span>🎉 Implemented</span>
          {implementedData && (
            <span className="ml-1 text-xs bg-purple-900/40 text-purple-400 px-2 py-0.5 rounded-full">
              {implementedData.total}
            </span>
          )}
        </button>

        {showImplemented && (
          <div className="mt-4">
            {implementedLoading ? (
              <div className="text-stone-500 py-8 text-center text-sm">Loading…</div>
            ) : implemented.length === 0 ? (
              <div className="text-stone-600 text-sm py-6 text-center">No implemented features yet.</div>
            ) : (
              <div className="space-y-2">
                {implemented.map(req => (
                  <div key={req.id} className="flex gap-4 bg-stone-900 border border-purple-900/30 rounded-2xl p-4">
                    <div className="flex flex-col items-center justify-center min-w-[52px]">
                      <span className="text-2xl">✅</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-stone-100 font-semibold mb-1">{req.title}</div>
                      <div className="text-stone-400 text-sm leading-relaxed whitespace-pre-line line-clamp-2">{req.description}</div>
                      {req.adminNote && (
                        <div className="mt-2 text-xs text-purple-400/80 bg-purple-900/10 border border-purple-900/20 rounded-lg px-3 py-2">
                          <span className="font-semibold">Note:</span> {req.adminNote}
                        </div>
                      )}
                      <div className="mt-2 text-xs text-stone-600">
                        {req.voteCount} votes
                        {req.user?.username && <span> · by {req.user.username}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showSubmit && (
        <SubmitModal
          onClose={() => setShowSubmit(false)}
          onSubmit={data => submitMutation.mutate(data)}
          submitting={submitMutation.isPending}
        />
      )}
    </div>
  )
}
