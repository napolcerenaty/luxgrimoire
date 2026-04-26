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

interface SaleInterestState {
  isInterested: boolean
  tier: SaleTier | null
  loading: boolean
}

export function useSaleInterest(announcementId: string | null) {
  const [state, setState] = useState<SaleInterestState>({ isInterested: false, tier: null, loading: false })

  useEffect(() => {
    if (!announcementId || !getToken()) return
    setState(s => ({ ...s, loading: true }))
    authFetch(`/sale-interests/${announcementId}`)
      .then(data => {
        if (data?.announcementId) {
          setState({ isInterested: true, tier: data.tier as SaleTier, loading: false })
        } else {
          setState({ isInterested: false, tier: null, loading: false })
        }
      })
      .catch(() => setState({ isInterested: false, tier: null, loading: false }))
  }, [announcementId])

  const setInterest = useCallback(async (tier: SaleTier) => {
    if (!announcementId) return
    setState(s => ({ ...s, loading: true }))
    try {
      await authFetch(`/sale-interests/${announcementId}`, {
        method: 'POST',
        body: JSON.stringify({ tier }),
      })
      setState({ isInterested: true, tier, loading: false })
    } catch {
      setState(s => ({ ...s, loading: false }))
    }
  }, [announcementId])

  const removeInterest = useCallback(async () => {
    if (!announcementId) return
    setState(s => ({ ...s, loading: true }))
    try {
      await authFetch(`/sale-interests/${announcementId}`, { method: 'DELETE' })
      setState({ isInterested: false, tier: null, loading: false })
    } catch {
      setState(s => ({ ...s, loading: false }))
    }
  }, [announcementId])

  return { ...state, setInterest, removeInterest }
}
