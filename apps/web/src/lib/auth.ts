// Auth utility — token is now an httpOnly cookie, not accessible to JS.
// Use useAuth() from AuthProvider for auth state.

/** @deprecated Use useAuth().user !== null instead */
export function isAuthenticated(): boolean {
  // Cannot check httpOnly cookie from JS — use AuthProvider state
  return false
}
