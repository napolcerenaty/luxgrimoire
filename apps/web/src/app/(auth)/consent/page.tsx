'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import Link from 'next/link'
import { API_BASE } from '@/lib/authFetch'

export default function ConsentPage() {
  const router = useRouter()
  const auth = useAuth()
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accepted) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/consent`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to save consent')
      // Refresh user info so needsConsent is cleared
      const me = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' }).then(r => r.json())
      auth.login(me)
      router.replace('/')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 px-4">
      <h1 className="text-2xl font-bold mb-2">One last step</h1>
      <p className="text-stone-400 text-sm mb-6">
        Before continuing, please review and accept our policies.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={e => setAccepted(e.target.checked)}
            className="mt-1 accent-brand-500"
          />
          <span className="text-sm text-stone-300">
            I have read and agree to the{' '}
            <Link href="/terms" target="_blank" className="text-brand-400 underline hover:text-brand-300">
              Terms &amp; Conditions
            </Link>{' '}
            and{' '}
            <Link href="/privacy" target="_blank" className="text-brand-400 underline hover:text-brand-300">
              Privacy Policy
            </Link>
          </span>
        </label>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={!accepted || loading}
          className="w-full py-2 rounded bg-brand-500 text-stone-900 font-semibold hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
