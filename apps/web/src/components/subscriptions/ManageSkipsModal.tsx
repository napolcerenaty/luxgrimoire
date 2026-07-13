'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { X, BookOpen } from 'lucide-react'

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface ManagedMonth {
  year: number
  month: number
  isSkipped: boolean
  renewalDate: string
  books: { title: string | null; author: string | null }[]
}

interface ManagedMonthsResponse {
  entryId: string
  months: ManagedMonth[]
}

type Step = 'months' | 'confirm-books'

interface Props {
  subscriptionSlug: string
  subscriptionName: string
  onClose: () => void
  onSaved: () => void
}

export function ManageSkipsModal({ subscriptionSlug, subscriptionName, onClose, onSaved }: Props) {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<ManagedMonthsResponse>({
    queryKey: ['managed-months', subscriptionSlug],
    queryFn: () => authFetch(`/subscriptions/${subscriptionSlug}/managed-months`),
  })

  // Local selection state: set of "year-month" keys that are currently marked as skipped
  const [skippedKeys, setSkippedKeys] = useState<Set<string> | null>(null)
  const [step, setStep] = useState<Step>('months')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Initialise skippedKeys from server data once loaded
  const effectiveSkipped = useMemo(() => {
    if (skippedKeys !== null) return skippedKeys
    if (!data) return new Set<string>()
    return new Set<string>(data.months.filter(m => m.isSkipped).map(m => `${m.year}-${m.month}`))
  }, [skippedKeys, data])

  function toggle(year: number, month: number) {
    const key = `${year}-${month}`
    const next = new Set(effectiveSkipped)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSkippedKeys(next)
  }

  // Compute diff vs original
  const { toSkip, toUnskip, hasChanges } = useMemo(() => {
    if (!data) return { toSkip: [], toUnskip: [], hasChanges: false }
    const originalSkipped = new Set<string>(data.months.filter(m => m.isSkipped).map(m => `${m.year}-${m.month}`))
    const toSkip: { year: number; month: number }[] = []
    const toUnskip: { year: number; month: number }[] = []
    for (const m of data.months) {
      const key = `${m.year}-${m.month}`
      const wasSkipped = originalSkipped.has(key)
      const nowSkipped = effectiveSkipped.has(key)
      if (!wasSkipped && nowSkipped) toSkip.push({ year: m.year, month: m.month })
      if (wasSkipped && !nowSkipped) toUnskip.push({ year: m.year, month: m.month })
    }
    return { toSkip, toUnskip, hasChanges: toSkip.length > 0 || toUnskip.length > 0 }
  }, [data, effectiveSkipped])

  async function save(addBooksForUnskipped: boolean, removeBooksForSkipped: boolean) {
    if (!data) return
    setSaving(true)
    setSaveError(null)
    try {
      await authFetch(`/subscriptions/${subscriptionSlug}/manage-skips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toSkip, toUnskip, addBooksForUnskipped, removeBooksForSkipped }),
      })
      void queryClient.invalidateQueries({ queryKey: ['skip-status', subscriptionSlug] })
      void queryClient.invalidateQueries({ queryKey: ['managed-months', subscriptionSlug] })
      void queryClient.invalidateQueries({ queryKey: ['my-calendar-subscriptions'] })
      void queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] })
      void queryClient.invalidateQueries({ queryKey: ['collection'] })
      onSaved()
    } catch (e) {
      setSaveError((e as Error).message ?? 'Something went wrong')
      setSaving(false)
      setStep('months')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-700 shrink-0">
          <div>
            <p className="font-serif font-semibold text-stone-100">Manage Skips</p>
            <p className="text-xs text-stone-400 mt-0.5">{subscriptionName}</p>
          </div>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {step === 'months' && (
          <>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {isLoading && (
                <p className="text-stone-400 text-sm text-center py-8">Loading months…</p>
              )}
              {error && (
                <p className="text-red-400 text-sm text-center py-8">Failed to load months</p>
              )}
              {data && data.months.length === 0 && (
                <p className="text-stone-400 text-sm text-center py-8">No processed months yet</p>
              )}
              {data && data.months.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-stone-500 mb-1">
                    Click a month to toggle skip. <span className="text-amber-400">Highlighted</span> = skipped.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {data.months.map(m => {
                      const key = `${m.year}-${m.month}`
                      const isSkipped = effectiveSkipped.has(key)
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggle(m.year, m.month)}
                          className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left text-xs transition-all min-w-[90px] ${
                            isSkipped
                              ? 'border-amber-600 bg-amber-950/50 text-amber-300'
                              : 'border-stone-700 bg-stone-800/60 text-stone-300 hover:border-stone-500'
                          }`}
                        >
                          <span className="font-semibold text-sm">{MONTH_NAMES[m.month]} {m.year}</span>
                          {m.books.length > 0 ? (
                            m.books.map((b, i) => (
                              <span key={i} className="text-[10px] text-stone-500 mt-0.5 leading-tight line-clamp-2">
                                {b.title ?? '—'}
                                {b.author ? <span className="text-stone-600"> · {b.author}</span> : null}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-stone-600 mt-0.5 flex items-center gap-1">
                              <BookOpen size={10} /> No book
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {saveError && (
                <p className="text-red-400 text-xs mt-3">{saveError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 py-4 border-t border-stone-700 flex items-center justify-between gap-3">
              <div className="text-xs text-stone-500">
                {hasChanges ? (
                  <span>
                    {toSkip.length > 0 && <span className="text-amber-400">{toSkip.length} to skip</span>}
                    {toSkip.length > 0 && toUnskip.length > 0 && <span className="mx-1">·</span>}
                    {toUnskip.length > 0 && <span className="text-emerald-400">{toUnskip.length} to unskip</span>}
                  </span>
                ) : (
                  <span>No changes</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded text-sm text-stone-400 hover:text-stone-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!hasChanges}
                  onClick={() => setStep('confirm-books')}
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-stone-950 font-semibold px-4 py-1.5 rounded text-sm transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'confirm-books' && (
          <div className="px-5 py-6 flex flex-col gap-5">
            <p className="text-stone-100 font-semibold text-sm">Update collection?</p>
            <p className="text-stone-400 text-sm leading-relaxed">
              You made skip changes. Would you like to update your book collection accordingly?
            </p>
            <div className="flex flex-col gap-3">
              {toUnskip.length > 0 && (
                <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-4 py-3 flex flex-col gap-1">
                  <p className="text-emerald-300 text-xs font-semibold uppercase tracking-wide">
                    {toUnskip.length} month{toUnskip.length !== 1 ? 's' : ''} unskipped
                  </p>
                  <p className="text-stone-400 text-xs">Add books to your collection (OWNED for past renewals, PREORDER for future)?</p>
                </div>
              )}
              {toSkip.length > 0 && (
                <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3 flex flex-col gap-1">
                  <p className="text-amber-300 text-xs font-semibold uppercase tracking-wide">
                    {toSkip.length} month{toSkip.length !== 1 ? 's' : ''} skipped
                  </p>
                  <p className="text-stone-400 text-xs">Remove subscription-sourced books from your collection?</p>
                </div>
              )}
            </div>

            {saveError && <p className="text-red-400 text-xs">{saveError}</p>}

            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => save(false, false)}
                className="px-3 py-2 rounded-lg border border-stone-600 text-stone-300 hover:text-stone-100 hover:border-stone-400 text-sm transition-colors disabled:opacity-40"
              >
                Skip changes only
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => save(toUnskip.length > 0, toSkip.length > 0)}
                className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-stone-950 font-semibold px-3 py-2 rounded-lg text-sm transition-colors"
              >
                {saving ? 'Saving…' : 'Save + Update collection'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setStep('months')}
              disabled={saving}
              className="text-xs text-stone-500 hover:text-stone-300 transition-colors text-center"
            >
              ← Back to months
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
