'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
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
    edition?: { id: string; slug: string; additionalImages?: string[] | null } | null
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
    title: mb.book.title,
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
}

const PAGE_SIZE = 12

function PreviousBoxesList({
  subscriptionSlug,
  accentColors,
  totalMonths,
  fromYear,
  fromMonth,
}: { subscriptionSlug: string; accentColors?: string[] | null; totalMonths?: number; fromYear?: number; fromMonth?: number }) {
  const [page, setPage] = useState(1)
  const [allMonths, setAllMonths] = useState<PastMonth[]>([])
  const [totalPages, setTotalPages] = useState(1)

  const fromParams = fromYear != null
    ? `&fromYear=${fromYear}${fromMonth != null ? `&fromMonth=${fromMonth}` : ''}`
    : ''

  const { data, isLoading, isFetching } = useQuery<PaginatedMonths>({
    queryKey: ['subscription-past-months', subscriptionSlug, page, fromYear, fromMonth],
    queryFn: () =>
      apiFetch<PaginatedMonths>(
        `/subscriptions/${subscriptionSlug}/months?page=${page}&pageSize=${PAGE_SIZE}${fromParams}`,
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
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {allMonths.map((m) => (
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

export default function PreviousBoxes({ subscriptionSlug, accentColors, totalMonths, isCombo, comboComponents, comboStartDate }: Props) {
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
      <PreviousBoxesList subscriptionSlug={subscriptionSlug} accentColors={accentColors} totalMonths={totalMonths} />
    </section>
  )
}
