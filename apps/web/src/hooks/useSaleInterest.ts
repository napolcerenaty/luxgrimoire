'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'

export type SaleTier = 'FA' | 'EA' | 'GS'

// ─── Shared module-level cache ───────────────────────────────────────────────
// All hook instances for the same announcementId share state.
// When any instance writes, all others update immediately (no re-fetch needed).

interface CachedState { isInterested: boolean; tier: SaleTier | null; regionId: string | null }
type SaleInterestRecord = { announcementId: string; tier: string; regionId?: string | null } | null
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
  const queryClient = useQueryClient()
  const [state, setState] = useState<CachedState & { loading: boolean }>({
    isInterested: false,
    tier: null,
    regionId: null,
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
      setState(s => ({ ...s, loading: true }))
      authFetch<SaleInterestRecord>(`/sale-interests/${announcementId}`)
        .then(data => {
          const next: CachedState = data?.announcementId
            ? { isInterested: true, tier: data.tier as SaleTier, regionId: data.regionId ?? null }
            : { isInterested: false, tier: null, regionId: null }
          broadcast(announcementId, next)
        })
        .catch(() => {
          const next: CachedState = { isInterested: false, tier: null, regionId: null }
          broadcast(announcementId, next)
        })
    }

    return unsub
  }, [announcementId])

  const setInterest = useCallback(async (tier: SaleTier, regionId?: string | null) => {
    if (!announcementId) return
    broadcast(announcementId, { isInterested: true, tier, regionId: regionId ?? null })
    try {
      await authFetch(`/sale-interests/${announcementId}`, {
        method: 'POST',
        body: JSON.stringify({ tier, regionId: regionId ?? null }),
      })
      queryClient.invalidateQueries({ queryKey: ['sale-interests'] })
    } catch {
      broadcast(announcementId, { isInterested: false, tier: null, regionId: null })
    }
  }, [announcementId, queryClient])

  const removeInterest = useCallback(async () => {
    if (!announcementId) return
    broadcast(announcementId, { isInterested: false, tier: null, regionId: null })
    try {
      await authFetch(`/sale-interests/${announcementId}`, { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['sale-interests'] })
    } catch {
      // rollback — refetch to get real state
      authFetch<SaleInterestRecord>(`/sale-interests/${announcementId}`).then(data => {
        const next: CachedState = data?.announcementId
          ? { isInterested: true, tier: data.tier as SaleTier, regionId: data.regionId ?? null }
          : { isInterested: false, tier: null, regionId: null }
        broadcast(announcementId, next)
      }).catch(() => {})
    }
  }, [announcementId, queryClient])

  return { ...state, setInterest, removeInterest }
}
