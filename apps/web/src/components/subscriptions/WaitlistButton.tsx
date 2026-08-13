'use client'

import { useState, useEffect } from 'react'
import { Clock, X, Loader2, Pencil, Check } from 'lucide-react'
import { joinWaitlist, leaveWaitlist, updateWaitlistDate, getMyWaitlistStatus, getMySubscriptionEntry } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import { isValidCalendarDate } from '@/lib/dateValidation'

interface WaitlistButtonProps {
  subscriptionSlug: string
}

type WaitlistState =
  | 'loading'
  | 'no-auth'
  | null
  | { joinedAt: string; leftAt: string | null }

export default function WaitlistButton({ subscriptionSlug }: WaitlistButtonProps) {
  const { user } = useAuth()
  const [status, setStatus] = useState<WaitlistState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingDate, setEditingDate] = useState(false)
  const [dateInput, setDateInput] = useState('')
  const [dateInvalid, setDateInvalid] = useState(false)
  const [showDateForm, setShowDateForm] = useState(false)

  const handleDateInputChange = (v: string) => {
    setDateInput(v)
    if (dateInvalid) { setDateInvalid(false); setError(null) }
  }

  useEffect(() => {
    if (!user) { setStatus('no-auth'); return }
    // Hide for active subscribers
    getMySubscriptionEntry(subscriptionSlug)
      .then((entry) => {
        if (entry?.active) { setStatus('no-auth'); return }
        return getMyWaitlistStatus(subscriptionSlug).then(data => setStatus(data ?? null))
      })
      .catch(() => setStatus(null))
  }, [subscriptionSlug, user])

  if (status === 'loading' || status === 'no-auth') return null

  const isOnList = status !== null && !status.leftAt
  const wasOnList = status !== null && !!status.leftAt

  const handleJoin = async (joinedAt?: string) => {
    if (joinedAt && !isValidCalendarDate(joinedAt)) { setDateInvalid(true); setError('Enter a valid join date'); return }
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
    if (!isValidCalendarDate(dateInput)) { setDateInvalid(true); setError('Enter a valid date'); return }
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
      <div className="flex items-center gap-2 text-sm text-navy-400 mt-2">
        <Clock className="w-4 h-4 text-navy-500 shrink-0" />
        <span>
          Waited{' '}
          <span className="text-navy-300 font-semibold">{waitDays} day{waitDays !== 1 ? 's' : ''}</span>{' '}
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
        <div className="bg-navy-800/60 border border-navy-700/60 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-navy-400 shrink-0" />
              <p className="text-sm text-navy-200 font-medium">On the waitlist</p>
            </div>
            <button
              onClick={handleLeave}
              disabled={busy}
              className="flex items-center gap-1 text-xs text-navy-500 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Remove
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-navy-400 pl-6">
            {editingDate ? (
              <>
                <input
                  type="date"
                  value={dateInput}
                  onChange={e => handleDateInputChange(e.target.value)}
                  className={`bg-navy-700 border rounded px-2 py-0.5 text-navy-100 focus:outline-none focus:border-brand-400 text-xs w-full ${dateInvalid ? 'border-red-500/70' : 'border-navy-600'}`}
                />
                <button onClick={handleSaveDate} disabled={busy || !dateInput}
                  className="text-green-400 hover:text-green-300 disabled:opacity-40 shrink-0">
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                </button>
                <button onClick={() => setEditingDate(false)} className="text-navy-500 hover:text-navy-300 shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                <span>{joinDate.toLocaleDateString('en-GB')} · {daysOnList}d</span>
                <span className="flex-1" />
                <button
                  onClick={() => { setDateInput(joinDate.toISOString().slice(0, 10)); setDateInvalid(false); setEditingDate(true) }}
                  className="flex items-center gap-1 text-navy-600 hover:text-navy-400 transition-colors"
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
        <div className="bg-navy-800/60 border border-navy-700/60 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-navy-400 shrink-0" />
            <span className="text-xs text-navy-400">Joined waitlist on:</span>
          </div>
          <div className="flex items-center gap-2 pl-6">
            <input
              type="date"
              value={dateInput}
              onChange={e => handleDateInputChange(e.target.value)}
              className={`flex-1 min-w-0 bg-navy-700 border rounded px-2 py-1 text-navy-100 focus:outline-none focus:border-brand-400 text-xs ${dateInvalid ? 'border-red-500/70' : 'border-navy-600'}`}
            />
            <button onClick={() => handleJoin(dateInput || undefined)} disabled={busy}
              className="text-xs px-3 py-1 rounded-lg bg-navy-700 text-navy-200 hover:bg-navy-600 transition-colors disabled:opacity-50 shrink-0">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'Save'}
            </button>
            <button onClick={() => setShowDateForm(false)} className="text-navy-500 hover:text-navy-300 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setDateInput(new Date().toISOString().slice(0, 10)); setDateInvalid(false); setShowDateForm(true) }}
          className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl bg-navy-800/60 border border-navy-700/60 hover:border-navy-600 hover:bg-navy-800 text-sm text-navy-400 hover:text-navy-300 transition-all"
        >
          <Clock className="w-4 h-4" />
          I&apos;m on the waitlist
        </button>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}
