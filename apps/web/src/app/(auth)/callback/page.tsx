'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { API_BASE } from '@/lib/authFetch'

export default function OAuthCallbackPage() {
  const router = useRouter()
  const auth = useAuth()

  useEffect(() => {
    // Cookie was set by API during OAuth redirect — just fetch user info
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(me => {
        if (!me) { router.replace('/login?error=oauth_failed'); return }
        auth.login(me)
        if (me.needsConsent) {
          router.replace('/consent')
        } else {
          router.replace('/calendar')
        }
      })
      .catch(() => router.replace('/login?error=oauth_failed'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="text-center">
      <p className="text-stone-400 text-sm animate-pulse">Signing you in…</p>
    </div>
  )
}
