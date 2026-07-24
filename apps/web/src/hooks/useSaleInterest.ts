'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'

// ─── Shared module-level cache ───────────────────────────────────────────────
// All hook instances for the same announcementId share state.
// When any instance writes, all others update immediately (no re-fetch needed).

interface CachedState {
  isInterested: boolean;
  tierId: string | null;
  tierName: string | null;
  regionId: string | null;
  selectedPrice: number | null;
  selectedPriceCurrency: string | null;
}
type SaleInterestRecord = {
  announcementId: string;
  tierId: string | null;
  regionId?: string | null;
  selectedPrice?: number | null;
  selectedPriceCurrency?: string | null;
  saleTier?: { id: string; name: string; date: string; regionId: string | null } | null;
} | null
type Listener = (s: CachedState) => void

const EMPTY_STATE: CachedState = {
  isInterested: false,
  tierId: null,
  tierName: null,
  regionId: null,
  selectedPrice: null,
  selectedPriceCurrency: null,
}

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

function fromRecord(data: SaleInterestRecord): CachedState {
  if (!data?.announcementId) return EMPTY_STATE
  return {
    isInterested: true,
    tierId: data.saleTier?.id ?? data.tierId ?? null,
    tierName: data.saleTier?.name ?? null,
    regionId: data.saleTier?.regionId ?? data.regionId ?? null,
    selectedPrice: data.selectedPrice ?? null,
    selectedPriceCurrency: data.selectedPriceCurrency ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function useSaleInterest(announcementId: string | null) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [state, setState] = useState<CachedState & { loading: boolean }>({ ...EMPTY_STATE, loading: false })

  useEffect(() => {
    if (!announcementId) return
    if (!user) return

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
        .then(data => broadcast(announcementId, fromRecord(data)))
        .catch(() => broadcast(announcementId, EMPTY_STATE))
    }

    return unsub
  }, [announcementId, user])

  const setInterest = useCallback(async (
    tierId: string,
    tierName: string,
    regionId?: string | null,
    selectedPrice?: number | null,
    selectedPriceCurrency?: string | null,
  ) => {
    if (!announcementId) return
    broadcast(announcementId, {
      isInterested: true,
      tierId,
      tierName,
      regionId: regionId ?? null,
      selectedPrice: selectedPrice ?? null,
      selectedPriceCurrency: selectedPriceCurrency ?? null,
    })
    try {
      // regionId is derived server-side from the tier itself — not sent.
      await authFetch(`/sale-interests/${announcementId}`, {
        method: 'POST',
        body: JSON.stringify({
          tierId,
          selectedPrice: selectedPrice ?? null,
          selectedPriceCurrency: selectedPriceCurrency ?? null,
        }),
      })
      queryClient.invalidateQueries({ queryKey: ['sale-interests'] })
    } catch {
      broadcast(announcementId, EMPTY_STATE)
    }
  }, [announcementId, queryClient])

  const removeInterest = useCallback(async () => {
    if (!announcementId) return
    broadcast(announcementId, EMPTY_STATE)
    try {
      await authFetch(`/sale-interests/${announcementId}`, { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['sale-interests'] })
    } catch {
      // rollback — refetch to get real state
      authFetch<SaleInterestRecord>(`/sale-interests/${announcementId}`)
        .then(data => broadcast(announcementId, fromRecord(data)))
        .catch(() => {})
    }
  }, [announcementId, queryClient])

  return { ...state, setInterest, removeInterest }
}
