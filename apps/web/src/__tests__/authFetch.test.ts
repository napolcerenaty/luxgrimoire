import { authFetch } from '../lib/authFetch'

describe('authFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    localStorage.clear()
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on 200', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
      json: () => Promise.resolve({ data: 'ok' }),
    })
    const result = await authFetch('/test')
    expect(result).toEqual({ data: 'ok' })
  })

  it('resolves with undefined on 204 No Content', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: (_h: string) => null },
      json: () => Promise.resolve(null),
    })
    const result = await authFetch('/test')
    expect(result).toBeUndefined()
  })

  it('clears token and throws on 401', async () => {
    localStorage.setItem('luxgrimoire_token', 'expired-token')
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: (_h: string) => null },
      text: () => Promise.resolve('Unauthorized'),
    })
    await expect(authFetch('/test')).rejects.toThrow('Unauthorized')
    expect(localStorage.getItem('luxgrimoire_token')).toBeNull()
  })

  it('clears token and throws on 403', async () => {
    localStorage.setItem('luxgrimoire_token', 'some-token')
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: (_h: string) => null },
      text: () => Promise.resolve('Forbidden'),
    })
    await expect(authFetch('/test')).rejects.toThrow('Forbidden')
    expect(localStorage.getItem('luxgrimoire_token')).toBeNull()
  })

  it('throws on 500 without clearing token', async () => {
    localStorage.setItem('luxgrimoire_token', 'some-token')
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: (_h: string) => null },
      text: () => Promise.resolve('Server Error'),
    })
    await expect(authFetch('/test')).rejects.toThrow('Server Error')
    expect(localStorage.getItem('luxgrimoire_token')).toBe('some-token')
  })

  it('makes request without Authorization header when no token in localStorage', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
      json: () => Promise.resolve({}),
    })
    await authFetch('/test')
    const calledHeaders = fetchMock.mock.calls[0][1].headers
    expect(calledHeaders['Authorization']).toBeUndefined()
  })

  it('adds Authorization Bearer header when token is in localStorage', async () => {
    localStorage.setItem('luxgrimoire_token', 'my-jwt-token')
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
      json: () => Promise.resolve({}),
    })
    await authFetch('/test')
    const calledHeaders = fetchMock.mock.calls[0][1].headers
    expect(calledHeaders['Authorization']).toBe('Bearer my-jwt-token')
  })

  it('resolves with undefined for non-JSON content-type', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === 'content-type' ? 'text/plain' : null) },
      json: () => Promise.resolve('should not be called'),
    })
    const result = await authFetch('/test')
    expect(result).toBeUndefined()
  })
})
