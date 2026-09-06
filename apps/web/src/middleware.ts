import { NextRequest, NextResponse } from 'next/server'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME ?? 'jwt'

// ─── In-process cache for maintenance state (15 second TTL) ───────────────────
let maintenanceCache: { enabled: boolean; message: string; ts: number } | null = null
const CACHE_TTL_MS = 15_000

async function getMaintenanceState(): Promise<{ enabled: boolean; message: string }> {
  const now = Date.now()
  if (maintenanceCache && now - maintenanceCache.ts < CACHE_TTL_MS) {
    return maintenanceCache
  }
  try {
    const res = await fetch(`${API_INTERNAL_URL}/admin/maintenance`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json() as { enabled: boolean; message: string }
      maintenanceCache = { ...data, ts: now }
      return data
    }
  } catch {
    // API unreachable — fail open (don't block users)
  }
  return { enabled: false, message: '' }
}

/** Decode JWT payload without verifying signature (edge-safe, for role check only) */
function getJwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    // Use atob (available in Edge Runtime) instead of Buffer which may not support base64url
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(base64)) as { role?: string }
    return decoded.role ?? null
  } catch {
    return null
  }
}

const ADMIN_ROLES = ['ADMIN', 'MODERATOR']

// ─── First-touch signup attribution (growth roadmap Faza 0) ───────────────────
const ATTRIB_COOKIE = 'lg_src'
const ATTRIB_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

/**
 * If the request carries `?ref=` or any `utm_*` param and no attribution cookie is
 * set yet, stash a compact payload as a readable (non-httpOnly) cookie. First touch
 * wins — an existing cookie is never overwritten. The register page forwards this
 * value to the API, which persists it on `User.signupSource`.
 */
function captureAttribution(request: NextRequest, res: NextResponse): void {
  if (request.cookies.has(ATTRIB_COOKIE)) return

  const sp = request.nextUrl.searchParams
  const payload: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const v = sp.get(key)
    if (v) payload[key.slice(4)] = v.slice(0, 120)
  }
  const ref = sp.get('ref')
  if (ref) payload.ref = ref.slice(0, 120)

  if (Object.keys(payload).length === 0) return

  payload.lp = request.nextUrl.pathname.slice(0, 180)
  payload.t = String(Date.now())

  res.cookies.set(ATTRIB_COOKIE, JSON.stringify(payload), {
    maxAge: ATTRIB_MAX_AGE,
    sameSite: 'lax',
    path: '/',
    httpOnly: false,
  })
}

export async function middleware(request: NextRequest) {
  const res = await route(request)
  captureAttribution(request, res)
  return res
}

async function route(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  // Always allow: maintenance page itself, admin routes, auth routes, API, static files
  if (
    pathname.startsWith('/maintenance') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/verify-email') ||
    pathname.startsWith('/callback') ||
    pathname.startsWith('/consent') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next()
  }

  const maintenance = await getMaintenanceState()
  if (!maintenance.enabled) return NextResponse.next()

  // Check if user is admin — decode JWT cookie (no verification needed for maintenance bypass)
  const token = request.cookies.get(JWT_COOKIE_NAME)?.value
  if (token) {
    const role = getJwtRole(token)
    if (role && ADMIN_ROLES.includes(role)) return NextResponse.next()
  }

  // Redirect to maintenance page
  const url = request.nextUrl.clone()
  url.pathname = '/maintenance'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-.*\\.png|icon\\.png).*)'],
}
