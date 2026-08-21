import type { LegalVersionsResponse, LegalDocVersion } from '@/app/api/legal/versions/route'

export type { LegalVersionsResponse, LegalDocVersion }

const EMPTY_VERSIONS: LegalVersionsResponse = { terms: null, privacy: null }

// Used only while a doc hasn't been migrated to a Ghost Page yet (getPage returns null) —
// keeps registration/consent working end-to-end during that transition. Once both docs are
// published in Ghost, versions.terms/privacy are never null and these are never read.
export const FALLBACK_TERMS_VERSION = '2025-05-01'
export const FALLBACK_PRIVACY_VERSION = '2025-05-01'

/** Concrete version string to submit to the API — never null, even pre-Ghost-migration. */
export function resolveTermsVersion(versions: LegalVersionsResponse): string {
  return versions.terms?.version ?? FALLBACK_TERMS_VERSION
}

export function resolvePrivacyVersion(versions: LegalVersionsResponse): string {
  return versions.privacy?.version ?? FALLBACK_PRIVACY_VERSION
}

/** Fails open (returns nulls) on any network/parse error — a CMS outage must never block users. */
export async function fetchLegalVersions(): Promise<LegalVersionsResponse> {
  try {
    const res = await fetch('/api/legal/versions')
    if (!res.ok) return EMPTY_VERSIONS
    return (await res.json()) as LegalVersionsResponse
  } catch {
    return EMPTY_VERSIONS
  }
}

interface ConsentUser {
  termsAcceptedAt?: string | null
  termsVersion?: string | null
  privacyAcceptedAt?: string | null
  privacyVersion?: string | null
}

export interface ConsentGap {
  needsConsent: boolean
  outdated: { terms: boolean; privacy: boolean }
  terms?: LegalDocVersion
  privacy?: LegalDocVersion
}

/**
 * A doc counts as outdated if the user never accepted it, or if the currently published
 * version (from Ghost, via /api/legal/versions) doesn't match what they last accepted.
 * A doc with no known current version (Ghost unreachable, or not migrated to Ghost yet)
 * is never treated as outdated — fail open.
 */
export function computeConsentGap(user: ConsentUser | null | undefined, versions: LegalVersionsResponse): ConsentGap {
  if (!user) return { needsConsent: false, outdated: { terms: false, privacy: false } }

  const termsOutdated = !user.termsAcceptedAt || (!!versions.terms && user.termsVersion !== versions.terms.version)
  const privacyOutdated = !user.privacyAcceptedAt || (!!versions.privacy && user.privacyVersion !== versions.privacy.version)

  return {
    needsConsent: termsOutdated || privacyOutdated,
    outdated: { terms: termsOutdated, privacy: privacyOutdated },
    terms: termsOutdated ? (versions.terms ?? undefined) : undefined,
    privacy: privacyOutdated ? (versions.privacy ?? undefined) : undefined,
  }
}
