import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandTextClasses } from '@/lib/brandGradient'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'
import { Badge } from '@/components/ui/Badge'
import type { ApiSubscription, ApiSubscriptionMonth, ApiSubscriptionMonthSkip } from '@luxgrimoire/shared-types'
import MonthCard from '@/components/subscriptions/MonthCard'
import SubscriptionInfoPanel from '@/components/subscriptions/SubscriptionInfoPanel'
import WaitlistButton from '@/components/subscriptions/WaitlistButton'
import SubscriptionMembershipHistory from '@/components/subscriptions/SubscriptionMembershipHistory'
import PreviousBoxes from '@/components/subscriptions/PreviousBoxes'
import { SubscriberCountBadge } from '@/components/subscriptions/SubscriberCountBadge'
import { SubscriptionSeriesSection } from './SubscriptionSeriesSection'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ from?: string }>
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const sub = await apiFetch<ApiSubscription>(`/subscriptions/${slug}`)
    return {
      title: sub.name,
      description: sub.description ?? `${sub.name} subscription box on LuxGrimoire`,
      openGraph: {
        title: sub.name,
        description: sub.description ?? undefined,
      },
    }
  } catch {
    return { title: 'Subscription not found' }
  }
}

function getMainBook(monthData: ApiSubscriptionMonth) {
  const mb = monthData.books?.find((b) => b.isMainBook) ?? monthData.books?.[0] ?? null
  if (!mb) return null
  return {
    slug: mb.book.slug,
    title: formatEditionDisplayTitle(mb.book, mb.edition),
    edition: mb.edition ? {
      slug: mb.edition.slug ?? null,
      coverImage: mb.edition.additionalImages?.[0] ?? null,
    } : null,
  }
}

