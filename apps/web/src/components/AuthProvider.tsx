'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { API_BASE } from '@/lib/authFetch'

interface AuthUser {
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
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  login: (user: AuthUser) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (r) => {
        if (r.ok) {
          const data: AuthUser = await r.json()
          setUser(data)
        }
        // 401 = not logged in, ignore
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
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
