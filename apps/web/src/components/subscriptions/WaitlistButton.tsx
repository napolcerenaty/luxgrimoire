'use client'

import { useState, useEffect } from 'react'
import { Clock, X, Loader2, Pencil, Check } from 'lucide-react'
import { joinWaitlist, leaveWaitlist, updateWaitlistDate, getMyWaitlistStatus, getMySubscriptionEntry } from '@/lib/api'

interface WaitlistButtonProps {
  subscriptionSlug: string
}

type WaitlistState =
  | 'loading'
  | 'no-auth'
  | null
  | { joinedAt: string; leftAt: string | null }

export default function WaitlistButton({ subscriptionSlug }: WaitlistButtonProps) {
  const [status, setStatus] = useState<WaitlistState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingDate, setEditingDate] = useState(false)
  const [dateInput, setDateInput] = useState('')
  const [showDateForm, setShowDateForm] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('luxgrimoire_token')
    if (!token) { setStatus('no-auth'); return }
    // Hide for active subscribers
    getMySubscriptionEntry(subscriptionSlug)
      .then((entry) => {
        if (entry?.active) { setStatus('no-auth'); return }
        return getMyWaitlistStatus(subscriptionSlug).then(data => setStatus(data ?? null))
      })
      .catch(() => setStatus(null))
  }, [subscriptionSlug])

  if (status === 'loading' || status === 'no-auth') return null

  const isOnList = status !== null && !status.leftAt
  const wasOnList = status !== null && !!status.leftAt

  const handleJoin = async (joinedAt?: string) => {
    setBusy(true); setError(null)
    try {
      await joinWaitlist(subscriptionSlug, joinedAt)
      setStatus({ joinedAt: joinedAt ?? new Date().toISOString(), leftAt: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally { setBusy(false) }
  }

  const handleLeave = async () => {
    setBusy(true); setError(null)
    try {
      await leaveWaitlist(subscriptionSlug)
      setStatus(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally { setBusy(false) }
  }

  const handleSaveDate = async () => {
    if (!dateInput) return
    setBusy(true); setError(null)
    try {
      await updateWaitlistDate(subscriptionSlug, new Date(dateInput).toISOString())
      setStatus(prev => prev && typeof prev === 'object'
        ? { ...prev, joinedAt: new Date(dateInput).toISOString() }
        : prev)
      setEditingDate(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally { setBusy(false) }
  }

  // ── Was on waitlist (leftAt set) ─────────────────────────────────────────
  if (wasOnList) {
    const joinDate = new Date(status.joinedAt)
    const leftDate = new Date(status.leftAt!)
    const waitDays = Math.floor((leftDate.getTime() - joinDate.getTime()) / 86400000)
    return (
      <div className="flex items-center gap-2 text-sm text-stone-400 mt-2">
        <Clock className="w-4 h-4 text-stone-500 shrink-0" />
        <span>
          Waited{' '}
          <span className="text-stone-300 font-semibold">{waitDays} day{waitDays !== 1 ? 's' : ''}</span>{' '}
          on the waitlist before subscribing
        </span>
      </div>
    )
  }

  // ── Currently on waitlist ────────────────────────────────────────────────
  if (isOnList) {
    const joinDate = new Date(status.joinedAt)
    const daysOnList = Math.floor((Date.now() - joinDate.getTime()) / 86400000)
    return (
      <div className="mt-2">
        <div className="bg-stone-800/60 border border-stone-700/60 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-stone-400 shrink-0" />
              <p className="text-sm text-stone-200 font-medium">On the waitlist</p>
            </div>
            <button
              onClick={handleLeave}
              disabled={busy}
              className="flex items-center gap-1 text-xs text-stone-500 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Remove
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-400 pl-6">
            {editingDate ? (
              <>
                <input
                  type="date"
                  value={dateInput}
                  onChange={e => setDateInput(e.target.value)}
                  className="bg-stone-700 border border-stone-600 rounded px-2 py-0.5 text-stone-100 focus:outline-none focus:border-amber-400 text-xs w-full"
                />
                <button onClick={handleSaveDate} disabled={busy || !dateInput}
                  className="text-green-400 hover:text-green-300 disabled:opacity-40 shrink-0">
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                </button>
                <button onClick={() => setEditingDate(false)} className="text-stone-500 hover:text-stone-300 shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                <span>{joinDate.toLocaleDateString('en-GB')} · {daysOnList}d</span>
                <span className="flex-1" />
                <button
                  onClick={() => { setDateInput(joinDate.toISOString().slice(0, 10)); setEditingDate(true) }}
                  className="flex items-center gap-1 text-stone-600 hover:text-stone-400 transition-colors"
                  title="Edit date"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    )
  }

  // ── Not on waitlist ──────────────────────────────────────────────────────
  // Show "record join date" form — this is a tracker, not actual subscription

  return (
    <div className="mt-4">
      {showDateForm ? (
        <div className="flex items-center gap-2 bg-stone-800/60 border border-stone-700/60 rounded-xl px-4 py-3">
          <Clock className="w-4 h-4 text-stone-400 shrink-0" />
          <span className="text-xs text-stone-400">Joined waitlist on:</span>
          <input
            type="date"
            value={dateInput}
            onChange={e => setDateInput(e.target.value)}
            className="flex-1 bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 focus:outline-none focus:border-amber-400 text-xs"
          />
          <button onClick={() => handleJoin(dateInput || undefined)} disabled={busy}
            className="text-xs px-3 py-1 rounded-lg bg-stone-700 text-stone-200 hover:bg-stone-600 transition-colors disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'Save'}
          </button>
          <button onClick={() => setShowDateForm(false)} className="text-stone-500 hover:text-stone-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setDateInput(new Date().toISOString().slice(0, 10)); setShowDateForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-800/60 border border-stone-700/60 hover:border-stone-600 hover:bg-stone-800 text-sm text-stone-400 hover:text-stone-300 transition-all"
        >
          <Clock className="w-4 h-4" />
          I&apos;m on the waitlist
        </button>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}
