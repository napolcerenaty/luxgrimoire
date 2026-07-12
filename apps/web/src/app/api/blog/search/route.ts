import { NextRequest, NextResponse } from 'next/server'

const GHOST_URL = (process.env.GHOST_API_URL ?? 'http://localhost:2368').replace(/\/$/, '')
const GHOST_KEY = process.env.GHOST_CONTENT_API_KEY ?? ''

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json([])
  if (!GHOST_KEY) return NextResponse.json([])

  const safe = q.replace(/'/g, '')
  const url = `${GHOST_URL}/ghost/api/content/posts/?key=${GHOST_KEY}&filter=title:~'${encodeURIComponent(safe)}'&include=tags&limit=20&order=published_at+DESC&fields=id,title,slug,excerpt,custom_excerpt,feature_image,reading_time,published_at`

  try {
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(data?.posts ?? [])
  } catch {
    return NextResponse.json([])
  }
}
