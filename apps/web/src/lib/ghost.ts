export interface GhostPost {
  id: string
  title: string
  slug: string
  excerpt: string | null
  custom_excerpt: string | null
  html: string | null
  feature_image: string | null
  feature_image_alt: string | null
  reading_time: number
  published_at: string
  updated_at: string
  tags: GhostTag[]
  authors: GhostAuthor[]
  primary_tag: GhostTag | null
}

export interface GhostTag {
  id: string
  name: string
  slug: string
  description: string | null
  feature_image: string | null
  accent_color: string | null
}

export interface GhostAuthor {
  id: string
  name: string
  slug: string
  profile_image: string | null
  bio: string | null
}

const GHOST_URL = (process.env.GHOST_API_URL ?? 'http://localhost:2368').replace(/\/$/, '')
const GHOST_KEY = process.env.GHOST_CONTENT_API_KEY ?? ''

async function ghostFetch<T>(
  resource: string,
  params: Record<string, string> = {},
): Promise<T | null> {
  if (!GHOST_KEY) return null
  const url = new URL(`${GHOST_URL}/ghost/api/content/${resource}/`)
  url.searchParams.set('key', GHOST_KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 60 } })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function getPosts(limit = 10): Promise<GhostPost[]> {
  const data = await ghostFetch<{ posts: GhostPost[] }>('posts', {
    include: 'tags,authors',
    limit: String(limit),
    order: 'published_at DESC',
    fields: 'id,title,slug,excerpt,custom_excerpt,feature_image,feature_image_alt,reading_time,published_at,updated_at',
  })
  return data?.posts ?? []
}

export async function getPostBySlug(slug: string): Promise<GhostPost | null> {
  const data = await ghostFetch<{ posts: GhostPost[] }>(`posts/slug/${slug}`, {
    include: 'tags,authors',
  })
  return data?.posts?.[0] ?? null
}

export async function getPage(slug: string): Promise<GhostPost | null> {
  const data = await ghostFetch<{ pages: GhostPost[] }>(`pages/slug/${slug}`, {
    include: 'tags,authors',
  })
  return data?.pages?.[0] ?? null
}

export async function getTags(limit = 20): Promise<GhostTag[]> {
  const data = await ghostFetch<{ tags: GhostTag[] }>('tags', {
    limit: String(limit),
    include: 'count.posts',
    filter: 'count.posts:>0',
    order: 'count.posts DESC',
  })
  return data?.tags ?? []
}
