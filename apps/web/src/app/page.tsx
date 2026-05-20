import type { Metadata } from 'next'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { EditionCarousel, type CarouselCard } from '@/components/ui/EditionCarousel'
import { HomeAnnouncementsSection } from '@/components/sales/HomeAnnouncementsSection'
import type { ApiBookEdition, ApiSaleAnnouncement, PaginatedResponse } from '@luxgrimoire/shared-types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Luxury Book Editions & Subscription Boxes',
  description:
    'Discover luxury special editions, track your book collection, and follow subscription boxes from Illumicrate, FairyLoot, and more.',
}

async function getHomeData() {
  const [announcementsRes, editionsRes] = await Promise.all([
    apiFetch<PaginatedResponse<ApiSaleAnnouncement>>('/announcements?upcoming=true&pageSize=12').catch(() => null),
    apiFetch<PaginatedResponse<ApiBookEdition>>('/editions?pageSize=12').catch(() => null),
  ])
  return {
    announcements: announcementsRes?.data ?? [],
    recentEditions: editionsRes?.data ?? [],
  }
}

export default async function HomePage() {
  const { announcements, recentEditions } = await getHomeData()

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
      {/* Hero */}
      <section
        className="relative overflow-hidden py-14 px-4 text-center"
        style={{ background: 'var(--hero-bg)' }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'var(--hero-glow)' }}
        />
        <div className="relative container mx-auto max-w-3xl">
          <h1
            className="text-4xl sm:text-6xl lg:text-7xl font-serif font-bold text-amber-400 mb-4 tracking-wide sm:tracking-widest"
            style={{ textShadow: '0 0 40px rgba(0,150,200,0.35)' }}
          >
            LuxGrimoire
          </h1>
          <p className="text-xs font-serif uppercase tracking-[0.3em] font-semibold text-[#1a4f6e] dark:text-[#4a88a8] mb-5">
            Limited books.<br className="sm:hidden" /> Unlimited obsession.
          </p>
          <p className="text-sm text-stone-400 max-w-xl mx-auto mb-7 leading-relaxed">
            Track special editions, manage your collection, follow subscription boxes,
            and keep up with your book spending — all in one place.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/companies"
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-stone-950 font-serif font-semibold rounded-full transition-colors text-sm"
            >
              Browse Book Boxes
            </Link>
            <Link
              href="/subscriptions"
              className="px-6 py-3 border border-stone-600 hover:border-stone-400 text-stone-300 hover:text-stone-100 font-serif rounded-full transition-colors text-sm"
            >
              Browse Subscriptions
            </Link>
          </div>
        </div>
      </section>

      {/* Recent Announcements carousel — clicking a card opens modal */}
      <HomeAnnouncementsSection
        announcements={announcements}
        viewAllHref="/sale-announcements"
      />

      {/* CTA below announcements — only shown when announcements are present */}
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

      {/* Recently Added Editions carousel */}
      <EditionCarousel
        title="Recently Added Editions"
        cards={recentEditionCards}
        centered
      />

    </div>
  )
}
