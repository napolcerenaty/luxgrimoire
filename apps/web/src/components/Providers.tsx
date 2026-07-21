'use client'
import { AuthProvider } from '@/components/AuthProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { QueryProvider } from '@/providers/QueryProvider'
import { OnboardingGate } from '@/components/onboarding/OnboardingGate'
import { NumberInputScrollGuard } from '@/components/layout/NumberInputScrollGuard'
import { DateInputYearGuard } from '@/components/layout/DateInputYearGuard'

export function Providers({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <NumberInputScrollGuard />
          <DateInputYearGuard />
          <OnboardingGate />
          {children}
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  )
}