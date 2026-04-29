import { render, screen, act, waitFor } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { AuthProvider, useAuth } from '../components/AuthProvider'

describe('AuthProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sets loading to false and user to null when no token', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches /auth/me and sets user when token is valid', async () => {
    localStorage.setItem('luxgrimoire_token', 'valid-token')
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'u1', email: 'x@x.com', username: 'x', role: 'USER' }),
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result.current.user).toEqual({ id: 'u1', email: 'x@x.com', username: 'x', role: 'USER' })
  })

  it('removes token from localStorage on 401', async () => {
    localStorage.setItem('luxgrimoire_token', 'expired-token')
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve(null),
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(localStorage.getItem('luxgrimoire_token')).toBeNull()
    expect(result.current.user).toBeNull()
  })

  it('removes token from localStorage on 403', async () => {
    localStorage.setItem('luxgrimoire_token', 'forbidden-token')
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve(null),
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(localStorage.getItem('luxgrimoire_token')).toBeNull()
  })

  it('keeps token on network error (server restarting)', async () => {
    localStorage.setItem('luxgrimoire_token', 'my-token')
    fetchMock.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(localStorage.getItem('luxgrimoire_token')).toBe('my-token')
    expect(result.current.user).toBeNull()
  })

  it('login() sets token in localStorage and updates user state', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const user = { id: 'u2', email: 'a@a.com', username: 'a', role: 'ADMIN' }
    act(() => {
      result.current.login('new-token', user)
    })

    expect(localStorage.getItem('luxgrimoire_token')).toBe('new-token')
    expect(result.current.user).toEqual(user)
  })

  it('logout() removes token from localStorage and sets user to null', async () => {
    localStorage.setItem('luxgrimoire_token', 'valid-token')
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'u1', email: 'x@x.com', username: 'x', role: 'USER' }),
    })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.logout()
    })

    expect(localStorage.getItem('luxgrimoire_token')).toBeNull()
    expect(result.current.user).toBeNull()
  })

  it('useAuth() throws when used outside AuthProvider', () => {
    // Suppress the expected React error boundary console.error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside AuthProvider')
    consoleSpy.mockRestore()
  })
})
