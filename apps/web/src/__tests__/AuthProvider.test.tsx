import { render, screen, act, waitFor } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { AuthProvider, useAuth } from '../components/AuthProvider'

describe('AuthProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('always fetches /auth/me on mount', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve(null) })
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
  })

  it('sets loading to false and user to null when /auth/me returns 401', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve(null) })
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('sets user when /auth/me returns 200', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'u1', email: 'x@x.com', username: 'x', role: 'USER' }),
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.user).toEqual({ id: 'u1', email: 'x@x.com', username: 'x', role: 'USER' })
  })

  it('sets user to null on network error', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('login() updates user state without touching localStorage', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve(null) })
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const user = { id: 'u2', email: 'a@a.com', username: 'a', role: 'ADMIN' }
    act(() => {
      result.current.login(user)
    })

    expect(result.current.user).toEqual(user)
    expect(typeof localStorage.getItem('luxgrimoire_token')).toBe('object') // null
  })

  it('logout() calls /auth/logout with credentials:include and sets user to null', async () => {
    // First call: /auth/me → logged in
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'u1', email: 'x@x.com', username: 'x', role: 'USER' }),
      })
      // Second call: /auth/logout → 204
      .mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve(null) })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).not.toBeNull()

    await act(async () => {
      await result.current.logout()
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1].credentials).toBe('include')
    expect(fetchMock.mock.calls[1][1].method).toBe('POST')
    expect(result.current.user).toBeNull()
  })

  it('useAuth() throws when used outside AuthProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside AuthProvider')
    consoleSpy.mockRestore()
  })
})
