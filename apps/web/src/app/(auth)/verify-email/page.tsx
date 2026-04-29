'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const auth = useAuth()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage('No verification token provided.')
      return
    }

    const verify = async () => {
      try {
        const res = await fetch(`${API_URL}/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })

        const data = await res.json()

        if (!res.ok) {
          setStatus('error')
          setErrorMessage(data?.message ?? 'Verification failed. The link may be invalid or expired.')
          return
        }

        // Fetch full user profile and log in
        const meRes = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        })
        const me = meRes.ok
          ? await meRes.json()
          : { id: data.userId, email: data.email, username: data.username, role: data.role }

        auth.login(data.accessToken, me)
        setStatus('success')

        setTimeout(() => router.push('/calendar'), 2000)
      } catch {
        setStatus('error')
        setErrorMessage('Network error. Please try again.')
      }
    }

    verify()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
      <h1 className="font-serif text-3xl text-amber-400 mb-6">LuxGrimoire</h1>

      {status === 'loading' && (
        <>
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-stone-300 text-sm">Verifying your email address…</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="text-4xl mb-4">✓</div>
          <h2 className="text-xl font-semibold text-stone-100 mb-2">Email verified!</h2>
          <p className="text-stone-400 text-sm">Your account is now active. Redirecting you…</p>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="text-4xl mb-4">✗</div>
          <h2 className="text-xl font-semibold text-stone-100 mb-2">Verification failed</h2>
          <p className="text-sm text-rose-400 bg-rose-950/30 border border-rose-900 rounded-lg px-4 py-2.5 mb-6">
            {errorMessage}
          </p>
          <div className="space-y-3">
            <Link
              href="/resend-verification"
              className="block w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              Resend verification email
            </Link>
            <Link
              href="/login"
              className="block text-sm text-amber-400 hover:text-amber-300 transition-colors"
            >
              Back to login
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}
