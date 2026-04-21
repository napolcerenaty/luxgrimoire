export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('luxgrimoire_token')
}

export function setToken(token: string): void {
  localStorage.setItem('luxgrimoire_token', token)
}

export function clearToken(): void {
  localStorage.removeItem('luxgrimoire_token')
}

export function isAuthenticated(): boolean {
  return !!getToken()
}
