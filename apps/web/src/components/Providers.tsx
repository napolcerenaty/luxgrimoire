'use client'
import { AuthProvider } from '@/components/AuthProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { QueryProvider } from '@/providers/QueryProvider'
import { OnboardingGate } from '@/components/onboarding/OnboardingGate'
import { NumberInputScrollGuard } from '@/components/layout/NumberInputScrollGuard'
import { DateInputYearGuard } from '@/components/layout/DateInputYearGuard'

export function Providers({
  children,
  initialTheme,
}: {
  children: React.ReactNode
  initialTheme?: 'dark' | 'light'
}) {
  return (
    <QueryProvider>
      <ThemeProvider initialTheme={initialTheme}>
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