'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { OAuthButtons } from '@/components/auth/OAuthButtons'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

const USERNAME_RE = /^[a-zA-Z0-9]{3,20}$/

export default function RegisterPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!USERNAME_RE.test(username)) {
      setError('Username must be 3–20 alphanumeric characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!termsAccepted) {
      setError('You must accept the Terms of Service and Privacy Policy to register.')
      return
    }

    setLoading(true)

    try {
      const registerRes = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username, termsAccepted }),
      })

      const registerData = await registerRes.json()

      if (!registerRes.ok) {
        setError(registerData?.message ?? 'Registration failed. Please try again.')
        return
      }

      router.push(`/check-email?email=${encodeURIComponent(email)}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-2xl max-w-md w-full">
      <div className="text-center mb-8">
        <h1 className="font-serif text-3xl text-amber-400 mb-1">LuxGrimoire</h1>
        <p className="text-stone-400 text-sm">Create your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-stone-300 mb-1.5">
            Username
          </label>
          <input
            id="username"
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="bookwitch42"
            className="w-full bg-stone-900 border border-stone-700 text-stone-100 rounded-lg px-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
          />
          <p className="text-xs text-stone-500 mt-1">3–20 alphanumeric characters</p>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-stone-300 mb-1.5">
            Email
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-stone-300 mb-1.5">
            Password
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
            Confirm password
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

        {/* Terms & Privacy consent */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-600 bg-stone-800 accent-amber-400 cursor-pointer"
          />
          <span className="text-sm text-stone-400 leading-relaxed">
            I have read and agree to the{' '}
            <Link href="/terms" target="_blank" className="text-amber-400 hover:text-amber-300 underline transition-colors">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" target="_blank" className="text-amber-400 hover:text-amber-300 underline transition-colors">
              Privacy Policy
            </Link>
          </span>
        </label>

        {error && (
          <p className="text-sm text-rose-400 bg-rose-950/30 border border-rose-900 rounded-lg px-4 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !termsAccepted}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-stone-950 font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <OAuthButtons />

      <p className="text-center text-sm text-stone-400 mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-amber-400 hover:text-amber-300 transition-colors">
          Login
        </Link>
      </p>
    </div>
  )
}
