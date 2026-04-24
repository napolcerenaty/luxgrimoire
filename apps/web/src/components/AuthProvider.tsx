'use client'

import { createContext, useContext, useEffect, useState } from 'react'

interface AuthUser {
  id: string
  email: string
  username: string
  role: string
  managedCompanyId?: string | null
  displayName?: string
  avatar?: string
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  login: (token: string, user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('luxgrimoire_token')
    if (!token) {
      setLoading(false)
      return
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (r.ok) {
          const data: AuthUser = await r.json()
          setUser(data)
        } else if (r.status === 401) {
          // Token truly invalid — remove it
          localStorage.removeItem('luxgrimoire_token')
        }
        // 5xx or other errors: keep the token (server may be restarting)
      })
      .catch(() => {
        // Network error: server is down/restarting — keep the token
      })
      .finally(() => setLoading(false))
  }, [])

  const login = (token: string, authUser: AuthUser) => {
    localStorage.setItem('luxgrimoire_token', token)
    setUser(authUser)
  }

  const logout = () => {
    localStorage.removeItem('luxgrimoire_token')
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
