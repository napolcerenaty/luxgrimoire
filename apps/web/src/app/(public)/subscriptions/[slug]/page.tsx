import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import { BackButton } from '@/components/ui/BackButton'
import type { ApiSubscription, ApiSubscriptionMonth, ApiSubscriptionSeries } from '@luxgrimoire/shared-types'
import MonthCard from '@/components/subscriptions/MonthCard'
import SubscriptionInfoPanel from '@/components/subscriptions/SubscriptionInfoPanel'
import WaitlistButton from '@/components/subscriptions/WaitlistButton'
import PreviousBoxes from '@/components/subscriptions/PreviousBoxes'

interface Props {
  params: Promise<{ slug: string }>
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
    title: mb.book.title,
    coverImage: mb.book.coverImage ?? null,
    edition: mb.edition ? {
      slug: mb.edition.slug ?? null,
      coverImage: mb.edition.additionalImages?.[0] ?? null,
    } : null,
  }
}

export default async function SubscriptionPage({ params }: Props) {
  const { slug } = await params

  let sub: ApiSubscription
  try {
    sub = await apiFetch<ApiSubscription>(`/subscriptions/${slug}`)
  } catch {
    notFound()
  }

  // Fetch series (non-blocking — show [] on failure)
  let seriesList: ApiSubscriptionSeries[] = []
  try {
    seriesList = await apiFetch<ApiSubscriptionSeries[]>(`/subscription-series?subscriptionSlug=${slug}`)
  } catch {
    // no series or fetch failed — hide section silently
  }

  const coverUrl = cloudinaryUrl(sub.coverImage, 'w_800,c_fill,q_auto,f_auto')

  // Sort months newest first (current + future only, from filtered API)
  const months = (sub.months ?? []).sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    return b.month - a.month
  })

  const now = new Date()
  const currentMonth = months.find(
    (m) => m.year === now.getFullYear() && m.month === now.getMonth() + 1,
  )
  const upcomingMonth = months.find(
    (m) => m.year > now.getFullYear() || (m.year === now.getFullYear() && m.month > now.getMonth() + 1),
  )

  const brandColors = (sub.company as unknown as { brandColors?: string[] })?.brandColors ?? null

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      {/* Back to previous page */}
      {sub.company && (
        <BackButton className="flex items-center gap-2 mb-6 text-sm text-stone-400 hover:text-amber-400 transition-colors w-fit">
          {cloudinaryUrl(sub.company.logoUrl, 'w_40,h_40,c_fill,q_auto,f_auto') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cloudinaryUrl(sub.company.logoUrl, 'w_40,h_40,c_fill,q_auto,f_auto')!}
              alt={sub.company.name}
              className="w-6 h-6 rounded object-cover"
            />
          )}
          <span>← {sub.company.name}</span>
        </BackButton>
      )}

      {/* Header */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-8 mb-6 items-start">
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            {sub.genre && <Badge variant="outline">{sub.genre}</Badge>}
            <Badge variant={sub.isDiscontinued ? 'destructive' : 'success'}>
              {sub.isDiscontinued ? 'Discontinued' : 'Active'}
            </Badge>
          </div>

          <h1 className="text-4xl font-serif font-bold text-stone-100 mb-4 leading-tight">
            {sub.company?.slug && (
              <Link
                href={`/companies/${sub.company.slug}`}
                className="block text-sm font-sans font-normal text-stone-400 hover:text-amber-400 transition-colors mb-1"
              >
                {sub.company.name}
              </Link>
            )}
            {sub.name}
          </h1>

          {sub.description && (
            <p className="text-stone-300 leading-relaxed">{sub.description}</p>
          )}

          <div className="flex gap-4 mt-4 text-xs text-stone-500">
            {sub.startDate && <span>Started: {sub.startDate.slice(0, 7)}</span>}
            {sub.endDate && <span>Ended: {sub.endDate.slice(0, 7)}</span>}
          </div>
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
          <WaitlistButton subscriptionSlug={sub.slug} />
        </div>
      </div>

      {/* Subscription info panel — below header */}
      <div className="mb-12">
        <SubscriptionInfoPanel
          subscriptionSlug={sub.slug}
          name={sub.name}
          price={sub.price}
          currency={sub.currency}
          type={sub.type}
          shipsInternationally={(sub as unknown as { shipsInternationally: boolean }).shipsInternationally ?? false}
          country={sub.company?.country ?? null}
          renewalDay={sub.renewalDay ?? null}
          months={months}
        />
      </div>

      {/* Featured months (current + upcoming) */}
      {(currentMonth || upcomingMonth) && (
        <section className="mb-12">
          <div className={`grid gap-6 ${currentMonth && upcomingMonth ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-sm'}`}>
            {currentMonth && (
              <FeaturedMonthCard
                label="Current Month"
                labelVariant="current"
                monthData={currentMonth}
                accentColors={brandColors}
              />
            )}
            {upcomingMonth && (
              <FeaturedMonthCard
                label="Upcoming Theme"
                labelVariant="upcoming"
                monthData={upcomingMonth}
                accentColors={brandColors}
              />
            )}
          </div>
        </section>
      )}

      {/* Previous boxes — lazy loaded on demand */}
      <PreviousBoxes subscriptionSlug={slug} accentColors={brandColors} />

      {/* Series history */}
      {seriesList.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">
            Series ({seriesList.length})
          </h2>
          <div className="flex flex-col gap-4">
            {seriesList.map((s) => (
              <SeriesHistoryCard key={s.id} series={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Series history card ──────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function SeriesHistoryCard({ series }: { series: ApiSubscriptionSeries }) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const isCurrentlyActive =
    series.isActive &&
    (series.startYear < currentYear ||
      (series.startYear === currentYear && series.startMonth <= currentMonth)) &&
    (series.endYear > currentYear ||
      (series.endYear === currentYear && series.endMonth >= currentMonth))

  const isPast =
    series.endYear < currentYear ||
    (series.endYear === currentYear && series.endMonth < currentMonth)

  const months = series.months ?? []

  return (
    <div className={`rounded-xl border p-5 ${isCurrentlyActive ? 'border-purple-700/60 bg-purple-950/20' : 'border-stone-800 bg-stone-900/50'}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-stone-100 font-serif font-semibold text-lg leading-tight">{series.name}</h3>
            {isCurrentlyActive && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-700 text-purple-100">Active</span>
            )}
            {isPast && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-700 text-stone-400">Past</span>
            )}
            {!isCurrentlyActive && !isPast && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-800/60 text-amber-300">Upcoming</span>
            )}
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-stone-700 text-stone-400">
              {series.skipMode === 'SERIES_ONLY' ? 'Skip as series' : 'Individual skips'}
            </span>
            {!series.canCancelDuring && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-700/50 text-amber-600/80">no cancel during</span>
            )}
          </div>
          <p className="text-stone-400 text-sm mb-3">
            {MONTH_SHORT[series.startMonth - 1]} {series.startYear} – {MONTH_SHORT[series.endMonth - 1]} {series.endYear}
          </p>
          {series.description && (
            <p className="text-stone-400 text-sm mb-3 leading-relaxed">{series.description}</p>
          )}
          {months.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {months.map((m) => (
                <span
                  key={m.id}
                  className="text-[11px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700"
                >
                  {MONTH_SHORT[m.month - 1]} {m.year}
                  {m.theme ? ` · ${m.theme}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Featured month card (server component, CSS-only hover) ───────────────────

interface FeaturedMonthCardProps {
  label: string
  labelVariant: 'current' | 'upcoming'
  monthData: ApiSubscriptionMonth
  accentColors?: string[] | null
}

function FeaturedMonthCard({ label, labelVariant, monthData, accentColors }: FeaturedMonthCardProps) {
  const monthName = MONTH_NAMES[monthData.month - 1]
  // No c_fill — let contain work properly
  const coverUrl = cloudinaryUrl(monthData.coverImage, 'w_900,q_auto,f_auto')
  const mainBook = monthData.books?.find((b) => b.isMainBook) ?? monthData.books?.[0] ?? null
  const bookCoverUrl = cloudinaryUrl(
    mainBook?.edition?.additionalImages?.[0] ?? mainBook?.book?.coverImage ?? null,
    'w_600,c_fill,q_auto,f_auto',
  )

  const imageArea = (
    <div className="group relative overflow-hidden aspect-[16/9] bg-stone-950 cursor-pointer">
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
          <span className="text-stone-400 font-serif text-base tracking-widest uppercase">
            {monthName} {monthData.year}
          </span>
          {monthData.theme && (
            <span className="text-stone-500 text-xs italic px-6 text-center line-clamp-2">
              {monthData.theme}
            </span>
          )}
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
              ? 'bg-amber-500 text-stone-950'
              : 'bg-stone-700 text-amber-400 border border-amber-700/50'
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  )

  return (
    <div className="rounded-2xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors">
      {mainBook ? (
        <Link href={mainBook.edition?.slug ? `/editions/${mainBook.edition.slug}` : `/books/${mainBook.book.slug}`}>{imageArea}</Link>
      ) : (
        imageArea
      )}

      <div className="p-5">
        <p className="text-stone-100 font-serif font-bold text-lg mb-1">
          {monthName} {monthData.year}
        </p>

        {monthData.theme ? (
          <p className="text-stone-200 text-sm font-serif italic mb-3">{monthData.theme}</p>
        ) : (
          <p className="text-stone-500 text-sm italic mb-3">Theme not announced yet</p>
        )}

        {monthData.cardArtist && (
          <Link
            href={`/artists/${monthData.cardArtist.slug}`}
            className="inline-block text-xs text-stone-500 hover:text-amber-400 transition-colors mb-3"
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
