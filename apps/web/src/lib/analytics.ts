import { API_BASE } from './authFetch'

export async function getBlogPostViewCount(slug: string): Promise<number> {
  try {
    const res = await fetch(
      `${API_BASE}/analytics/public/blog-post-view-count?slug=${encodeURIComponent(slug)}`,
      { next: { revalidate: 60 } },
    )
    if (!res.ok) return 0
    const data = await res.json()
    return typeof data?.count === 'number' ? data.count : 0
  } catch {
    return 0
  }
}
