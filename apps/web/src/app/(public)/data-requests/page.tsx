'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { Database, CheckCircle, Clock, XCircle, RefreshCw, ExternalLink, ChevronDown, Send } from 'lucide-react'

const DATA_TYPES = [
  { value: 'EDITION', label: '📖 Edition / Book box variant' },
  { value: 'SUBSCRIPTION', label: '📦 Subscription box' },
  { value: 'BOOK', label: '📚 Book / Series' },
  { value: 'OTHER', label: '✏️ Other' },
]

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-brand-400 bg-brand-500/10 border-brand-500/30',
  in_progress: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  added: 'text-green-400 bg-green-500/10 border-green-500/30',
  declined: 'text-navy-500 bg-navy-700/30 border-navy-600/30',
}
const STATUS_ICON: Record<string, React.ElementType> = {
  pending: Clock, in_progress: RefreshCw, added: CheckCircle, declined: XCircle,
}

const INP = 'w-full bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 focus:outline-none focus:border-brand-400 text-sm'
const LBL = 'block text-sm text-navy-400 mb-1'

interface MyRequest {
  id: string; type: string; name: string; description: string | null
  referenceUrl: string | null; status: string; adminNote: string | null; createdAt: string
}

export default function DataRequestsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [type, setType] = useState('EDITION')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const myRequests = useQuery<MyRequest[]>({
    queryKey: ['my-data-requests'],
    queryFn: () => authFetch('/data-requests/mine'),
    enabled: !!user,
  })

  const submit = useMutation({
    mutationFn: () => authFetch('/data-requests', {
      method: 'POST',
      body: JSON.stringify({
        type, name,
        description: description || undefined,
        referenceUrl: referenceUrl || undefined,
      }),
    }),
    onSuccess: () => {
      setSubmitted(true)
      setName(''); setDescription(''); setReferenceUrl('')
      qc.invalidateQueries({ queryKey: ['my-data-requests'] })
      setTimeout(() => setSubmitted(false), 3000)
    },
  })

  const [requestOpen, setRequestOpen] = useState(false)

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-navy-100 flex items-center gap-3">
          <Database size={28} className="text-brand-400" /> Add Missing Data
        </h1>
        <p className="text-navy-400 text-sm mt-2">
          Can't find a book edition, subscription box, or series? Send us a request and we'll add it.
        </p>
      </div>

      {/* ── Request form ── */}
      <div className="bg-navy-900 border border-navy-800 rounded-2xl overflow-hidden">
        <button
          onClick={() => setRequestOpen(o => !o)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-navy-800/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Send size={20} className="text-navy-400" />
            <div className="text-left">
              <p className="text-sm font-semibold text-navy-100">Send a Data Request</p>
              <p className="text-xs text-navy-500">Can't add it yourself? Let us know what's missing.</p>
            </div>
          </div>
          <ChevronDown size={16} className={`text-navy-500 transition-transform ${requestOpen ? 'rotate-180' : ''}`} />
        </button>

        {requestOpen && (
          <div className="border-t border-navy-800 p-6">
            {submitted ? (
              <div className="bg-green-950/30 border border-green-700/40 rounded-2xl p-6 text-center">
                <CheckCircle size={36} className="text-green-400 mx-auto mb-3" />
                <p className="text-green-400 font-semibold text-lg">Request submitted!</p>
                <p className="text-navy-400 text-sm mt-1">We'll review it and add it to the database.</p>
              </div>
            ) : (
              <form onSubmit={e => { e.preventDefault(); submit.mutate() }} className="space-y-4">
                <div>
                  <label className={LBL}>Type *</label>
                  <select required className={INP} value={type} onChange={e => setType(e.target.value)}>
                    {DATA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LBL}>Name *</label>
                  <input required minLength={2} maxLength={200} className={INP} value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. FairyLoot December 2024, The Poppy War by R.F. Kuang…" />
                </div>
                <div>
                  <label className={LBL}>Description (optional)</label>
                  <textarea rows={3} maxLength={1000} className={INP} value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Any additional details that would help us find or add it…" />
                </div>
                <div>
                  <label className={LBL}>Reference URL (optional)</label>
                  <input type="url" className={INP} value={referenceUrl}
                    onChange={e => setReferenceUrl(e.target.value)}
                    placeholder="https://fairyloot.com/… or Goodreads link, etc." />
                </div>
                {submit.isError && <p className="text-red-400 text-sm">{(submit.error as Error).message}</p>}
                <button type="submit" disabled={submit.isPending}
                  className="w-full bg-brand-500 hover:bg-brand-400 text-navy-950 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50">
                  {submit.isPending ? 'Submitting…' : 'Submit Request'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {user && (
        <div>
          <h2 className="text-lg font-serif font-semibold text-navy-200 mb-3">My Requests</h2>
          {myRequests.isLoading ? (
            <p className="text-navy-500 text-sm">Loading…</p>
          ) : myRequests.data?.length === 0 ? (
            <p className="text-navy-600 text-sm">No requests yet.</p>
          ) : (
            <div className="space-y-3">
              {myRequests.data?.map(r => {
                const Icon = STATUS_ICON[r.status] ?? Clock
                return (
                  <div key={r.id} className="bg-navy-900 border border-navy-800 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[r.status] ?? STATUS_STYLES.pending}`}>
                            <Icon size={10} className="inline mr-1" />{r.status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <span className="text-xs text-navy-600 bg-navy-800 px-2 py-0.5 rounded-full">{r.type}</span>
                        </div>
                        <p className="text-navy-200 text-sm font-medium">{r.name}</p>
                        {r.referenceUrl && (
                          <a href={r.referenceUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
                            <ExternalLink size={10} /> {r.referenceUrl}
                          </a>
                        )}
                        {r.adminNote && <p className="text-xs text-navy-500 mt-1 italic">{r.adminNote}</p>}
                      </div>
                      <span className="text-xs text-navy-600 shrink-0">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}