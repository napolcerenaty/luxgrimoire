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
  featured: boolean
  tags: GhostTag[]
  authors: GhostAuthor[]
  primary_tag: GhostTag | null
}

// ── Tag slug helpers ───────────────────────────────────────────────────────────
// Ghost internal tags (#name) are stored with slug "hash-name"
export function hasInternalTag(post: GhostPost, name: string): boolean {
  const slug = 'hash-' + name.replace(/^#/, '').toLowerCase()
  return post.tags.some(t => t.slug === slug)
}

const SPONSORED_LABELS: Record<string, string> = {
  'hash-sponsored':   'Sponsored',
  'hash-paid-collab': 'Paid collaboration',
  'hash-gifted':      'Gifted',
  'hash-press-copy':  'Press copy',
  'hash-barter':      'Barter',
}

export function getSponsoredLabel(post: GhostPost): string | null {
  for (const tag of post.tags) {
    if (SPONSORED_LABELS[tag.slug]) return SPONSORED_LABELS[tag.slug]
  }
  return null
}

export interface GhostTag {
  id: string
  name: string
  slug: string
  description: string | null
  feature_image: string | null
  accent_color: string | null
  count?: { posts: number }
}

export interface GhostAuthor {
  id: string
  name: string
  slug: string
  profile_image: string | null
  bio: string | null
}

async function ghostFetch<T>(
  resource: string,
  params: Record<string, string> = {},
): Promise<T | null> {
  const GHOST_URL = (process.env.GHOST_API_URL ?? 'http://localhost:2368').replace(/\/$/, '')
  const GHOST_KEY = process.env.GHOST_CONTENT_API_KEY ?? ''
  if (!GHOST_KEY) return null
  const url = new URL(`${GHOST_URL}/ghost/api/content/${resource}/`)
  url.searchParams.set('key', GHOST_KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 60 } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[ghost] ${res.status} ${res.statusText} for ${GHOST_URL}/ghost/api/content/${resource}/ — ${body.slice(0, 300)}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.error(`[ghost] fetch failed for ${GHOST_URL}/ghost/api/content/${resource}/ —`, err)
    return null
  }
}

export async function getPosts(limit = 10): Promise<GhostPost[]> {
  const data = await ghostFetch<{ posts: GhostPost[] }>('posts', {
    include: 'tags,authors',
    limit: String(limit),
    order: 'published_at DESC',
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

export async function getTagBySlug(slug: string): Promise<GhostTag | null> {
  const data = await ghostFetch<{ tags: GhostTag[] }>(`tags/slug/${slug}`, {})
  return data?.tags?.[0] ?? null
}

export async function searchPosts(query: string, limit = 20): Promise<GhostPost[]> {
  if (!query.trim()) return []
  const data = await ghostFetch<{ posts: GhostPost[] }>('posts', {
    include: 'tags,authors',
    limit: String(limit),
    order: 'published_at DESC',
    filter: `title:~'${query.replace(/'/g, '')}'`,
  })
  return data?.posts ?? []
}

export async function getPostsByTag(tagSlug: string, limit = 4, excludeSlug?: string): Promise<GhostPost[]> {
  const data = await ghostFetch<{ posts: GhostPost[] }>('posts', {
    include: 'tags,authors',
    limit: String(limit + 1),
    order: 'published_at DESC',
    filter: `tag:${tagSlug}`,
  })
  const posts = data?.posts ?? []
  return posts.filter(p => p.slug !== excludeSlug).slice(0, limit)
}

export async function getTags(limit = 20): Promise<GhostTag[]> {
  // filter=count.posts:>0 currently 400s on this Ghost instance (ER_BAD_FIELD_ERROR) —
  // order by count.posts works fine, so filter out zero-count tags client-side instead.
  const data = await ghostFetch<{ tags: GhostTag[] }>('tags', {
    limit: String(limit),
    include: 'count.posts',
    order: 'count.posts DESC',
  })
  // Internal tags (name "#hero-1" etc, slug "hash-hero-1") are metadata used to pick hero-slot
  // posts and sponsorship labels (see hasInternalTag/SPONSORED_LABELS above) — never a real
  // content category, so they must never surface as a public nav/filter pill.
  return (data?.tags ?? []).filter(t => (t.count?.posts ?? 0) > 0 && !t.slug.startsWith('hash-'))
}
