'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'
import MonthCard from './MonthCard'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface PastMonth {
  id: string
  year: number
  month: number
  theme?: string | null
  coverImage?: string | null
  isSpoiler: boolean
  cardArtist?: { id: string; name: string; slug: string; instagram: string | null } | null
  books?: {
    isMainBook: boolean
    book: { id: string; title: string; slug: string }
    edition?: { id: string; slug: string; additionalImages?: string[] | null; variantLabel?: string | null } | null
  }[]
}

interface PaginatedMonths {
  data: PastMonth[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function getMainBook(m: PastMonth) {
  const mb = m.books?.find((b) => b.isMainBook) ?? m.books?.[0] ?? null
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

function getEditionSlug(m: PastMonth): string | null {
  const mb = m.books?.find((b) => b.isMainBook) ?? m.books?.[0] ?? null
  return mb?.edition?.slug ?? null
}

interface Props {
  subscriptionSlug: string
  accentColors?: string[] | null
  totalMonths?: number
  isCombo?: boolean
  comboComponents?: { slug: string; name: string }[]
  comboStartDate?: string | null
  isBundleSubscription?: boolean
  intervalMonths?: number
  startingMonth?: number
  bundleUntilYear?: number
  bundleUntilMonth?: number
}

const PAGE_SIZE = 12

function getBundleKey(year: number, month: number, intervalMonths: number, startingMonth: number): string {
  const monthsFromStart = (year * 12 + month) - (year * 12 + startingMonth)
  const cycleOffset = ((monthsFromStart % intervalMonths) + intervalMonths) % intervalMonths
  let bm = month - cycleOffset
  let by = year
  while (bm <= 0) { bm += 12; by-- }
  return `${by}-${String(bm).padStart(2, '0')}`
}

function getBundleLabel(key: string, intervalMonths: number): string {
  const [y, m] = key.split('-').map(Number)
  const endM = m + intervalMonths - 1
  const endMonth = ((endM - 1) % 12) + 1
  const endYear = y + Math.floor((endM - 1) / 12)
  if (intervalMonths === 1) return `${MONTH_NAMES[m - 1]} ${y}`
  return `${MONTH_NAMES[m - 1]} – ${MONTH_NAMES[endMonth - 1]} ${endYear}`
}

function PreviousBoxesList({
  subscriptionSlug,
  accentColors,
  totalMonths,
  fromYear,
  fromMonth,
  untilYear,
  untilMonth,
  isBundleSubscription,
  intervalMonths = 1,
  startingMonth = 1,
}: { subscriptionSlug: string; accentColors?: string[] | null; totalMonths?: number; fromYear?: number; fromMonth?: number; untilYear?: number; untilMonth?: number; isBundleSubscription?: boolean; intervalMonths?: number; startingMonth?: number }) {
  const [page, setPage] = useState(1)
  const [allMonths, setAllMonths] = useState<PastMonth[]>([])
  const [totalPages, setTotalPages] = useState(1)

  const fromParams = fromYear != null
    ? `&fromYear=${fromYear}${fromMonth != null ? `&fromMonth=${fromMonth}` : ''}`
    : ''

  const untilParams = untilYear != null
    ? `&untilYear=${untilYear}${untilMonth != null ? `&untilMonth=${untilMonth}` : ''}`
    : ''

  const { data, isLoading, isFetching } = useQuery<PaginatedMonths>({
    queryKey: ['subscription-past-months', subscriptionSlug, page, fromYear, fromMonth, untilYear, untilMonth],
    queryFn: () =>
      apiFetch<PaginatedMonths>(
        `/subscriptions/${subscriptionSlug}/months?page=${page}&pageSize=${PAGE_SIZE}${fromParams}${untilParams}`,
      ),
    staleTime: 1000 * 60 * 5,
  })

  useEffect(() => {
    if (!data) return
    setTotalPages(data.totalPages)
    setAllMonths((prev) => {
      const existingIds = new Set(prev.map((m) => m.id))
      const newItems = data.data.filter((m) => !existingIds.has(m.id))
      return [...prev, ...newItems]
    })
  }, [data])

  const hasMore = page < totalPages

  // Group by bundle when applicable
  const bundleGroups: { key: string; label: string; months: PastMonth[] }[] | null =
    isBundleSubscription && intervalMonths > 1
      ? (() => {
          const map = new Map<string, PastMonth[]>()
          for (const m of allMonths) {
            const key = getBundleKey(m.year, m.month, intervalMonths, startingMonth)
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(m)
          }
          // Sort groups newest first
          return [...map.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([key, months]) => ({ key, label: getBundleLabel(key, intervalMonths), months }))
        })()
      : null

  const MonthGrid = ({ months }: { months: PastMonth[] }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {months.map((m) => (
        <MonthCard
          key={m.id}
          year={m.year}
          month={m.month}
          monthName={MONTH_NAMES[m.month - 1]}
          theme={m.theme}
          coverImage={m.coverImage}
          mainBook={getMainBook(m)}
          isSpoiler={m.isSpoiler}
          cardArtist={m.cardArtist ?? null}
          accentColors={accentColors}
          editionSlug={getEditionSlug(m)}
        />
      ))}
    </div>
  )

  return (
    <>
      <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">
        Previous Boxes
        {allMonths.length > 0 && (
          <span className="text-stone-500 text-lg ml-2 font-sans">({allMonths.length}{hasMore ? '+' : ''})</span>
        )}
        {totalMonths != null && allMonths.length === 0 && (
          <span className="text-stone-500 text-lg ml-2 font-sans">({totalMonths})</span>
        )}
      </h2>

      {isLoading && allMonths.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl bg-stone-800 aspect-[3/4]" />
          ))}
        </div>
      ) : bundleGroups ? (
        <>
          <div className="space-y-8">
            {bundleGroups.map((group) => (
              <div key={group.key}>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-stone-400 mb-3">
                  {group.label}
                </h3>
                <MonthGrid months={group.months} />
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={isFetching}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stone-700 text-stone-300 hover:border-amber-700/60 hover:text-amber-400 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFetching ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <MonthGrid months={allMonths} />
          {hasMore && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={isFetching}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stone-700 text-stone-300 hover:border-amber-700/60 hover:text-amber-400 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFetching ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}

export default function PreviousBoxes({ subscriptionSlug, accentColors, totalMonths, isCombo, comboComponents, comboStartDate, isBundleSubscription, intervalMonths, startingMonth, bundleUntilYear, bundleUntilMonth }: Props) {
  const [visible, setVisible] = useState(false)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  const comboFromYear = comboStartDate ? new Date(comboStartDate).getUTCFullYear() : undefined
  const comboFromMonth = comboStartDate ? new Date(comboStartDate).getUTCMonth() + 1 : undefined

  // For combo: show selector first; for regular: show "View previous boxes" button
  if (!visible) {
    return (
      <div className="mt-10 text-center">
        <button
          onClick={() => setVisible(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stone-700 text-stone-300 hover:border-amber-700/60 hover:text-amber-400 transition-colors text-sm font-medium"
        >
          View previous boxes
          {totalMonths != null && totalMonths > 0 && (
            <span className="text-stone-500 text-xs">({totalMonths})</span>
          )}
        </button>
      </div>
    )
  }

  // Combo: show component selector, load only after selection
  if (isCombo && comboComponents && comboComponents.length > 0) {
    return (
      <section className="mt-10">
        <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-4">Previous Boxes</h2>
        <p className="text-sm text-stone-400 mb-4">Select a subscription to view its previous boxes:</p>
        <div className="flex flex-wrap gap-2 mb-8">
          {comboComponents.map((c) => (
            <button
              key={c.slug}
              onClick={() => setSelectedSlug(c.slug)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                selectedSlug === c.slug
                  ? 'border-amber-600 bg-amber-600/10 text-amber-400'
                  : 'border-stone-700 text-stone-300 hover:border-amber-700/50 hover:text-amber-400'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        {selectedSlug && (
          <PreviousBoxesList key={selectedSlug} subscriptionSlug={selectedSlug} accentColors={accentColors} fromYear={comboFromYear} fromMonth={comboFromMonth} />
        )}
      </section>
    )
  }

  // Regular subscription
  return (
    <section className="mt-10">
      <PreviousBoxesList
        subscriptionSlug={subscriptionSlug}
        accentColors={accentColors}
        totalMonths={totalMonths}
        untilYear={bundleUntilYear}
        untilMonth={bundleUntilMonth}
        isBundleSubscription={isBundleSubscription}
        intervalMonths={intervalMonths}
        startingMonth={startingMonth}
      />
    </section>
  )
}
