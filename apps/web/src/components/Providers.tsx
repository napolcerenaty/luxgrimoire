'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { AuthProvider } from '@/components/AuthProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { LanguageProvider } from '@/components/LanguageProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,        // 30s — data is fresh, no background refetch
        gcTime: 5 * 60 * 1000,       // 5min — keep in cache after unmount
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }))
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
