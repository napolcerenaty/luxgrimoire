import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://luxgrimoire.com'

  const staticRoutes: MetadataRoute.Sitemap = [
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

  return staticRoutes
}
