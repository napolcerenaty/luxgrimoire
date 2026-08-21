'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/components/AuthProvider'
import { fetchLegalVersions, computeConsentGap, type ConsentGap, type LegalVersionsResponse } from './consent'

const EMPTY_VERSIONS: LegalVersionsResponse = { terms: null, privacy: null }

export interface ConsentStatus extends ConsentGap {
  /**
   * True until the Ghost version check has resolved at least once (fresh session, or after
   * cache staleness). Callers that gate rendering on `needsConsent` MUST also treat `isLoading`
   * as "don't render protected content yet" — computeConsentGap can't run without `versions`,
   * so `needsConsent` alone defaults to false while this is true. Skipping that check let a
   * user who owed re-consent see a private page for a moment before the redirect effect fired,
   * an easy click-through bypass (e.g. nav logo -> straight into a private route).
   */
  isLoading: boolean
  /** Raw fetched versions — needed by callers (the /consent submit) that resolve a concrete version string to POST. */
  versions: LegalVersionsResponse
}

export function useConsentStatus(): ConsentStatus {
  const { user } = useAuth()

  const { data: versions, isLoading } = useQuery({
    queryKey: ['legal-versions'],
    queryFn: fetchLegalVersions,
    staleTime: 60 * 1000,
  })

  if (!versions) return { needsConsent: false, outdated: { terms: false, privacy: false }, isLoading, versions: EMPTY_VERSIONS }
  return { ...computeConsentGap(user, versions), isLoading: false, versions }
}
