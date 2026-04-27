import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { EditionCarousel, type CarouselCard } from '@/components/ui/EditionCarousel'
import { HomeAnnouncementsSection } from '@/components/sales/HomeAnnouncementsSection'
import type { ApiSponsoredSlot, ApiBookEdition, ApiSaleAnnouncement, PaginatedResponse } from '@luxgrimoire/shared-types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Luxury Book Editions & Subscription Boxes',
  description:
    'Discover luxury special editions, track your book collection, and follow subscription boxes from Illumicrate, FairyLoot, and more.',
}

async function getHomeData() {
  const [featuredSlots, announcementsRes, editionsRes] = await Promise.all([
    apiFetch<ApiSponsoredSlot[]>('/sponsored/active?slotType=HOMEPAGE_FEATURED').catch(() => [] as ApiSponsoredSlot[]),
    apiFetch<PaginatedResponse<ApiSaleAnnouncement>>('/announcements?upcoming=true&pageSize=12').catch(() => null),
    apiFetch<PaginatedResponse<ApiBookEdition>>('/editions?pageSize=12').catch(() => null),
  ])
  return {
    featuredSlots: Array.isArray(featuredSlots) ? featuredSlots : [],
    announcements: announcementsRes?.data ?? [],
    recentEditions: editionsRes?.data ?? [],
  }
}

export default async function HomePage() {
  const { featuredSlots, announcements, recentEditions } = await getHomeData()

  const recentEditionCards: CarouselCard[] = recentEditions.map((e) => {
    const authors = e.book?.authors?.map((a) => a.name).join(', ') ?? null
    return {
      id: e.id,
      href: `/editions/${e.slug}`,
      coverImage: e.coverImage ?? null,
      title: e.book?.title ?? 'Unknown',
      subtitle: e.book?.seriesName
        ? `${e.book.seriesName}${e.book.volumeNumber != null ? ` #${e.book.volumeNumber}` : ''}`
        : null,
      author: authors,
      ribbon: e.bookBoxCompanyCustomName ?? e.bookBoxCompany?.name ?? null,
    }
  })

  return (
    <div>
      {/* Hero */}
      <section
        className="relative overflow-hidden py-20 px-4 text-center"
        style={{ background: 'linear-gradient(180deg, #060d18 0%, #0a1828 60%, var(--bg) 100%)' }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(0,130,180,0.18) 0%, transparent 65%)' }}
        />
        <div className="relative container mx-auto max-w-3xl">
          <h1
            className="text-5xl sm:text-7xl font-serif font-bold text-amber-400 mb-4 tracking-widest"
            style={{ textShadow: '0 0 40px rgba(0,150,200,0.35)' }}
          >
            LuxGrimoire
          </h1>
          <p className="text-lg sm:text-xl text-stone-300 mb-10 leading-relaxed font-sans">
            Your home for luxury book editions &amp; subscription boxes
          </p>
          <form action="/search" method="get" className="flex items-center max-w-xl mx-auto gap-2">
            <input
              name="q"
              type="text"
              placeholder="Search books, authors, box companies…"
              className="flex-1 bg-stone-800 border border-stone-600 rounded-full px-5 py-3 text-stone-100 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-stone-950 font-serif font-semibold rounded-full transition-colors text-sm whitespace-nowrap"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      {/* Recent Announcements carousel — clicking a card opens modal */}
      <HomeAnnouncementsSection
        announcements={announcements}
        viewAllHref="/sale-announcements"
      />

      {/* CTA below announcements */}
      <div className="container mx-auto px-4 -mt-4 mb-2 text-center">
        <p className="text-sm text-stone-400">
          Have you seen an announcement?{' '}
          <Link href="/sale-announcement-requests" className="text-amber-500 hover:text-amber-400 underline underline-offset-2 transition-colors">
            Let us know!
          </Link>
        </p>
      </div>

      {/* Recently Added Editions carousel */}
      <EditionCarousel
        title="Recently Added Editions"
        cards={recentEditionCards}
        centered
      />

      {/* Featured Partners (sponsored) */}
      {featuredSlots.length > 0 && (
        <section className="container mx-auto px-4 py-10 pb-20">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-xl font-serif font-semibold text-stone-100 tracking-wide">Featured Partners</h2>
            <span className="text-[10px] text-amber-400 border border-amber-700 bg-amber-900/20 px-2 py-0.5 rounded-full font-semibold uppercase tracking-widest">
              ✦ Sponsored
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {featuredSlots.map((slot) => {
              const logo = cloudinaryUrl(slot.company.logoUrl, 'w_300,h_300,c_fill,q_auto,f_auto')
              return (
                <Link
                  key={slot.id}
                  href={`/companies/${slot.company.slug}`}
                  className="flex items-center gap-4 p-5 rounded-xl border border-amber-800/50 hover:border-amber-500/60 transition-all group"
                  style={{ background: 'var(--bg-raised)' }}
                >
                  <div
                    className="relative w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center shrink-0"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                  >
                    {logo ? (
                      <Image src={logo} alt={slot.company.name} fill className="object-cover" unoptimized />
                    ) : (
                      <span className="text-2xl font-serif text-amber-500">{slot.company.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="inline-block text-[10px] text-amber-400 border border-amber-700 bg-amber-900/20 px-2 py-0.5 rounded-full font-semibold uppercase tracking-widest mb-2">
                      ✦ Featured
                    </span>
                    <h3 className="font-serif font-semibold text-stone-200 group-hover:text-amber-400 transition-colors truncate">
                      {slot.company.name}
                    </h3>
                    {slot.company.country && (
                      <p className="text-xs text-stone-500 mt-0.5">{slot.company.country}</p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
