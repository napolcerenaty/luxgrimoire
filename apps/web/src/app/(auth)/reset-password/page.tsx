'use client'

import { useState, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { PasswordStrength, passwordStrong } from '@/components/auth/PasswordStrength'
import { API_BASE } from '@/lib/authFetch'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isPasswordStrong = useMemo(() => passwordStrong(password), [password])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isPasswordStrong) {
      setError('Please choose a stronger password that meets all requirements.')
      return
    }
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
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
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
        <label htmlFor="password" className="block text-sm font-medium text-navy-300 mb-1.5">
          New password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-navy-900 border border-navy-700 text-navy-100 rounded-lg px-4 py-2.5 pr-10 text-sm placeholder:text-navy-500 focus:outline-none focus:border-brand-400 transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-500 hover:text-navy-300 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <PasswordStrength password={password} />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-navy-300 mb-1.5">
          Confirm new password
        </label>
        <div className="relative">
          <input
            id="confirm"
            type={showConfirm ? 'text' : 'password'}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-navy-900 border border-navy-700 text-navy-100 rounded-lg px-4 py-2.5 pr-10 text-sm placeholder:text-navy-500 focus:outline-none focus:border-brand-400 transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-500 hover:text-navy-300 transition-colors"
            aria-label={showConfirm ? 'Hide password' : 'Show password'}
          >
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-rose-400 bg-rose-950/30 border border-rose-900 rounded-lg px-4 py-2.5">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !token}
        className="w-full bg-brand-500 hover:bg-brand-400 disabled:opacity-60 disabled:cursor-not-allowed text-navy-950 font-semibold py-2.5 rounded-lg transition-colors text-sm"
      >
        {loading ? 'Resetting…' : 'Reset password'}
      </button>

      <p className="text-center text-sm text-navy-400">
        <Link href="/login" className="text-brand-400 hover:text-brand-300 transition-colors">
          ← Back to login
        </Link>
      </p>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="bg-navy-900 border border-navy-800 rounded-2xl p-8 shadow-2xl max-w-md w-full">
      <div className="text-center mb-8">
        <h1 className="font-serif italic text-3xl text-brand-400 mb-1">LuxGrimoire</h1>
        <p className="text-navy-400 text-sm">Set a new password</p>
      </div>
      <Suspense fallback={<div className="text-navy-400 text-sm text-center">Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
