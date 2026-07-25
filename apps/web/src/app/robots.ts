import type { MetadataRoute } from 'next'
import { buildAllUrls, MAX_URLS_PER_SITEMAP } from './sitemap'

// Must match sitemap.ts's `revalidate` literal exactly (604800 = 7 days) — this file also needs
// to know the current shard count, which can only drift in sync with the sitemap's own
// regeneration cadence. Can't import it: Next.js's route segment config requires `revalidate`
// to be a statically analyzable literal in each file, not an imported value.
export const revalidate = 604800

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://luxgrimoire.com'

  // generateSitemaps() in sitemap.ts serves shards at /sitemap/{id}.xml, not a single
  // /sitemap.xml — list every shard so Search Console picks up all of them. buildAllUrls()'s
  // own fetch is deduped/cached by Next's Data Cache, so this doesn't trigger an extra
  // API/DB round-trip beyond what sitemap.ts already does within the same revalidation window.
  const totalUrls = (await buildAllUrls()).length
  const shardCount = Math.max(1, Math.ceil(totalUrls / MAX_URLS_PER_SITEMAP))
  const sitemaps = Array.from({ length: shardCount }, (_, id) => `${baseUrl}/sitemap/${id}.xml`)

  return {
    rules: [
      {
        // Allow all crawlers on public content
        userAgent: '*',
        allow: [
          '/',
          '/about',
          '/artists',
          '/authors',
          '/books',
          '/companies',
          '/contact',
          '/editions',
          '/faq',
          '/privacy',
          '/sale-announcements',
          '/search',
          '/series',
          '/subscriptions',
          '/terms',
          '/support',
        ],
        disallow: [
          // Private user pages
          '/calendar',
          '/collection',
          '/my-subscriptions',
          '/notifications',
          '/profile',
          '/sold',
          '/spending',
          '/wishlist',
          // Admin panel
          '/admin',
          // Auth flows
          '/login',
          '/register',
          '/callback',
          '/check-email',
          '/consent',
          '/forgot-password',
          '/resend-verification',
          '/reset-password',
          '/verify-email',
          // API
          '/api/',
          // Internal/moderation
          '/data-requests',
          '/report',
          '/sale-announcement-requests',
          '/feature-requests',
        ],
      },
      {
        // Block all AI training crawlers explicitly
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'CCBot',
          'anthropic-ai',
          'Claude-Web',
          'ClaudeBot',
          'Google-CloudVertexBot',
          'Omgilibot',
          'FacebookBot',
          'Bytespider',
          'PetalBot',
          'Diffbot',
        ],
        disallow: ['/'],
      },
    ],
    sitemap: sitemaps,
  }
}
