'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { OAuthButtons } from '@/components/auth/OAuthButtons'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

export default function LoginPage() {
  const router = useRouter()
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data?.message ?? 'Login failed. Please try again.')
        return
      }

      // Fetch full user profile to populate AuthProvider state
      const meRes = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${data.accessToken}` },
      })
      const me = meRes.ok ? await meRes.json() : { id: data.userId, email, username: data.username, role: data.role }

      auth.login(data.accessToken, me)
      router.push('/calendar')
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
        <p className="text-stone-400 text-sm">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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

        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <p className="text-sm text-rose-400 bg-rose-950/30 border border-rose-900 rounded-lg px-4 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-stone-950 font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <OAuthButtons />

      <p className="text-center text-sm text-stone-400 mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-amber-400 hover:text-amber-300 transition-colors">
          Register
        </Link>
      </p>
    </div>
  )
}
