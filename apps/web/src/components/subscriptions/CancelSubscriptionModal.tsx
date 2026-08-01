'use client'

import { useState } from 'react'
import { cancelMySubscriptionEntry } from '@/lib/api'
import { isValidCalendarDate } from '@/lib/dateValidation'

export function CancelSubscriptionModal({
  subscriptionSlug,
  onCancelled,
  onClose,
}: {
  subscriptionSlug: string
  onCancelled: () => void
  onClose: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [cancellationDate, setCancellationDate] = useState(today)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateInvalid, setDateInvalid] = useState(false)

  function handleDateChange(v: string) {
    setCancellationDate(v)
    if (dateInvalid) { setDateInvalid(false); setError(null) }
  }

  async function handleConfirm() {
    if (!isValidCalendarDate(cancellationDate)) {
      setDateInvalid(true)
      setError('Enter a valid cancellation date')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await cancelMySubscriptionEntry(subscriptionSlug, {
        cancellationDate,
        cancellationReason: reason || undefined,
      })
      onCancelled()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to cancel subscription')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-stone-800">
          <h2 className="text-base font-semibold text-red-400">Cancel subscription</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-stone-400">
            Mark this subscription as cancelled. It will remain in your history.
          </p>

          <div>
            <label className="block text-xs text-stone-400 mb-1">Cancellation date</label>
            <input
              type="date"
              value={cancellationDate}
              onChange={e => handleDateChange(e.target.value)}
              className={`w-full bg-stone-800 border rounded-lg px-3 py-2 text-stone-100 text-sm ${dateInvalid ? 'border-red-500/70' : 'border-stone-700'}`}
            />
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Too expensive, changed box, etc."
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex gap-3 p-5 border-t border-stone-800">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-stone-700 text-stone-400 text-sm hover:border-stone-500 transition-colors">
            Keep subscription
          </button>
          <button type="button" onClick={handleConfirm} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-stone-100 text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Cancelling…' : 'Confirm cancellation'}
          </button>
        </div>
      </div>
    </div>
  )
}
