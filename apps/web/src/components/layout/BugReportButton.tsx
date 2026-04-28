'use client'

import { useState } from 'react'
import { Bug, X, ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'

const CATEGORIES = [
  { value: 'ui', label: '🖥️ UI / Visual bug' },
  { value: 'data', label: '📊 Wrong data' },
  { value: 'error', label: '💥 Error / crash' },
  { value: 'feature', label: '💡 Feature request' },
  { value: 'other', label: '🔧 Other' },
]

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

export function BugReportButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('ui')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setTitle('')
    setDescription('')
    setCategory('ui')
    setDone(false)
    setError(null)
  }

  const handleClose = () => {
    setOpen(false)
    setTimeout(reset, 300)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
      const res = await fetch(`${API_BASE}/bug-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          pageUrl: typeof window !== 'undefined' ? window.location.href : pathname,
        }),
      })
      if (!res.ok) {
        let msg = 'Failed to submit'
        try {
          const body = await res.json()
          msg = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? msg)
        } catch { /* ignore */ }
        throw new Error(msg)
      }
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit. Please try again.')
    }finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-2xl text-xs font-medium transition-all hover:scale-105 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)',
          border: '1px solid rgba(245,158,11,0.3)',
          color: '#d97706',
        }}
        title="Report a bug"
      >
        <Bug size={14} />
        <span className="hidden sm:inline">Report a bug</span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl border border-stone-700"
            style={{ background: 'var(--surface-2, #1c1917)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <Bug size={16} className="text-amber-500" />
                <h2 className="font-serif font-semibold text-stone-100 text-base">Report a Bug</h2>
              </div>
              <button onClick={handleClose} className="p-1 rounded text-stone-500 hover:text-stone-200 transition-colors">
                <X size={16} />
              </button>
            </div>

            {done ? (
              /* Success state */
              <div className="px-5 py-10 flex flex-col items-center gap-3 text-center">
                <div className="text-4xl">🐛✅</div>
                <p className="font-serif text-stone-100 text-lg">Thank you!</p>
                <p className="text-sm text-stone-400">Your report has been submitted. We'll look into it.</p>
                <button
                  onClick={handleClose}
                  className="mt-4 px-6 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 text-sm font-medium hover:bg-amber-500/20 transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              /* Form */
              <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
                {/* Category */}
                <div>
                  <label className="block text-xs text-stone-400 font-medium mb-1.5">Category</label>
                  <div className="relative">
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className="w-full appearance-none bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500 transition-colors pr-8"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" />
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs text-stone-400 font-medium mb-1.5">Short description</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Collection page crashes on filter"
                    maxLength={120}
                    required
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs text-stone-400 font-medium mb-1.5">Details</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="What happened? What did you expect? Steps to reproduce…"
                    rows={4}
                    required
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                  />
                </div>

                {/* Page URL (readonly) */}
                <p className="text-xs text-stone-600">
                  Page: <span className="text-stone-500">{pathname}</span>
                </p>

                {error && <p className="text-xs text-rose-400">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 py-2 rounded-xl border border-stone-700 text-stone-400 text-sm hover:bg-stone-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !title.trim() || !description.trim()}
                    className="flex-1 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 text-sm font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Sending…' : 'Send Report'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
