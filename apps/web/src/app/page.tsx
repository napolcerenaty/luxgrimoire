import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { API_BASE } from '@/lib/authFetch'
import { apiFetch } from '@/lib/api'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { EditionCarousel, type CarouselCard } from '@/components/ui/EditionCarousel'
import { HomeAnnouncementsSection } from '@/components/sales/HomeAnnouncementsSection'
import { HomeFeaturesSection } from '@/components/home/HomeFeaturesSection'
import { HomeStatsBar } from '@/components/home/HomeStatsBar'
import { HomeTrendingEditions } from '@/components/home/HomeTrendingEditions'
import { HomeTrendingSales } from '@/components/home/HomeTrendingSales'
import { SaleCountdownBanner } from '@/components/home/SaleCountdownBanner'
import { PersonalizedHero } from '@/components/home/PersonalizedHero'
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

  if (!res.ok) {
    throw new Error(`API error ${res.status}`)
  }

  return res.json()
}

function GenericHero() {
  return (
    <section
      className="relative overflow-hidden px-4 py-14 text-center"
      style={{ background: 'var(--hero-bg)' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'var(--hero-glow)' }}
      />
      <div className="relative container mx-auto max-w-3xl">
        <h1
          className="mb-4 font-serif text-4xl font-bold tracking-wide text-amber-400 sm:text-6xl sm:tracking-widest lg:text-7xl"
          style={{ textShadow: '0 0 40px rgba(0,150,200,0.35)' }}
        >
          LuxGrimoire
        </h1>
        <p className="mb-5 font-serif text-xs font-semibold uppercase tracking-[0.3em] text-[#1a4f6e] dark:text-[#4a88a8]">
          Limited books.<br className="sm:hidden" /> Unlimited obsession.
        </p>
        <p className="mx-auto mb-7 max-w-xl text-sm leading-relaxed text-stone-400">
          Track special editions, manage your collection, follow subscription boxes,
          and keep up with your book spending — all in one place.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/companies"
            className="rounded-full bg-amber-600 px-6 py-3 font-serif text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-500"
          >
            Browse Book Boxes
          </Link>
          <Link
            href="/subscriptions"
            className="rounded-full border border-stone-600 px-6 py-3 font-serif text-sm text-stone-300 transition-colors hover:border-stone-400 hover:text-stone-100"
          >
            Browse Subscriptions
          </Link>
        </div>
      </div>
    </section>
  )
}

async function getHomeData() {
  const [announcementsRes, editionsRes, platformStats, trendingEditions, trendingSales] = await Promise.all([
    apiFetch<PaginatedResponse<ApiSaleAnnouncement>>('/announcements?upcoming=true&pageSize=12').catch(() => null),
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
      <Suspense fallback={<GenericHero />}>
        <PersonalizedHero />
      </Suspense>

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

      <HomeFeaturesSection />

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
