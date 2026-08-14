'use client'

import { useState } from 'react'
import Link from 'next/link'
import { API_BASE } from '@/lib/authFetch'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      // Always show success to avoid email enumeration
      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-navy-900 border border-navy-800 rounded-2xl p-8 shadow-2xl max-w-md w-full">
      <div className="text-center mb-8">
        <h1 className="font-serif italic text-3xl text-brand-400 mb-1">LuxGrimoire</h1>
        <p className="text-navy-400 text-sm">Reset your password</p>
      </div>

      {submitted ? (
        <div className="text-center space-y-4">
          <div className="text-4xl">📬</div>
          <p className="text-navy-200 text-sm leading-relaxed">
            If an account exists with that email, you&apos;ll receive a reset link.
          </p>
          <Link
            href="/login"
            className="inline-block text-brand-400 hover:text-brand-300 transition-colors text-sm"
          >
            ← Back to login
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-navy-300 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-navy-900 border border-navy-700 text-navy-100 rounded-lg px-4 py-2.5 text-sm placeholder:text-navy-500 focus:outline-none focus:border-brand-400 transition-colors"
              />
            </div>

            {error && (
              <p className="text-sm text-rose-400 bg-rose-950/30 border border-rose-900 rounded-lg px-4 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-400 disabled:opacity-60 disabled:cursor-not-allowed text-navy-950 font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <p className="text-center text-sm text-navy-400 mt-6">
            <Link href="/login" className="text-brand-400 hover:text-brand-300 transition-colors">
              ← Back to login
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
