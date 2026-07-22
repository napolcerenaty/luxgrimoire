/**
 * Anonymous-visitor read cursor for the news feed (spec section 8.2).
 * A single timestamp, not a per-item list — same semantics as the logged-in
 * `User.newsLastSeenAt` cursor, just kept client-side instead of in the DB.
 *
 * NOTE: set via document.cookie (not a server Set-Cookie header) — the spec's
 * ideal was server-side setting for a flicker-free SSR badge, but the API and
 * web app are separate origins here, and cross-origin cookie issuance adds
 * meaningful complexity for what is a low-stakes UX polish detail. This still
 * delivers the actual behavior (anonymous unread counting that survives
 * repeat visits) — only the "no flash of 0 before hydration" refinement is
 * deferred.
 */

const COOKIE_NAME = 'news_last_seen_at'
const MAX_AGE_SECONDS = 395 * 24 * 60 * 60 // 13 months, spec 8.2

export function getNewsLastSeenCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

export function setNewsLastSeenCookie(iso: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(iso)}; max-age=${MAX_AGE_SECONDS}; path=/; SameSite=Lax`
}
