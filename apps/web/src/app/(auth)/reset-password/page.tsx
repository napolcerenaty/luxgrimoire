'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!token) {
      setError('Invalid or missing reset token.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data?.message ?? 'Reset failed. The link may have expired.')
        return
      }

      router.push('/login?reset=success')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!token && (
        <p className="text-sm text-rose-400 bg-rose-950/30 border border-rose-900 rounded-lg px-4 py-2.5">
          Invalid or missing reset token. Please request a new password reset.
        </p>
      )}

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-stone-300 mb-1.5">
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full bg-stone-900 border border-stone-700 text-stone-100 rounded-lg px-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-stone-300 mb-1.5">
          Confirm new password
        </label>
        <input
          id="confirm"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
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
        disabled={loading || !token}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-stone-950 font-semibold py-2.5 rounded-lg transition-colors text-sm"
      >
        {loading ? 'Resetting…' : 'Reset password'}
      </button>

      <p className="text-center text-sm text-stone-400">
        <Link href="/login" className="text-amber-400 hover:text-amber-300 transition-colors">
          ← Back to login
        </Link>
      </p>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-2xl max-w-md w-full">
      <div className="text-center mb-8">
        <h1 className="font-serif italic text-3xl text-amber-400 mb-1">LuxGrimoire</h1>
        <p className="text-stone-400 text-sm">Set a new password</p>
      </div>
      <Suspense fallback={<div className="text-stone-400 text-sm text-center">Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
