import { API_BASE } from './authFetch'

/** Fire-and-forget analytics ping — same pattern as BlogViewTracker, just reusable across the
 *  calendar view/download tracking call sites. `credentials: 'include'` so @OptionalAuth()
 *  endpoints can resolve a logged-in user; never throws. */
export function trackEvent(path: string, params?: Record<string, string>): void {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : ''
  fetch(`${API_BASE}${path}${qs}`, { credentials: 'include' }).catch(() => {})
}
