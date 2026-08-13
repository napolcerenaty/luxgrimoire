'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { API_BASE } from '@/lib/authFetch'
import { apiFetch } from '@/lib/api'
import { FeaturesCarousel, type HomepageFeature } from './HomeFeaturesSection'
import { SaleRowCountdown } from './SaleRowCountdown'

interface UpcomingSale {
  announcementId: string
  /** The concrete tier this interest points at — its date IS the resolved date, no
   *  FA/EA/GS fallback-chain needed. */
  saleTier: { id: string; name: string; date: string } | null
  announcement: {
    id: string
    title: string
    company: { name: string; slug: string } | null
  }
}

export function HomeAuthSection() {
  const { user, loading } = useAuth()
  const [upcomingSales, setUpcomingSales] = useState<UpcomingSale[]>([])

  // Fetch upcoming sales once user is confirmed
  useEffect(() => {
    if (!user) return
    fetch(`${API_BASE}/sale-interests/upcoming`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setUpcomingSales(data))
      .catch(() => {})
  }, [user])

  // During initial load show generic hero — no layout shift
  if (loading) {
    return <HeroShell isLoggedIn={false} />
  }

  if (!user) {
    return <HeroShell isLoggedIn={false} />
  }

  return (
    <HeroShell
      isLoggedIn={true}
      username={user.username}
      upcomingSales={upcomingSales}
    />
  )
}

function HeroShell({
  isLoggedIn,
  username,
  upcomingSales = [],
}: {
  isLoggedIn: boolean
  username?: string
  upcomingSales?: UpcomingSale[]
}) {
  const hasSales = upcomingSales.length > 0

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
        {isLoggedIn && username && (
          <p className="mb-3 text-sm font-medium text-brand-300">
            Welcome back, {username}!
          </p>
        )}
        <h1
          className="mb-4 font-serif text-4xl font-bold tracking-wide text-brand-400 sm:text-6xl sm:tracking-widest lg:text-7xl"
          style={{ textShadow: '0 0 40px rgba(0,150,200,0.35)' }}
        >
          LuxGrimoire
        </h1>
        <p className="mb-5 font-serif text-xs font-semibold uppercase tracking-[0.3em] text-[#1a4f6e] dark:text-[#4a88a8]">
          Limited books.<br className="sm:hidden" /> Unlimited obsession.
        </p>

        {hasSales ? (
          <div className="mx-auto mb-7 max-w-lg">
            <p className="mb-3 text-xs uppercase tracking-widest text-navy-500">
              Your upcoming sales
            </p>
            <div className="flex flex-col gap-1.5">
              {upcomingSales.map((s, i) => (
                <Link
                  key={s.announcementId}
                  href={`/sale-announcements/${s.announcement.id}`}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-navy-700/60 bg-navy-900/60 px-3 py-3 text-center transition-colors hover:border-navy-600 hover:bg-navy-800/60"
                >
                  <div>
                    {s.announcement.company && (
                      <p className="text-[11px] text-navy-400">{s.announcement.company.name}</p>
                    )}
                    <span className="block text-sm font-medium leading-snug text-navy-100">{s.announcement.title}</span>
                  </div>
                  {s.saleTier?.date && (
                    <SaleRowCountdown dateStr={s.saleTier.date} className="" />
                  )}
                </Link>
              ))}
            </div>
            <Link
              href="/wishlist?tab=sales"
              className="mt-2 inline-block text-[11px] text-navy-500 transition-colors hover:text-navy-300"
            >
              View all followed sales →
            </Link>
          </div>
        ) : (
          <p className="mx-auto mb-7 max-w-xl text-sm leading-relaxed text-navy-400">
            Track special editions, manage your collection, follow subscription boxes,
            and keep up with your book spending — all in one place.
          </p>
        )}

        {!isLoggedIn && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/companies"
              className="rounded-full bg-brand-600 px-6 py-3 font-serif text-sm font-semibold text-navy-950 transition-colors hover:bg-brand-500"
            >
              Browse Book Boxes
            </Link>
            <Link
              href="/subscriptions"
              className="rounded-full border border-navy-600 px-6 py-3 font-serif text-sm text-navy-300 transition-colors hover:border-navy-400 hover:text-navy-100"
            >
              Browse Subscriptions
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

const FALLBACK_FEATURES: HomepageFeature[] = [
  { id: '1', title: 'Track Your Collection', description: 'Add editions, track ownership status (owned, preorder, shipping), condition and read status', iconName: 'BookOpen', ctaLabel: 'Get started free', ctaHref: '/register' },
  { id: '2', title: 'Sale Alerts', description: 'Get notified before FA, EA and GS sale windows close — never miss a drop', iconName: 'Bell', ctaLabel: 'Get started free', ctaHref: '/register' },
  { id: '3', title: 'Spending Statistics', description: 'See how much you spend per month and per year across subscriptions and purchases', iconName: 'BarChart2', ctaLabel: 'Get started free', ctaHref: '/register' },
]

/** Renders the features section only for guests — hidden for logged-in users */
export function HomeGuestFeatures() {
  const { user, loading } = useAuth()
  const [features, setFeatures] = useState<HomepageFeature[]>(FALLBACK_FEATURES)

  useEffect(() => {
    if (loading || user) return
    apiFetch<HomepageFeature[]>('/homepage-features')
      .then((data) => { if (data.length) setFeatures(data) })
      .catch(() => {})
  }, [loading, user])

  if (loading || user) return null

  return (
    <section className="py-12">
      <div className="container mx-auto max-w-5xl px-4">
        <h2 className="mb-8 text-center font-serif text-2xl text-navy-100">
          Everything you need to manage your collection
        </h2>
      </div>
      <FeaturesCarousel features={features} />
      <div className="mt-6 flex justify-center">
        <Link
          href="/register"
          className="rounded-full bg-brand-600 px-8 py-3 font-serif text-sm font-semibold text-navy-950 transition-colors hover:bg-brand-500"
        >
          Get started free →
        </Link>
      </div>
    </section>
  )
}

