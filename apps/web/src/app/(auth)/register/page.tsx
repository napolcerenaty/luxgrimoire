'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { PasswordStrength, passwordStrong } from '@/components/auth/PasswordStrength'
import { API_BASE } from '@/lib/authFetch'
import { fetchLegalVersions, resolveTermsVersion, resolvePrivacyVersion } from '@/lib/consent'

/** Instagram-style: letters, digits, underscores, periods; no leading/trailing/consecutive periods; 3–30 chars */
const USERNAME_RE = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-zA-Z0-9._]{3,30}$/

export default function RegisterPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isPasswordStrong = useMemo(() => passwordStrong(password), [password])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!USERNAME_RE.test(username)) {
      setError('Username must be 3–30 characters and may only contain letters, numbers, underscores and periods. It cannot start or end with a period.')
      return
    }
    if (!isPasswordStrong) {
      setError('Please choose a stronger password that meets all requirements.')
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
      const versions = await fetchLegalVersions()
      const registerRes = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          username,
          termsAccepted,
          termsVersion: resolveTermsVersion(versions),
          privacyVersion: resolvePrivacyVersion(versions),
        }),
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
    <div className="bg-navy-900 border border-navy-800 rounded-2xl p-8 shadow-2xl max-w-md w-full">
      <div className="text-center mb-8">
        <h1 className="font-serif text-3xl text-brand-400 mb-1">LuxGrimoire</h1>
        <p className="text-navy-400 text-sm">Create your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-navy-300 mb-1.5">
            Username
          </label>
          <input
            id="username"
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="book.witch_42"
            className="w-full bg-navy-900 border border-navy-700 text-navy-100 rounded-lg px-4 py-2.5 text-sm placeholder:text-navy-500 focus:outline-none focus:border-brand-400 transition-colors"
          />
          <p className="text-xs text-navy-500 mt-1">3–30 characters · letters, numbers, <code className="text-navy-400">_</code> and <code className="text-navy-400">.</code> allowed</p>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-navy-300 mb-1.5">
            Email
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-navy-300 mb-1.5">
            Password
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
            Confirm password
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

        {/* Terms & Privacy consent */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-navy-600 bg-navy-800 accent-brand-400 cursor-pointer"
          />
          <span className="text-sm text-navy-400 leading-relaxed">
            I have read and agree to the{' '}
            <Link href="/terms" target="_blank" className="text-brand-400 hover:text-brand-300 underline transition-colors">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" target="_blank" className="text-brand-400 hover:text-brand-300 underline transition-colors">
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
          className="w-full bg-brand-500 hover:bg-brand-400 disabled:opacity-60 disabled:cursor-not-allowed text-navy-950 font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <OAuthButtons />

      <p className="text-center text-sm text-navy-400 mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-400 hover:text-brand-300 transition-colors">
          Login
        </Link>
      </p>
    </div>
  )
}
