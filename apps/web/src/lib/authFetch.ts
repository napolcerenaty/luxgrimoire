const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

export async function authFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
  const hasBody = options?.body !== undefined && options.body !== null
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    // Clear stale token on auth failures (401 = expired/invalid, 403 = forbidden role)
    if ((res.status === 401 || res.status === 403) && typeof window !== 'undefined') {
      localStorage.removeItem('luxgrimoire_token')
      window.location.href = '/login'
    }
    const err = await res.text()
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
