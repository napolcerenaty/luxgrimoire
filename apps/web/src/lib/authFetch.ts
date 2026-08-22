// Server-side (SSR): use API_URL (internal Docker network) if set, else fall back to public URL.
// Client-side: always use NEXT_PUBLIC_API_URL (baked at build time).
export const API_BASE =
  typeof window === 'undefined'
    ? (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api')
    : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api')

export async function authFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body !== undefined && options.body !== null
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    // 401 means the session itself is invalid/expired -- bounce to login. 403 means the user
    // IS authenticated but lacks permission for this specific action (wrong role, doesn't own
    // the resource, etc.) -- that must surface as an error for the caller to show, never a
    // forced logout. Thrown across the app by RolesGuard and many ownership checks
    // (assert-ownership.util.ts, assert-company-access.util.ts, service-level checks), so this
    // distinction matters everywhere, not just one page.
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    throw new Error(err)
  }
  // 204 No Content or empty body — return undefined without trying to parse JSON
  const contentLength = res.headers.get('content-length')
  const contentType = res.headers.get('content-type') ?? ''
  if (res.status === 204 || contentLength === '0' || !contentType.includes('application/json')) {
    return undefined as unknown as T
  }
  return res.json() as Promise<T>
}
