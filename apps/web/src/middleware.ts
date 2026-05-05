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
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: string }
    return decoded.role ?? null
  } catch {
    return null
  }
}

const ADMIN_ROLES = ['ADMIN', 'MODERATOR']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow: maintenance page itself, admin routes, API, static files
  if (
    pathname.startsWith('/maintenance') ||
    pathname.startsWith('/admin') ||
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
