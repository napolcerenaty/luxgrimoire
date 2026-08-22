'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { API_BASE } from '@/lib/authFetch'

export interface AuthUser {
  id: string
  email: string
  username: string
  role: string
  managedCompanyId?: string | null
  displayName?: string
  avatar?: string
  preferredCurrency?: string
  timezone?: string
  timeFormat?: string
  defaultTaxRate?: number | null
  shippingCountry?: string | null
  bio?: string | null
  onboardingCompletedAt?: string | null
  termsAcceptedAt?: string | null
  termsVersion?: string | null
  privacyAcceptedAt?: string | null
  privacyVersion?: string | null
  statsSettings?: {
    spending: boolean
    sales: boolean
    reading: boolean
    features: boolean
  } | null
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  isLoggingOut: React.MutableRefObject<boolean>
  login: (user: AuthUser) => void
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const isLoggingOut = useRef(false)
  const router = useRouter()

  useEffect(() => {
    fetch(`${API_BASE}/auth/status`, { credentials: 'include' })
      .then(async (r) => {
        if (r.ok) {
          const data: { isLoggedIn: boolean; user?: AuthUser } = await r.json()
          if (data.isLoggedIn && data.user) setUser(data.user)
        }
      })
      .catch(() => {
        // Network error: server may be down, ignore
      })
      .finally(() => setLoading(false))
  }, [])

  const login = (authUser: AuthUser) => {
    setUser(authUser)
  }

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // ignore network errors
    }
    isLoggingOut.current = true
    setUser(null)
    router.replace('/')
  }

  const refreshUser = async () => {
    try {
      const r = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      if (r.ok) {
        const data: AuthUser = await r.json()
        setUser(data)
      }
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ user, loading, isLoggingOut, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
