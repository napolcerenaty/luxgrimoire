'use client'

import { useAuth } from '@/components/AuthProvider'
import { OnboardingWizard } from './OnboardingWizard'

export function OnboardingGate() {
  const { user, loading } = useAuth()
  if (loading || !user) return null
  if (user.onboardingCompletedAt) return null
  return <OnboardingWizard />
}