export default async function SubscriptionPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { from } = await searchParams

  let sub: ApiSubscription
  try {
    sub = await apiFetch<ApiSubscription>(`/subscriptions/${slug}`)
  } catch {
    notFound()
  }

  const coverUrl = cloudinaryUrl(sub.coverImage, 'w_800,c_fill,q_auto,f_auto')

  // Sort months newest first (current + future only, from filtered API)
  const months = (sub.months ?? []).sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    return b.month - a.month
  })

  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() + 1

  const currentMonth = months.find(
    (m) => m.year === nowYear && m.month === nowMonth,
  )

  // Company-wide skips (SubscriptionMonthSkip). A skip on an already-authored month deletes its
  // SubscriptionMonth row (see markMonthSkipped), so content and an active skip never coexist —
  // "upcoming" has to be resolved from a merged timeline of both, not just `months`, or a skip
  // would silently be invisible: `months` alone would just skip past the gap it left behind and
  // surface whatever real content comes after it, hiding the fact that the very next box doesn't
  // happen. The nearest future item — whichever kind it is — is what "upcoming" means.
  const skippedByKey = new Map((sub.skippedMonths ?? []).map((s) => [`${s.year}-${s.month}`, s]))
  const currentSkip = skippedByKey.get(`${nowYear}-${nowMonth}`) ?? null

  const futureMonths = months
    .filter((m) => m.year > nowYear || (m.year === nowYear && m.month > nowMonth))
    .map((m) => ({ year: m.year, month: m.month, kind: 'content' as const, data: m }))
  const futureSkips = (sub.skippedMonths ?? [])
    .filter((s) => s.year > nowYear || (s.year === nowYear && s.month > nowMonth))
    .map((s) => ({ year: s.year, month: s.month, kind: 'skip' as const, data: s }))
  const nextUpcoming = [...futureMonths, ...futureSkips]
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))[0]

  const upcomingMonth = nextUpcoming?.kind === 'content' ? nextUpcoming.data : undefined
  const upcomingSkip = nextUpcoming?.kind === 'skip' ? nextUpcoming.data : null

  // Bundle subscription: compute current and upcoming bundle windows
  const isBundleSubscription = (sub as unknown as { isBundleSubscription?: boolean }).isBundleSubscription ?? false
  const hasBookChoiceMonths = (sub as unknown as { hasBookChoiceMonths?: boolean }).hasBookChoiceMonths ?? false
  const intervalMonths = sub.intervalMonths ?? 1
  const startingMonth = sub.startingMonth ?? 1

  function getBundleStartMonth(year: number, month: number): [number, number] {
    // Bundle cycles start at startingMonth, repeat every intervalMonths months
    // Find the most recent bundle start <= current month
    const monthsFromStart = (year * 12 + month) - (year * 12 + startingMonth)
    const cycleOffset = ((monthsFromStart % intervalMonths) + intervalMonths) % intervalMonths
    let bm = month - cycleOffset
    let by = year
    while (bm <= 0) { bm += 12; by-- }
    while (bm > 12) { bm -= 12; by++ }
    return [by, bm]
  }

  const [currentBundleStartYear, currentBundleStartMonth] = isBundleSubscription
    ? getBundleStartMonth(nowYear, nowMonth)
    : [nowYear, nowMonth]

  function getBundleMonths(startYear: number, startMonth: number): ApiSubscriptionMonth[] {
    const result: ApiSubscriptionMonth[] = []
    let [y, m] = [startYear, startMonth]
    for (let i = 0; i < intervalMonths; i++) {
      const found = months.find((mo) => mo.year === y && mo.month === m)
      if (found) result.push(found)
      m++; if (m > 12) { m = 1; y++ }
    }
    return result
  }

  // Next bundle start = current bundle start + intervalMonths months
  let nextBundleStartMonth = currentBundleStartMonth + intervalMonths
  let nextBundleStartYear = currentBundleStartYear
  while (nextBundleStartMonth > 12) { nextBundleStartMonth -= 12; nextBundleStartYear++ }

  const currentBundleMonths = isBundleSubscription ? getBundleMonths(currentBundleStartYear, currentBundleStartMonth) : []
  const upcomingBundleMonths = isBundleSubscription ? getBundleMonths(nextBundleStartYear, nextBundleStartMonth) : []

  const brandColors = (sub.company as unknown as { brandColors?: string[] })?.brandColors ?? null

  // Combo: derive featured months from component subscriptions
  const comboComponents = sub.isCombo
    ? (sub.components ?? []).filter((c) => c.component)
    : []

  // Build per-component current + upcoming for combo, same merged content+skip timeline used
  // for the regular (non-combo) case above — a component's own skips are otherwise invisible
  // here, since a combo has no SubscriptionMonth rows of its own; the skip only ever lives on
  // the component subscription being featured.
  const comboFeatured = comboComponents.map(({ component }) => {
    if (!component) return null
    const compMonths = ((component as unknown as { months?: ApiSubscriptionMonth[] }).months ?? [])
      .sort((a, b) => (b.year !== a.year ? b.year - a.year : b.month - a.month))
    const compSkips = (component as unknown as { skippedMonths?: ApiSubscriptionMonthSkip[] }).skippedMonths ?? []
    const compSkippedByKey = new Map(compSkips.map((s) => [`${s.year}-${s.month}`, s]))

    const curYear = now.getFullYear()
    const curMonth = now.getMonth() + 1
    const cur = compMonths.find((m) => m.year === curYear && m.month === curMonth)
    const curSkip = compSkippedByKey.get(`${curYear}-${curMonth}`) ?? null

    const futureMonths = compMonths
      .filter((m) => m.year > curYear || (m.year === curYear && m.month > curMonth))
      .map((m) => ({ year: m.year, month: m.month, kind: 'content' as const, data: m }))
    const futureSkips = compSkips
      .filter((s) => s.year > curYear || (s.year === curYear && s.month > curMonth))
      .map((s) => ({ year: s.year, month: s.month, kind: 'skip' as const, data: s }))
    const nextUpcoming = [...futureMonths, ...futureSkips]
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))[0]

    return {
      component: component as unknown as { id: string; slug: string; name: string },
      currentMonth: cur,
      currentSkip: curSkip,
      upcomingMonth: nextUpcoming?.kind === 'content' ? nextUpcoming.data : undefined,
      upcomingSkip: nextUpcoming?.kind === 'skip' ? nextUpcoming.data : null,
    }
  }).filter(Boolean) as {
    component: { id: string; slug: string; name: string }
    currentMonth?: ApiSubscriptionMonth
    currentSkip: ApiSubscriptionMonthSkip | null
    upcomingMonth?: ApiSubscriptionMonth
    upcomingSkip: ApiSubscriptionMonthSkip | null
  }[]

  // For combo subscriptions, collect deduplicated component months for the skip panel.
  // Combo subscriptions have no own SubscriptionMonth records; months live on components.
  const comboSkipMonths: ApiSubscriptionMonth[] = sub.isCombo
    ? (() => {
        const seen = new Set<string>()
        const result: ApiSubscriptionMonth[] = []
        for (const { component } of comboComponents) {
          if (!component) continue
          const compMs = ((component as unknown as { months?: ApiSubscriptionMonth[] }).months ?? [])
          for (const m of compMs) {
            const key = `${m.year}-${m.month}`
            if (!seen.has(key)) {
              seen.add(key)
              result.push(m)
            }
          }
        }
        return result
      })()
    : []

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      {/* Back to previous page */}
      {from === 'subscriptions' ? (
        <Link
          href="/subscriptions"
          className="flex items-center gap-2 mb-6 text-sm text-stone-400 hover:text-brand-400 transition-colors w-fit"
        >
          <span>← Subscriptions</span>
        </Link>
      ) : from === 'my-subscriptions' ? (
        <Link
          href="/my-subscriptions"
          className="flex items-center gap-2 mb-6 text-sm text-stone-400 hover:text-brand-400 transition-colors w-fit"
        >
          <span>← My Subscriptions</span>
        </Link>
      ) : sub.company?.slug && (
        <Link
          href={`/companies/${sub.company.slug}`}
          className="flex items-center gap-2 mb-6 text-sm text-stone-400 hover:text-brand-400 transition-colors w-fit"
        >
          {cloudinaryUrl(sub.company.logoUrl, 'w_40,h_40,c_fill,q_auto,f_auto') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cloudinaryUrl(sub.company.logoUrl, 'w_40,h_40,c_fill,q_auto,f_auto')!}
              alt={sub.company.name}
              className="w-6 h-6 rounded object-cover"
            />
          )}
          <span>← {sub.company.name}</span>
        </Link>
      )}

      {/* Header */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-8 mb-6 items-start">
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            {sub.genre && <Badge variant="outline">{sub.genre}</Badge>}
            <Badge variant={sub.isDiscontinued ? 'destructive' : sub.isUpcoming ? 'outline' : 'success'}>
              {sub.isDiscontinued ? 'DISCONTINUED' : sub.isUpcoming ? '🔔 UPCOMING' : 'ACTIVE'}
            </Badge>
            {sub.startDate && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-stone-600 text-stone-400">
                Since {sub.startDate.slice(0, 7)}
              </span>
            )}
            {sub.endDate && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-stone-600 text-stone-500">
                Ended {sub.endDate.slice(0, 7)}
              </span>
            )}
            {(sub.company as unknown as { hasOfficialImagePermission?: boolean })?.hasOfficialImagePermission && (
              <Badge variant="outline">✓ Images used with brand permission</Badge>
            )}
          </div>

          <h1 className="text-4xl font-serif font-bold text-stone-100 mb-4 leading-tight">
            {sub.company?.slug && (
              <Link
                href={`/companies/${sub.company.slug}`}
                className="block text-sm font-sans font-normal text-stone-400 hover:text-brand-400 transition-colors mb-1"
              >
                {sub.company.name}
              </Link>
            )}
            {sub.name}
          </h1>

          {sub.description && (
            <p className="text-stone-300 leading-relaxed whitespace-pre-line">{sub.description}</p>
          )}

          {/* Subscriber count */}
          <div className="mt-3">
            <SubscriberCountBadge subscriptionSlug={slug} />
          </div>

          {sub.isUpcoming && sub.upcomingNote && (
            <p className="mt-3 text-sm text-amber-400">🔔 {sub.upcomingNote}</p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={sub.name}
              className="rounded-xl shadow-xl w-full object-cover max-h-72 md:max-h-none"
            />
          )}
          {sub.waitlistLink && (
            <a
              href={sub.waitlistLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl bg-brand-600/10 border border-brand-600/40 hover:bg-brand-600/20 text-sm text-brand-400 hover:text-brand-300 transition-all"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Join waitlist here
            </a>
          )}
          {!sub.isDiscontinued && <WaitlistButton subscriptionSlug={sub.slug} />}
          <SubscriptionMembershipHistory subscriptionSlug={sub.slug} />
        </div>
      </div>

      {/* Subscription info panel — below header */}
      <div className="mb-12">
        <SubscriptionInfoPanel
          subscriptionSlug={sub.slug}
          name={sub.name}
          price={sub.price}
          originalBasePrice={sub.originalBasePrice}
          currency={sub.currency}
          intervalMonths={sub.intervalMonths}
          isBundleSubscription={isBundleSubscription}
          hasBookChoiceMonths={hasBookChoiceMonths}
          startingMonth={startingMonth}
          shipsInternationally={(sub as unknown as { shipsInternationally: boolean }).shipsInternationally ?? false}
          country={sub.company?.country ?? null}
          renewalDay={sub.renewalDay ?? null}
          renewalMonthOffset={sub.renewalMonthOffset ?? 0}
          months={sub.isCombo ? comboSkipMonths : months}
          prepayOptions={(sub as unknown as { prepayOptions?: { id: string; months: number; price: number | string; label: string | null; currency: string; validFrom?: string | null; validUntil?: string | null }[] }).prepayOptions}
          isDiscontinued={sub.isDiscontinued ?? false}
          subscriptionEndDate={sub.endDate ?? null}
          signupIncludesCurrentMonth={sub.signupIncludesCurrentMonth}
          skipPolicies={sub.skipPolicies ?? []}
        />
      </div>

      {/* Featured months (current + upcoming) */}
      {sub.isCombo ? (
        /* Combo: all current months in one row, all upcoming in another */
        comboFeatured.length > 0 && (
          <section className="mb-12 space-y-8">
            {comboFeatured.some((f) => f.currentMonth || f.currentSkip) && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-400 mb-4">Current Month</h3>
                <div className={`grid gap-4 ${comboFeatured.filter((f) => f.currentMonth || f.currentSkip).length === 1 ? 'grid-cols-1 max-w-xs' : `grid-cols-1 sm:grid-cols-${Math.min(comboFeatured.filter((f) => f.currentMonth || f.currentSkip).length, 3)} ${comboFeatured.filter((f) => f.currentMonth || f.currentSkip).length === 2 ? 'max-w-2xl' : 'max-w-4xl'}`}`}>
                  {comboFeatured
                    .filter((f) => f.currentMonth || f.currentSkip)
                    .map(({ component, currentMonth: cur, currentSkip: curSkip }) => (
                      <div key={component.id} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">{component.name}</p>
                        {curSkip ? (
                          <FeaturedMonthCard compact label="Current Month" labelVariant="current" monthData={{ year: curSkip.year, month: curSkip.month }} accentColors={brandColors} skipped={curSkip} />
                        ) : (
                          <FeaturedMonthCard compact label="Current Month" labelVariant="current" monthData={cur!} accentColors={brandColors} />
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
            {comboFeatured.some((f) => f.upcomingMonth || f.upcomingSkip) && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-stone-400 mb-4">Upcoming Theme</h3>
                <div className={`grid gap-4 ${comboFeatured.filter((f) => f.upcomingMonth || f.upcomingSkip).length === 1 ? 'grid-cols-1 max-w-xs' : `grid-cols-1 sm:grid-cols-${Math.min(comboFeatured.filter((f) => f.upcomingMonth || f.upcomingSkip).length, 3)} ${comboFeatured.filter((f) => f.upcomingMonth || f.upcomingSkip).length === 2 ? 'max-w-2xl' : 'max-w-4xl'}`}`}>
                  {comboFeatured
                    .filter((f) => f.upcomingMonth || f.upcomingSkip)
                    .map(({ component, upcomingMonth: upc, upcomingSkip: upcSkip }) => (
                      <div key={component.id} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">{component.name}</p>
                        {upcSkip ? (
                          <FeaturedMonthCard compact label="Upcoming Theme" labelVariant="upcoming" monthData={{ year: upcSkip.year, month: upcSkip.month }} accentColors={brandColors} skipped={upcSkip} />
                        ) : (
                          <FeaturedMonthCard compact label="Upcoming Theme" labelVariant="upcoming" monthData={upc!} accentColors={brandColors} />
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </section>
        )
      ) : isBundleSubscription ? (
        /* Bundle: show current bundle (all interval months) + upcoming bundle if available */
        (currentBundleMonths.length > 0 || upcomingBundleMonths.length > 0) && (
          <section className="mb-12 space-y-8">
            {currentBundleMonths.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-400 mb-4">
                  Current Bundle — {MONTH_NAMES[currentBundleStartMonth - 1]} {currentBundleStartYear}
                </h3>
                <div className={`grid gap-6 grid-cols-1 sm:grid-cols-${Math.min(currentBundleMonths.length, 3)} ${currentBundleMonths.length === 1 ? 'max-w-xs' : currentBundleMonths.length === 2 ? 'max-w-2xl' : 'max-w-4xl'}`}>
                  {currentBundleMonths.map((m) => (
                    <FeaturedMonthCard
                      key={`${m.year}-${m.month}`}
                      compact
                      label={`${MONTH_NAMES[m.month - 1]} ${m.year}`}
                      labelVariant="current"
                      monthData={m}
                      accentColors={brandColors}
                    />
                  ))}
                </div>
              </div>
            )}
            {upcomingBundleMonths.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-stone-400 mb-4">
                  Upcoming Bundle — {MONTH_NAMES[nextBundleStartMonth - 1]} {nextBundleStartYear}
                </h3>
                <div className={`grid gap-6 grid-cols-1 sm:grid-cols-${Math.min(upcomingBundleMonths.length, 3)} ${upcomingBundleMonths.length === 1 ? 'max-w-xs' : upcomingBundleMonths.length === 2 ? 'max-w-2xl' : 'max-w-4xl'}`}>
                  {upcomingBundleMonths.map((m) => (
                    <FeaturedMonthCard
                      key={`${m.year}-${m.month}`}
                      compact
                      label={`${MONTH_NAMES[m.month - 1]} ${m.year}`}
                      labelVariant="upcoming"
                      monthData={m}
                      accentColors={brandColors}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )
      ) : (
        /* Regular: single current + upcoming */
        (currentMonth || upcomingMonth || currentSkip || upcomingSkip) && (
          <section className="mb-12">
            <div className={`grid gap-6 ${(currentMonth || currentSkip) && (upcomingMonth || upcomingSkip) ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl' : 'grid-cols-1 max-w-xs'}`}>
              {currentSkip ? (
                <FeaturedMonthCard
                  compact
                  label="Current Month"
                  labelVariant="current"
                  monthData={{ year: currentSkip.year, month: currentSkip.month }}
                  accentColors={brandColors}
                  skipped={currentSkip}
                />
              ) : currentMonth && (
                <FeaturedMonthCard
                  compact
                  label="Current Month"
                  labelVariant="current"
                  monthData={currentMonth}
                  accentColors={brandColors}
                />
              )}
              {upcomingSkip ? (
                <FeaturedMonthCard
                  compact
                  label="Upcoming Theme"
                  labelVariant="upcoming"
                  monthData={{ year: upcomingSkip.year, month: upcomingSkip.month }}
                  accentColors={brandColors}
                  skipped={upcomingSkip}
                />
              ) : upcomingMonth && (
                <FeaturedMonthCard
                  compact
                  label="Upcoming Theme"
                  labelVariant="upcoming"
                  monthData={upcomingMonth}
                  accentColors={brandColors}
                />
              )}
            </div>
          </section>
        )
      )}

      {/* Previous boxes — lazy loaded on demand */}
      <PreviousBoxes
        subscriptionSlug={slug}
        accentColors={brandColors}
        isCombo={sub.isCombo}
        comboComponents={comboComponents.map(({ component }) => ({
          slug: (component as unknown as { slug: string }).slug,
          name: (component as unknown as { name: string }).name,
        }))}
        comboStartDate={sub.isCombo ? sub.startDate ?? null : null}
        isBundleSubscription={isBundleSubscription}
        intervalMonths={intervalMonths}
        startingMonth={startingMonth}
        bundleUntilYear={isBundleSubscription ? currentBundleStartYear : undefined}
        bundleUntilMonth={isBundleSubscription ? currentBundleStartMonth : undefined}
      />

      {/* Series history — streams in via Suspense */}
      <Suspense fallback={null}>
        <SubscriptionSeriesSection subscriptionSlug={slug} />
      </Suspense>
    </div>
  )
}

// ── Featured month card (server component, CSS-only hover) ───────────────────

interface FeaturedMonthCardProps {
  label: string
  labelVariant: 'current' | 'upcoming'
  monthData: Pick<ApiSubscriptionMonth, 'year' | 'month'> & Partial<Omit<ApiSubscriptionMonth, 'year' | 'month'>>
  accentColors?: string[] | null
  compact?: boolean
  // Company-wide skip (SubscriptionMonthSkip) — when set, short-circuits to a "Skipped: reason"
  // card instead of the normal cover/theme layout. monthData in this case only has year/month.
  skipped?: { reason: string | null } | null
}

function FeaturedMonthCard({ label, labelVariant, monthData, accentColors, compact, skipped }: FeaturedMonthCardProps) {
  const monthName = MONTH_NAMES[monthData.month - 1]

  if (skipped) {
    return (
      <div className="rounded-2xl overflow-hidden bg-stone-900 border border-amber-800/40">
        <div className={`relative flex flex-col items-center justify-center gap-2 bg-amber-950/20 ${compact ? 'aspect-[16/9]' : 'aspect-[4/3]'}`}>
          <div className="absolute top-3 left-3">
            <span
              className={`text-xs font-semibold font-serif uppercase tracking-wider px-3 py-1 rounded-full ${
                labelVariant === 'current' ? 'bg-brand-500 text-stone-950' : 'bg-stone-700 text-brand-400 border border-brand-700/50'
              }`}
            >
              {label}
            </span>
          </div>
          <span className="text-amber-400 font-serif text-2xl">⏭</span>
          <span className="text-amber-400 font-serif text-sm uppercase tracking-widest">Skipped</span>
        </div>
        <div className={compact ? 'p-3' : 'p-5'}>
          <p className={`text-stone-100 font-serif font-bold mb-1 ${compact ? 'text-sm' : 'text-lg'}`}>
            {monthName} {monthData.year}
          </p>
          <p className={`text-amber-500/90 italic ${compact ? 'text-xs' : 'text-sm'}`}>
            {skipped.reason || 'This month is skipped — no box this cycle.'}
          </p>
        </div>
      </div>
    )
  }

  // No c_fill — let contain work properly
  const coverUrl = cloudinaryUrl(monthData.coverImage ?? null, 'w_900,q_auto,f_auto')
  const mainBook = monthData.books?.find((b) => b.isMainBook) ?? monthData.books?.[0] ?? null
  const bookCoverUrl = cloudinaryUrl(
    mainBook?.edition?.additionalImages?.[0] ?? null,
    'w_600,c_fill,q_auto,f_auto',
  )

  const imageArea = (
    <div className={`group relative overflow-hidden bg-stone-950 cursor-pointer ${compact ? 'aspect-[16/9]' : 'aspect-[4/3]'}`}>
      {coverUrl ? (
        <>
          {/* Blurred background fill — eliminates hard letterboxing */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40 transition-opacity duration-300 group-hover:opacity-0"
          />
          {/* Main image — contained, no crop */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt={`${monthName} ${monthData.year}`}
            className="relative z-10 w-full h-full object-contain transition-opacity duration-300 group-hover:opacity-0"
          />
        </>
      ) : (
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-2"
          style={
            accentColors?.length
              ? { background: `linear-gradient(135deg, ${accentColors[1] ?? '#0c0a09'} 0%, ${accentColors[0] ?? '#1c1917'} 60%, ${accentColors[2] ?? '#0c0a09'} 100%)` }
              : { background: 'linear-gradient(135deg, #0c0a09 0%, #1c1917 60%, #0c0a09 100%)' }
          }
        >
          {(() => {
            const tc = brandTextClasses(accentColors)
            return (
              <>
                <span className={`font-serif text-base tracking-widest uppercase ${tc.primary}`}>
                  {monthName} {monthData.year}
                </span>
                {monthData.theme && (
                  <span className={`text-xs italic px-6 text-center line-clamp-2 ${tc.secondary}`}>
                    {monthData.theme}
                  </span>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* Hover: book cover — blurred bg fill + contained foreground */}
      {bookCoverUrl && (
        <div className="absolute inset-0 z-20 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          {/* Blurred background fill */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bookCoverUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50"
          />
          {/* Contained foreground — no crop */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bookCoverUrl}
            alt={mainBook?.book?.title ?? ''}
            className="relative z-10 w-full h-full object-contain"
          />
        </div>
      )}

      {/* Hover overlay with title */}
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-stone-950/65 px-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        {mainBook?.edition ? (
          <p className="text-stone-100 text-sm font-serif font-semibold text-center leading-snug line-clamp-4">
            {mainBook.book.title}
          </p>
        ) : (
          <p className="text-stone-400 text-xs text-center italic">Book details coming soon</p>
        )}
      </div>

      {/* Label badge */}
      <div className="absolute top-3 left-3 z-40">
        <span
          className={`text-xs font-semibold font-serif uppercase tracking-wider px-3 py-1 rounded-full ${
            labelVariant === 'current'
              ? 'bg-brand-500 text-stone-950'
              : 'bg-stone-700 text-brand-400 border border-brand-700/50'
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  )

  return (
    <div className="rounded-2xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-brand-700/50 transition-colors">
      {mainBook ? (
        <Link href={mainBook.edition?.slug ? `/editions/${mainBook.edition.slug}` : `/books/${mainBook.book.slug}`}>{imageArea}</Link>
      ) : (
        imageArea
      )}

      <div className={compact ? 'p-3' : 'p-5'}>
        <p className={`text-stone-100 font-serif font-bold mb-1 ${compact ? 'text-sm' : 'text-lg'}`}>
          {monthName} {monthData.year}
        </p>

        {monthData.theme ? (
          <p className={`text-stone-200 font-serif italic ${compact ? 'text-xs mb-2' : 'text-sm mb-3'}`}>{monthData.theme}</p>
        ) : (
          <p className={`text-stone-500 italic ${compact ? 'text-xs mb-2' : 'text-sm mb-3'}`}>Theme not announced yet</p>
        )}

        {monthData.cardArtist && (
          <Link
            href={`/artists/${monthData.cardArtist.slug}`}
            className="inline-block text-xs text-stone-500 hover:text-brand-400 transition-colors mb-3"
          >
            card art by {monthData.cardArtist.instagram
              ? `@${monthData.cardArtist.instagram.replace(/^@/, '')}`
              : monthData.cardArtist.name}
          </Link>
        )}

        {monthData.isSpoiler && (
          <Badge variant="warning" className="mt-2">Spoiler</Badge>
        )}
      </div>
    </div>
  )
}
