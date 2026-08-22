import { authFetch } from '../lib/authFetch'

describe('authFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
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

  it('sends credentials: include', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
      json: () => Promise.resolve({}),
    })
    await authFetch('/test')
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
  })

  it('does not send Authorization header', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
      json: () => Promise.resolve({}),
    })
    await authFetch('/test')
    const headers = fetchMock.mock.calls[0][1].headers ?? {}
    expect(headers['Authorization']).toBeUndefined()
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

  it('redirects and throws on 401', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: (_h: string) => null },
      text: () => Promise.resolve('Unauthorized'),
    })
    await expect(authFetch('/test')).rejects.toThrow('Unauthorized')
    expect(window.location.href).toBe('/login')
  })

  it('throws on 403 without redirecting', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: (_h: string) => null },
      text: () => Promise.resolve('Forbidden'),
    })
    await expect(authFetch('/test')).rejects.toThrow('Forbidden')
    expect(window.location.href).not.toBe('/login')
  })

  it('throws on 500 without redirecting', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: (_h: string) => null },
      text: () => Promise.resolve('Server Error'),
    })
    await expect(authFetch('/test')).rejects.toThrow('Server Error')
    expect(window.location.href).not.toBe('/login')
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
