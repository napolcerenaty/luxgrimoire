'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiFetch } from '@/lib/api'

interface BrandColorsEntry {
  slug: string
  brandColors: string[]
}

/**
 * Global brand-colors cache hook.
 *
 * Returns a lookup function `(slug) => string[] | null` that resolves a
 * company's brand colors from a single long-lived cache (24 h stale, never GC'd).
 *
 * The endpoint is public, so this works for both authenticated and guest users.
 * After the first fetch the data is served entirely from memory — no additional
 * DB queries are made for any component that calls this hook.
 *
 * Invalidated by the admin companies page whenever brand colors are saved.
 */
export function useBrandColors() {
  const { data } = useQuery<BrandColorsEntry[]>({
    queryKey: ['brand-colors'],
    queryFn: () => apiFetch<BrandColorsEntry[]>('/companies/brand-colors'),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: Infinity,
  })

  const map = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of data ?? []) {
      if (c.brandColors.length) m.set(c.slug, c.brandColors)
    }
    return m
  }, [data])

  return (slug: string | null | undefined): string[] | null =>
    slug ? (map.get(slug) ?? null) : null
}
