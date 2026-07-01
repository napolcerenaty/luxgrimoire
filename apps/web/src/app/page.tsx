import type { Metadata } from 'next'
import Link from 'next/link'
import { API_BASE } from '@/lib/authFetch'
import { apiFetch } from '@/lib/api'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { EditionCarousel, type CarouselCard } from '@/components/ui/EditionCarousel'
import { HomeAnnouncementsSection } from '@/components/sales/HomeAnnouncementsSection'
import { HomeStatsBar } from '@/components/home/HomeStatsBar'
import { HomeTrendingEditions } from '@/components/home/HomeTrendingEditions'
import { HomeTrendingSales } from '@/components/home/HomeTrendingSales'
import { SaleCountdownBanner } from '@/components/home/SaleCountdownBanner'
import { HomeAuthSection } from '@/components/home/HomeAuthSection'
import type {
  ApiBookEdition,
  ApiPlatformStats,
  ApiSaleAnnouncement,
  ApiTrendingEdition,
  ApiTrendingSaleAnnouncement,
  PaginatedResponse,
} from '@luxgrimoire/shared-types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Luxury Book Editions & Subscription Boxes',
  description:
    'Discover luxury special editions, track your book collection, and follow subscription boxes from Illumicrate, FairyLoot, and more.',
}

async function fetchCachedPublic<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

async function getHomeData() {
  const [announcementsRes, editionsRes, platformStats, trendingEditions, trendingSales] = await Promise.all([
    apiFetch<PaginatedResponse<ApiSaleAnnouncement>>('/announcements?upcoming=true&pageSize=20').catch(() => null),
    apiFetch<PaginatedResponse<ApiBookEdition>>('/editions?pageSize=12').catch(() => null),
    fetchCachedPublic<ApiPlatformStats>('/platform/stats').catch(() => null),
    fetchCachedPublic<ApiTrendingEdition[]>('/editions/trending?limit=8').catch(() => null),
    fetchCachedPublic<ApiTrendingSaleAnnouncement[]>('/announcements/trending?limit=6').catch(() => null),
  ])

  return {
    announcements: announcementsRes?.data ?? [],
    recentEditions: editionsRes?.data ?? [],
    platformStats,
    trendingEditions: trendingEditions ?? [],
    trendingSales: trendingSales ?? [],
  }
}

export default async function HomePage() {
  const { announcements, recentEditions, platformStats, trendingEditions, trendingSales } = await getHomeData()

  const recentEditionCards: CarouselCard[] = recentEditions.map((e) => {
    const authors = e.book?.authors?.map((a) => a.name).join(', ') ?? null
    return {
      id: e.id,
      href: `/editions/${e.slug}`,
      coverImage: resolveEditionCoverRaw(e),
      title: e.book?.title ?? 'Unknown',
      subtitle: e.book?.seriesName
        ? `${e.book.seriesName}${e.book.volumeNumber != null ? ` #${e.book.volumeNumber}` : ''}`
        : null,
      author: authors,
      ribbon: e.bookBoxCompanyCustomName ?? e.bookBoxCompany?.name ?? null,
      brandColors: e.bookBoxCompany?.brandColors ?? null,
    }
  })

  return (
    <div>
      {/* Hero + HomeFeaturesSection — client-side auth via useAuth() */}
      <HomeAuthSection />

      {platformStats && <HomeStatsBar {...platformStats} />}

      {announcements.length > 0 && <SaleCountdownBanner announcements={announcements} />}

      <HomeAnnouncementsSection
        announcements={announcements}
        viewAllHref="/sale-announcements"
      />

      {announcements.length > 0 && (
        <div className="container mx-auto px-4 -mt-4 mb-2 text-center">
          <p className="text-sm text-stone-400">
            Have you seen an announcement?{' '}
            <Link href="/sale-announcement-requests" className="text-amber-500 hover:text-amber-400 underline underline-offset-2 transition-colors">
              Let us know!
            </Link>
          </p>
        </div>
      )}

      <HomeTrendingEditions editions={trendingEditions} />

      <HomeTrendingSales announcements={trendingSales} />

      <EditionCarousel
        title="Recently Added Editions"
        cards={recentEditionCards}
        centered
      />
    </div>
  )
}

