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
    if ((res.status === 401 || res.status === 403) && typeof window !== 'undefined') {
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
