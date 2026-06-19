import { cookies } from 'next/headers'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { API_BASE } from '@/lib/authFetch'
import { SaleRowCountdown } from './SaleRowCountdown'

interface UpcomingSale {
  announcementId: string
  announcement: {
    id: string
    title: string
    generalSaleDate: string | null
    company: { name: string; slug: string } | null
  }
}

async function getMe(cookieHeader: string) {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function getUpcomingSales(cookieHeader: string): Promise<UpcomingSale[]> {
  try {
    const res = await fetch(`${API_BASE}/sale-interests/upcoming`, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

function HeroShell({
  welcome,
  upcomingSales,
  isLoggedIn = false,
}: {
  welcome?: ReactNode
  upcomingSales?: UpcomingSale[]
  isLoggedIn?: boolean
}) {
  const hasSales = upcomingSales && upcomingSales.length > 0

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
        {welcome}
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
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
              Your upcoming sales
            </p>
            <div className="flex flex-col gap-1.5">
              {upcomingSales!.map((s, i) => (
                <Link
                  key={s.announcementId}
                  href={`/sale-announcements/${s.announcement.id}`}
                  className="flex items-center justify-between rounded-lg border border-stone-700/60 bg-stone-900/60 px-3 py-2 text-left transition-colors hover:border-stone-600 hover:bg-stone-800/60"
                >
                  <span className="truncate text-sm text-stone-200">{s.announcement.title}</span>
                  {s.announcement.generalSaleDate && (
                    <SaleRowCountdown dateStr={s.announcement.generalSaleDate} isFirst={i === 0} />
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

export async function PersonalizedHero() {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')

  const user = await getMe(cookieHeader)
  if (!user) return <HeroShell />

  const upcomingSales = await getUpcomingSales(cookieHeader)

  return (
    <HeroShell
      welcome={
        <p className="mb-3 text-sm font-medium text-amber-300">
          Welcome back, {user.username}!
        </p>
      }
      upcomingSales={upcomingSales}
      isLoggedIn={true}
    />
  )
}

