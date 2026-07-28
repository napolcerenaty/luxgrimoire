import type { MetadataRoute } from 'next'

// Regenerated on every production deploy (next build fetches real data through the public API —
// apps/web never talks to Postgres directly, see NEXT_PUBLIC_API_URL in deploy.yml) and then
// revalidated in the background on this schedule between deploys, so content added without a
// deploy still surfaces automatically. Matches the API-side cache TTL in
// apps/api/src/modules/sitemap/sitemap.service.ts — keep both in sync if this changes.
//
// Must be a literal number, not an expression — Next.js's route segment config requires
// `revalidate` to be statically analyzable (60 * 60 * 24 * 7 is rejected at build time).
// 604800 = 7 days. robots.ts duplicates this same literal for the same reason (it also can't
// import it — same static-analysis requirement applies there too).
export const revalidate = 604800

// Google's hard limit is 50,000 URLs per sitemap file — this margin gives buildAllUrls() and
// generateSitemaps() room to agree on a shard count without either rounding differently.
export const MAX_URLS_PER_SITEMAP = 45_000

interface SitemapDataEntry {
  slug: string
  updatedAt: string
}

interface SitemapApiResponse {
  books: SitemapDataEntry[]
  editions: SitemapDataEntry[]
  authors: SitemapDataEntry[]
  artists: SitemapDataEntry[]
  companies: SitemapDataEntry[]
  series: SitemapDataEntry[]
  subscriptions: SitemapDataEntry[]
  saleAnnouncements: { id: string; updatedAt: string }[]
}

async function fetchSitemapData(): Promise<SitemapApiResponse | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
  try {
    const res = await fetch(`${apiUrl}/sitemap/data`, { next: { revalidate } })
    if (!res.ok) throw new Error(`sitemap data fetch failed: ${res.status}`)
    return await res.json()
  } catch (err) {
    // Never let a transient API hiccup fail the entire production build/deploy over this —
    // fall back to the static routes only; the next successful revalidation (or deploy) fixes it.
    // eslint-disable-next-line no-console
    console.error('[sitemap] failed to fetch dynamic content, falling back to static routes only', err)
    return null
  }
}

function staticRoutes(baseUrl: string): MetadataRoute.Sitemap {
  return [
    { url: baseUrl, priority: 1.0, changeFrequency: 'daily' },
    { url: `${baseUrl}/sale-announcements`, priority: 0.9, changeFrequency: 'daily' },
    { url: `${baseUrl}/subscriptions`, priority: 0.8, changeFrequency: 'weekly' },
    { url: `${baseUrl}/books`, priority: 0.7, changeFrequency: 'weekly' },
    { url: `${baseUrl}/series`, priority: 0.7, changeFrequency: 'weekly' },
    { url: `${baseUrl}/authors`, priority: 0.6, changeFrequency: 'weekly' },
    { url: `${baseUrl}/artists`, priority: 0.6, changeFrequency: 'weekly' },
    { url: `${baseUrl}/companies`, priority: 0.6, changeFrequency: 'weekly' },
    { url: `${baseUrl}/search`, priority: 0.5, changeFrequency: 'always' },
    { url: `${baseUrl}/about`, priority: 0.4, changeFrequency: 'monthly' },
    { url: `${baseUrl}/faq`, priority: 0.4, changeFrequency: 'monthly' },
    { url: `${baseUrl}/contact`, priority: 0.3, changeFrequency: 'monthly' },
    { url: `${baseUrl}/privacy`, priority: 0.3, changeFrequency: 'monthly' },
    { url: `${baseUrl}/terms`, priority: 0.3, changeFrequency: 'monthly' },
  ]
}

function mapEntries(
  baseUrl: string,
  entries: SitemapDataEntry[],
  pathPrefix: string,
  priority: number,
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>,
): MetadataRoute.Sitemap {
  return entries.map((e) => ({
    url: `${baseUrl}/${pathPrefix}/${e.slug}`,
    lastModified: e.updatedAt,
    priority,
    changeFrequency,
  }))
}

/**
 * Builds the full, unsharded URL list. Called once per shard (by both generateSitemaps() and
 * sitemap()) — the underlying fetch is deduped/cached by Next's Data Cache within the same
 * revalidation window, so this doesn't mean N re-fetches for N shards.
 */
export async function buildAllUrls(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://luxgrimoire.com'
  const data = await fetchSitemapData()
  if (!data) return staticRoutes(baseUrl)

  return [
    ...staticRoutes(baseUrl),
    ...mapEntries(baseUrl, data.editions, 'editions', 0.6, 'monthly'),
    ...mapEntries(baseUrl, data.books, 'books', 0.6, 'monthly'),
    ...mapEntries(baseUrl, data.series, 'series', 0.5, 'monthly'),
    ...mapEntries(baseUrl, data.authors, 'authors', 0.4, 'monthly'),
    ...mapEntries(baseUrl, data.artists, 'artists', 0.4, 'monthly'),
    ...mapEntries(baseUrl, data.companies, 'companies', 0.5, 'weekly'),
    ...mapEntries(baseUrl, data.subscriptions, 'subscriptions', 0.6, 'weekly'),
    ...data.saleAnnouncements.map((s) => ({
      url: `${baseUrl}/sale-announcements/${s.id}`,
      lastModified: s.updatedAt,
      priority: 0.7,
      changeFrequency: 'weekly' as const,
    })),
  ]
}

export async function generateSitemaps() {
  const all = await buildAllUrls()
  const count = Math.max(1, Math.ceil(all.length / MAX_URLS_PER_SITEMAP))
  return Array.from({ length: count }, (_, id) => ({ id }))
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const all = await buildAllUrls()
  const start = id * MAX_URLS_PER_SITEMAP
  return all.slice(start, start + MAX_URLS_PER_SITEMAP)
}
