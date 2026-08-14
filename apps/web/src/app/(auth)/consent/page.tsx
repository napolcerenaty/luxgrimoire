'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import Link from 'next/link'
import { API_BASE } from '@/lib/authFetch'
import {
  fetchLegalVersions,
  computeConsentGap,
  resolveTermsVersion,
  resolvePrivacyVersion,
  type LegalVersionsResponse,
} from '@/lib/consent'

export default function ConsentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo')
  const auth = useAuth()
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [versions, setVersions] = useState<LegalVersionsResponse | null>(null)

  useEffect(() => {
    fetchLegalVersions().then(v => {
      setVersions(v)
      setChecking(false)
    })
  }, [])

  if (checking || !auth.user) {
    return (
      <div className="max-w-md mx-auto mt-16 px-4">
        <p className="text-navy-400 text-sm animate-pulse">Loading…</p>
      </div>
    )
  }

  const resolvedVersions = versions ?? { terms: null, privacy: null }
  const gap = computeConsentGap(auth.user, resolvedVersions)
  const isNewUser = !auth.user.termsAcceptedAt && !auth.user.privacyAcceptedAt

  // Nothing actually outdated (e.g. user navigated here directly) — nowhere to send them but home
  if (!gap.needsConsent) {
    router.replace(returnTo && returnTo.startsWith('/') ? returnTo : '/')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accepted) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/consent`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(gap.outdated.terms && { termsVersion: resolveTermsVersion(resolvedVersions) }),
          ...(gap.outdated.privacy && { privacyVersion: resolvePrivacyVersion(resolvedVersions) }),
        }),
      })
      if (!res.ok) throw new Error('Failed to save consent')
      const me = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' }).then(r => r.json())
      auth.login(me)
      router.replace(returnTo && returnTo.startsWith('/') ? returnTo : '/')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 px-4">
      <h1 className="text-2xl font-bold mb-2">One last step</h1>

      {isNewUser ? (
        <p className="text-navy-400 text-sm mb-6">
          Before continuing, please review and accept our policies.
        </p>
      ) : (
        <div className="text-navy-400 text-sm mb-6 space-y-4">
          <p>We&apos;ve updated our policies since you last agreed. Please review the changes below and accept to continue.</p>
          {gap.outdated.terms && (
            <div className="border border-navy-800 rounded-lg p-3">
              <p className="font-medium text-navy-200 mb-1">Terms of Use</p>
              <p>{gap.terms?.summary ?? 'The Terms of Use have been updated.'}</p>
            </div>
          )}
          {gap.outdated.privacy && (
            <div className="border border-navy-800 rounded-lg p-3">
              <p className="font-medium text-navy-200 mb-1">Privacy Policy</p>
              <p>{gap.privacy?.summary ?? 'The Privacy Policy has been updated.'}</p>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={e => setAccepted(e.target.checked)}
            className="mt-1 accent-brand-500"
          />
          <span className="text-sm text-navy-300">
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
          className="w-full py-2 rounded bg-brand-500 text-navy-900 font-semibold hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
