'use client'
import { AuthProvider } from '@/components/AuthProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { QueryProvider } from '@/providers/QueryProvider'
import { OnboardingGate } from '@/components/onboarding/OnboardingGate'

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
          <OnboardingGate />
          {children}
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  )
}