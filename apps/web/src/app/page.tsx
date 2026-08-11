import type { Metadata } from 'next'
import Link from 'next/link'
import { API_BASE } from '@/lib/authFetch'
import { apiFetch } from '@/lib/api'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { formatVolumeNumbers } from '@/lib/volumeNumbers'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'
import { EditionCarousel, type CarouselCard } from '@/components/ui/EditionCarousel'
import { HomeAnnouncementsSection } from '@/components/sales/HomeAnnouncementsSection'
import { HomeStatsBar } from '@/components/home/HomeStatsBar'
import { HomeTrendingEditions } from '@/components/home/HomeTrendingEditions'
import { HomeTrendingSales } from '@/components/home/HomeTrendingSales'
import { SaleCountdownBanner } from '@/components/home/SaleCountdownBanner'
import { HomeAuthSection, HomeGuestFeatures } from '@/components/home/HomeAuthSection'
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
  title: 'LuxGrimoire - special edition books and subscriptions tracker',
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

export interface HomeNextSale {
  date: string | null
  tier: string | null
  announcementId: string | null
  title: string | null
  personalized: boolean
}

async function getHomeData() {
  const [announcementsRes, editionsRes, platformStats, trendingEditions, trendingSales, nextSale] = await Promise.all([
    apiFetch<PaginatedResponse<ApiSaleAnnouncement>>('/announcements?upcoming=true&pageSize=20').catch(() => null),
    apiFetch<PaginatedResponse<ApiBookEdition>>('/editions?pageSize=12').catch(() => null),
    fetchCachedPublic<ApiPlatformStats>('/platform/stats').catch(() => null),
    fetchCachedPublic<ApiTrendingEdition[]>('/editions/trending?limit=8').catch(() => null),
    fetchCachedPublic<ApiTrendingSaleAnnouncement[]>('/announcements/trending?limit=6').catch(() => null),
    // Dedicated global "next sale" lookup (soonest tier across every company) — the announcements
    // list above is capped to the 20 most-recently-created sales, which can exclude the true
    // soonest-dated one entirely, so it must not be used to derive the countdown target.
    apiFetch<HomeNextSale>('/announcements/next-sale').catch(() => null),
  ])

  return {
    announcements: announcementsRes?.data ?? [],
    recentEditions: editionsRes?.data ?? [],
    platformStats,
    trendingEditions: trendingEditions ?? [],
    trendingSales: trendingSales ?? [],
    nextSale,
  }
}

export default async function HomePage() {
  const { announcements, recentEditions, platformStats, trendingEditions, trendingSales, nextSale } = await getHomeData()

  const recentEditionCards: CarouselCard[] = recentEditions.map((e) => {
    const authors = e.book?.authors?.map((a) => a.name).join(', ') ?? null
    return {
      id: e.id,
      href: `/editions/${e.slug}`,
      coverImage: resolveEditionCoverRaw(e),
      title: formatEditionDisplayTitle(e.book, e) || 'Unknown',
      subtitle: e.book?.seriesName
        ? `${e.book.seriesName}${e.book.volumeNumbers?.length ? ` #${formatVolumeNumbers(e.book.volumeNumbers)}` : ''}`
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

      {/* Features section — only for guests, after stats bar */}
      <HomeGuestFeatures />

      {nextSale?.date && nextSale.announcementId && nextSale.title && (
        <SaleCountdownBanner
          nextSale={{ date: nextSale.date, announcementId: nextSale.announcementId, title: nextSale.title }}
        />
      )}

      <HomeAnnouncementsSection
        announcements={announcements}
        viewAllHref="/sale-announcements"
      />

      {announcements.length > 0 && (
        <div className="container mx-auto px-4 -mt-4 mb-2 text-center">
          <p className="text-xs uppercase tracking-widest text-brand-600 font-medium">
            Have you seen an announcement?{' '}
            <Link href="/sale-announcement-requests" className="underline underline-offset-2 hover:text-brand-400 transition-colors">
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

