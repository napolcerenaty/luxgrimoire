'use client'

import { useState, useEffect, useCallback } from 'react'

export type SaleTier = 'FA' | 'EA' | 'GS'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
}

async function authFetch(path: string, options?: RequestInit) {
  const token = getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (res.status === 204 || res.headers.get('content-length') === '0') return null
  return res.ok ? res.json() : null
}

// ─── Shared module-level cache ───────────────────────────────────────────────
// All hook instances for the same announcementId share state.
// When any instance writes, all others update immediately (no re-fetch needed).

interface CachedState { isInterested: boolean; tier: SaleTier | null }
type Listener = (s: CachedState) => void

const cache = new Map<string, CachedState>()
const listeners = new Map<string, Set<Listener>>()

function broadcast(id: string, state: CachedState) {
  cache.set(id, state)
  listeners.get(id)?.forEach(fn => fn(state))
}

function subscribe(id: string, fn: Listener) {
  if (!listeners.has(id)) listeners.set(id, new Set())
  listeners.get(id)!.add(fn)
  return () => { listeners.get(id)?.delete(fn) }
}

// ─────────────────────────────────────────────────────────────────────────────

export function useSaleInterest(announcementId: string | null) {
  const [state, setState] = useState<CachedState & { loading: boolean }>({
    isInterested: false,
    tier: null,
    loading: false,
  })

  useEffect(() => {
    if (!announcementId) return

    // If we already have cached data, use it immediately (no spinner)
    const cached = cache.get(announcementId)
    if (cached) {
      setState({ ...cached, loading: false })
    }

    // Subscribe to broadcasts from other instances
    const unsub = subscribe(announcementId, s => setState({ ...s, loading: false }))

    // Fetch from server only if no cache yet
    if (!cached) {
      if (!getToken()) { unsub(); return }
      setState(s => ({ ...s, loading: true }))
      authFetch(`/sale-interests/${announcementId}`)
        .then(data => {
          const next: CachedState = data?.announcementId
            ? { isInterested: true, tier: data.tier as SaleTier }
            : { isInterested: false, tier: null }
          broadcast(announcementId, next)
        })
        .catch(() => {
          const next: CachedState = { isInterested: false, tier: null }
          broadcast(announcementId, next)
        })
    }

    return unsub
  }, [announcementId])

  const setInterest = useCallback(async (tier: SaleTier) => {
    if (!announcementId) return
    // Optimistic update — all instances see it immediately
    broadcast(announcementId, { isInterested: true, tier })
    try {
      await authFetch(`/sale-interests/${announcementId}`, {
        method: 'POST',
        body: JSON.stringify({ tier }),
      })
    } catch {
      // rollback
      broadcast(announcementId, { isInterested: false, tier: null })
    }
  }, [announcementId])

  const removeInterest = useCallback(async () => {
    if (!announcementId) return
    broadcast(announcementId, { isInterested: false, tier: null })
    try {
      await authFetch(`/sale-interests/${announcementId}`, { method: 'DELETE' })
    } catch {
      // rollback — refetch to get real state
      authFetch(`/sale-interests/${announcementId}`).then(data => {
        const next: CachedState = data?.announcementId
          ? { isInterested: true, tier: data.tier as SaleTier }
          : { isInterested: false, tier: null }
        broadcast(announcementId, next)
      }).catch(() => {})
    }
  }, [announcementId])

  return { ...state, setInterest, removeInterest }
}
