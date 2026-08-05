'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/components/AuthProvider'
import { fetchLegalVersions, computeConsentGap, type ConsentGap } from './consent'

export function useConsentStatus(): ConsentGap {
  const { user } = useAuth()

  const { data: versions } = useQuery({
    queryKey: ['legal-versions'],
    queryFn: fetchLegalVersions,
    staleTime: 60 * 1000,
  })

  if (!versions) return { needsConsent: false, outdated: { terms: false, privacy: false } }
  return computeConsentGap(user, versions)
}
