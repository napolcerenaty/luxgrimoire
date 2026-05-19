import { NextRequest, NextResponse } from 'next/server'

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''

export async function GET(request: NextRequest): Promise<NextResponse> {
  const src = request.nextUrl.searchParams.get('src')
  if (!src || !CLOUD) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  // Block hotlinking: allow only requests from our own origin (or no Referer — direct nav / crawlers)
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin
      const appOrigin = request.nextUrl.origin
      if (refererOrigin !== appOrigin) {
        return new NextResponse('Forbidden', { status: 403 })
      }
    } catch {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  const upstream = `https://res.cloudinary.com/${CLOUD}/image/upload/${src}`

  try {
    const res = await fetch(upstream)
    if (!res.ok) {
      return new NextResponse('Not Found', { status: res.status })
    }

    const body = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    // Preserve Cloudinary's cache directives; fall back to 1-year immutable
    const cacheControl = res.headers.get('cache-control') ?? 'public, max-age=31536000, immutable'

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
      },
    })
  } catch {
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
