'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiSkipStatus } from '@luxgrimoire/shared-types'
import { groupIntoBundles, type BundleGroup } from '@/lib/bundleHelpers'

/**
 * Shared skip-policy data/mutations/bundle-grouping logic used by both the full
 * SkipStatusPanel (subscription detail page) and the compact overview variant
 * (my-subscriptions list). Keeping this in one place means a bundle-awareness
 * fix here automatically applies to every surface that renders skip status —
 * that's the whole point: this hook exists because that fix previously had to
 * be made twice, once per hand-rolled UI.
 */
export function useSkipPolicyStatus(subscriptionSlug: string, onSkipSuccess?: () => void) {
  const queryClient = useQueryClient()
  const [skipTarget, setSkipTarget] = useState<{ year: number; month: number } | null>(null)
  const [unskipTarget, setUnskipTarget] = useState<{ year: number; month: number } | null>(null)
  const [showManageSkips, setShowManageSkips] = useState(false)

  const { data: status, isLoading, error } = useQuery<ApiSkipStatus>({
    queryKey: ['skip-status', subscriptionSlug],
    queryFn: () => authFetch<ApiSkipStatus>(`/skip-policy/${subscriptionSlug}/status`),
    retry: false,
  })

  const skipMutation = useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      authFetch<ApiSkipStatus>(`/skip-policy/${subscriptionSlug}/skip/${year}/${month}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['skip-status', subscriptionSlug] })
      void queryClient.invalidateQueries({ queryKey: ['my-calendar-subscriptions'] })
      setSkipTarget(null)
      onSkipSuccess?.()
    },
  })

  const unskipMutation = useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      authFetch<ApiSkipStatus>(`/skip-policy/${subscriptionSlug}/skip/${year}/${month}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['skip-status', subscriptionSlug] })
      void queryClient.invalidateQueries({ queryKey: ['my-calendar-subscriptions'] })
      setUnskipTarget(null)
      onSkipSuccess?.()
    },
  })

  const isBundleMode = (status?.isBundleSubscription ?? false) && (status?.intervalMonths ?? 1) > 1

  const futureSkippedMonths = (status?.skippedMonths ?? []).filter((s) => {
    const n = new Date()
    const cy = n.getFullYear(), cm = n.getMonth() + 1
    return s.year > cy || (s.year === cy && s.month >= cm)
  })

  const skippedBundles: BundleGroup<{ year: number; month: number }>[] =
    isBundleMode && status ? groupIntoBundles(futureSkippedMonths, status.intervalMonths, status.startingMonth) : []
  const allSkippedBundles: BundleGroup<{ year: number; month: number }>[] =
    isBundleMode && status ? groupIntoBundles(status.skippedMonths ?? [], status.intervalMonths, status.startingMonth) : []

  return {
    status,
    isLoading,
    error,
    isBundleMode,
    skipTarget,
    setSkipTarget,
    unskipTarget,
    setUnskipTarget,
    showManageSkips,
    setShowManageSkips,
    skipMutation,
    unskipMutation,
    futureSkippedMonths,
    skippedBundles,
    allSkippedBundles,
  }
}
