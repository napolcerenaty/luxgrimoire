import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://luxgrimoire.com'

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
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
