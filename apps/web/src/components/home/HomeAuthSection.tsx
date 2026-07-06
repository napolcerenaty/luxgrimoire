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
  tier: string
  announcement: {
    id: string
    title: string
    saleType: string
    firstAccessDate: string | null
    earlyAccessDate: string | null
    generalSaleDate: string | null
    endsAt: string | null
    company: { name: string; slug: string } | null
  }
}

function resolveTierDate(sale: UpcomingSale): string | null {
  const ann = sale.announcement
  if (ann.saleType === 'OPEN_PREORDER') return ann.endsAt ?? null
  const tier = sale.tier ?? 'GS'
  if (tier === 'FA') return ann.firstAccessDate ?? ann.earlyAccessDate ?? ann.generalSaleDate
  if (tier === 'EA') return ann.earlyAccessDate ?? ann.generalSaleDate
  return ann.generalSaleDate
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
          <p className="mb-3 text-sm font-medium text-amber-300">
            Welcome back, {username}!
          </p>
        )}
        <h1
          className="mb-4 font-serif text-4xl font-bold tracking-wide text-amber-400 sm:text-6xl sm:tracking-widest lg:text-7xl"
          style={{ textShadow: '0 0 40px rgba(0,150,200,0.35)' }}
        >
          LuxGrimoire
        </h1>
        <p className="mb-5 font-serif text-xs font-semibold uppercase tracking-[0.3em] text-[#1a4f6e] dark:text-[#4a88a8]">
          Limited books.<br className="sm:hidden" /> Unlimited obsession.
        </p>

        {hasSales ? (
          <div className="mx-auto mb-7 max-w-lg">
            <p className="mb-3 text-xs uppercase tracking-widest text-stone-500">
              Your upcoming sales
            </p>
            <div className="flex flex-col gap-1.5">
              {upcomingSales.map((s, i) => (
                <Link
                  key={s.announcementId}
                  href={`/sale-announcements/${s.announcement.id}`}
                  className="flex items-center justify-between rounded-lg border border-stone-700/60 bg-stone-900/60 px-3 py-2 text-left transition-colors hover:border-stone-600 hover:bg-stone-800/60"
                >
                  <div className="min-w-0 flex-1">
                    {s.announcement.company && (
                      <p className="truncate text-[11px] text-stone-400">{s.announcement.company.name}</p>
                    )}
                    <span className="truncate text-sm font-medium text-stone-100">{s.announcement.title}</span>
                  </div>
                  {resolveTierDate(s) && (
                    <SaleRowCountdown dateStr={resolveTierDate(s)!} isFirst={i === 0} />
                  )}
                </Link>
              ))}
            </div>
            <Link
              href="/wishlist?tab=sales"
              className="mt-2 inline-block text-[11px] text-stone-500 transition-colors hover:text-stone-300"
            >
              View all followed sales →
            </Link>
          </div>
        ) : (
          <p className="mx-auto mb-7 max-w-xl text-sm leading-relaxed text-stone-400">
            Track special editions, manage your collection, follow subscription boxes,
            and keep up with your book spending — all in one place.
          </p>
        )}

        {!isLoggedIn && (
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
        <h2 className="mb-8 text-center font-serif text-2xl text-stone-100">
          Everything you need to manage your collection
        </h2>
      </div>
      <FeaturesCarousel features={features} />
      <div className="mt-6 flex justify-center">
        <Link
          href="/register"
          className="rounded-full bg-amber-600 px-8 py-3 font-serif text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-500"
        >
          Get started free →
        </Link>
      </div>
    </section>
  )
}
