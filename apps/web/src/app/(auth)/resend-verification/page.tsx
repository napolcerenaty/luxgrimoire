'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

function ResendVerificationContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setStatus('loading')

    try {
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data?.message ?? 'Something went wrong. Please try again.')
        setStatus('idle')
        return
      }

      setStatus('sent')
    } catch {
      setError('Network error. Please try again.')
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
        <h1 className="font-serif text-3xl text-amber-400 mb-4">LuxGrimoire</h1>
        <div className="text-4xl mb-4">✉</div>
        <h2 className="text-xl font-semibold text-stone-100 mb-2">Email sent!</h2>
        <p className="text-stone-400 text-sm mb-6">
          If that address is registered and unverified, a new verification link has been sent.
          Check your inbox (and spam folder).
        </p>
        <Link
          href="/login"
          className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
        >
          Back to login
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-2xl max-w-md w-full">
      <div className="text-center mb-8">
        <h1 className="font-serif text-3xl text-amber-400 mb-1">LuxGrimoire</h1>
        <p className="text-stone-400 text-sm">Resend verification email</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-stone-300 mb-1.5">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-stone-900 border border-stone-700 text-stone-100 rounded-lg px-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
          />
        </div>

        {error && (
          <p className="text-sm text-rose-400 bg-rose-950/30 border border-rose-900 rounded-lg px-4 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'loading'}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-stone-950 font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {status === 'loading' ? 'Sending…' : 'Resend verification email'}
        </button>
      </form>

      <p className="text-center text-sm text-stone-400 mt-6">
        Already verified?{' '}
        <Link href="/login" className="text-amber-400 hover:text-amber-300 transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  )
}

export default function ResendVerificationPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <ResendVerificationContent />
    </Suspense>
  )
}
