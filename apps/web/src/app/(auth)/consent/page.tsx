'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import Link from 'next/link'
import { API_BASE } from '@/lib/authFetch'
import { resolveTermsVersion, resolvePrivacyVersion } from '@/lib/consent'
import { useConsentStatus } from '@/lib/useConsentStatus'

export default function ConsentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo')
  const auth = useAuth()
  const { needsConsent, outdated, terms, privacy, isLoading: consentLoading, versions } = useConsentStatus()
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isNewUser = !auth.user?.termsAcceptedAt && !auth.user?.privacyAcceptedAt

  // Nothing actually outdated (e.g. user navigated here directly, or just finished accepting
  // and auth.user re-rendered with the updated versions) — nowhere to send them but home.
  // Must run from an effect, never during render (calling router.replace mid-render was
  // triggering "Cannot update a component (Router) while rendering ConsentPage").
  useEffect(() => {
    if (!auth.loading && !consentLoading && auth.user && !needsConsent) {
      router.replace(returnTo && returnTo.startsWith('/') ? returnTo : '/')
    }
  }, [auth.loading, consentLoading, auth.user, needsConsent, router, returnTo])

  if (auth.loading || consentLoading || !auth.user || !needsConsent) {
    return (
      <div className="max-w-md mx-auto mt-16 px-4">
        <p className="text-navy-400 text-sm animate-pulse">Loading…</p>
      </div>
    )
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
          ...(outdated.terms && { termsVersion: resolveTermsVersion(versions) }),
          ...(outdated.privacy && { privacyVersion: resolvePrivacyVersion(versions) }),
        }),
      })
      if (!res.ok) throw new Error('Failed to save consent')
      const me = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' }).then(r => r.json())
      auth.login(me) // re-render picks up needsConsent === false, the effect above redirects
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
          {outdated.terms && (
            <div className="border border-navy-800 rounded-lg p-3">
              <p className="font-medium text-navy-200 mb-1">Terms of Use</p>
              <p>{terms?.summary ?? 'The Terms of Use have been updated.'}</p>
            </div>
          )}
          {outdated.privacy && (
            <div className="border border-navy-800 rounded-lg p-3">
              <p className="font-medium text-navy-200 mb-1">Privacy Policy</p>
              <p>{privacy?.summary ?? 'The Privacy Policy has been updated.'}</p>
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
            {isNewUser ? (
              <>
                I have read and agree to the{' '}
                <Link href="/terms" target="_blank" className="text-brand-400 underline hover:text-brand-300">
                  Terms &amp; Conditions
                </Link>{' '}
                and{' '}
                <Link href="/privacy" target="_blank" className="text-brand-400 underline hover:text-brand-300">
                  Privacy Policy
                </Link>
              </>
            ) : (
              <>
                I have read and agree to the updated {outdated.terms && (
                  <Link href="/terms" target="_blank" className="text-brand-400 underline hover:text-brand-300">
                    Terms of Use
                  </Link>
                )}{outdated.terms && outdated.privacy && ' and '}{outdated.privacy && (
                  <Link href="/privacy" target="_blank" className="text-brand-400 underline hover:text-brand-300">
                    Privacy Policy
                  </Link>
                )}
              </>
            )}
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
