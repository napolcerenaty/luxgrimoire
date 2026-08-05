'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { Megaphone, CheckCircle, Clock, XCircle, ExternalLink } from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-brand-400 bg-brand-500/10 border-brand-500/30',
  processed: 'text-green-400 bg-green-500/10 border-green-500/30',
  declined: 'text-stone-500 bg-stone-700/30 border-stone-600/30',
}
const STATUS_ICON: Record<string, React.ElementType> = {
  pending: Clock, processed: CheckCircle, declined: XCircle,
}

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-brand-400 text-sm'
const LBL = 'block text-sm text-stone-400 mb-1'

interface MyRequest {
  id: string; url: string; notes: string | null; status: string; adminNote: string | null; createdAt: string
}

export default function SaleAnnouncementRequestsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const myRequests = useQuery<MyRequest[]>({
    queryKey: ['my-sale-announcement-requests'],
    queryFn: () => authFetch('/sale-announcement-requests/mine'),
    enabled: !!user,
  })

  const submit = useMutation({
    mutationFn: () => authFetch('/sale-announcement-requests', {
      method: 'POST',
      body: JSON.stringify({ url, notes: notes || undefined }),
    }),
    onSuccess: () => {
      setSubmitted(true)
      setUrl(''); setNotes('')
      qc.invalidateQueries({ queryKey: ['my-sale-announcement-requests'] })
      setTimeout(() => setSubmitted(false), 3000)
    },
  })

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-stone-100 flex items-center gap-3">
          <Megaphone size={28} className="text-brand-400" /> Report a Sale
        </h1>
        <p className="text-stone-400 text-sm mt-2">
          Spotted a sale from a book box company not listed here? Submit the link and we'll add it.
        </p>
      </div>

      {submitted ? (
        <div className="bg-green-950/30 border border-green-700/40 rounded-2xl p-6 text-center">
          <CheckCircle size={36} className="text-green-400 mx-auto mb-3" />
          <p className="text-green-400 font-semibold text-lg">Submitted!</p>
          <p className="text-stone-400 text-sm mt-1">We'll review the link and add it to the sale announcements.</p>
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); submit.mutate() }} className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
          <div>
            <label className={LBL}>Sale page URL *</label>
            <input required type="url" className={INP} value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://fairyloot.com/collections/sale…" />
          </div>
          <div>
            <label className={LBL}>Notes (optional)</label>
            <textarea rows={3} maxLength={500} className={INP} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Company name, what's on sale, dates…" />
          </div>
          {submit.isError && <p className="text-red-400 text-sm">{(submit.error as Error).message}</p>}
          <button type="submit" disabled={submit.isPending}
            className="w-full bg-brand-500 hover:bg-brand-400 text-stone-950 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50">
            {submit.isPending ? 'Submitting…' : 'Submit Sale Link'}
          </button>
        </form>
      )}

      {user && (
        <div>
          <h2 className="text-lg font-serif font-semibold text-stone-200 mb-3">My Submissions</h2>
          {myRequests.isLoading ? (
            <p className="text-stone-500 text-sm">Loading…</p>
          ) : myRequests.data?.length === 0 ? (
            <p className="text-stone-600 text-sm">No submissions yet.</p>
          ) : (
            <div className="space-y-3">
              {myRequests.data?.map(r => {
                const Icon = STATUS_ICON[r.status] ?? Clock
                return (
                  <div key={r.id} className="bg-stone-900 border border-stone-800 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[r.status] ?? STATUS_STYLES.pending}`}>
                            <Icon size={10} className="inline mr-1" />{r.status.toUpperCase()}
                          </span>
                        </div>
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 truncate">
                          <ExternalLink size={12} className="shrink-0" />
                          <span className="truncate">{r.url}</span>
                        </a>
                        {r.notes && <p className="text-xs text-stone-500 mt-1">{r.notes}</p>}
                        {r.adminNote && <p className="text-xs text-stone-400 mt-1 italic">Note: {r.adminNote}</p>}
                      </div>
                      <span className="text-xs text-stone-600 shrink-0">{new Date(r.createdAt).toLocaleDateString()}</span>
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