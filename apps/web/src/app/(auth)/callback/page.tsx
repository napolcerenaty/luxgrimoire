'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

export default function OAuthCallbackPage() {
  const router = useRouter()
  const params = useSearchParams()
  const auth = useAuth()

  useEffect(() => {
    const token = params.get('token')
    const error = params.get('error')

    if (error || !token) {
      router.replace('/login?error=oauth_failed')
      return
    }

    fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(me => {
        if (!me) { router.replace('/login?error=oauth_failed'); return }
        auth.login(token, me)
        router.replace('/calendar')
      })
      .catch(() => router.replace('/login?error=oauth_failed'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="text-center">
      <p className="text-stone-400 text-sm animate-pulse">Signing you in…</p>
    </div>
  )
}
