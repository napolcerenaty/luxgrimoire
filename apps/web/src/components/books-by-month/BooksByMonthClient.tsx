'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { MonthPicker } from '@/components/ui/MonthPicker'
import { EditionCard } from '@/components/books/EditionCard'

interface BookByMonthItem {
  subscriptionId: string
  subscriptionSlug: string
  subscriptionName: string
  companyName: string
  companySlug: string
  companyBrandColors: string[]
  bookId: string | null
  bookSlug: string | null
  bookTitle: string | null
  authors: string[]
  editionId: string | null
  editionSlug: string | null
  coverImage: string | null
  isPlaceholder: boolean
  highlight: 'mine' | 'skipped' | null
}
interface BooksByMonthResponse {
  year: number
  month: number
  items: BookByMonthItem[]
}

type ViewMode = 'flat' | 'by-book' | 'by-company'
type HighlightFilter = 'mine' | 'skipped' | 'other' | null

function itemKey(item: BookByMonthItem) {
  return `${item.subscriptionId}-${item.bookId ?? 'placeholder'}`
}

function BookByMonthCard({ item }: { item: BookByMonthItem }) {
  const href = item.editionSlug
    ? `/editions/${item.editionSlug}`
    : item.bookSlug
      ? `/books/${item.bookSlug}`
      : `/subscriptions/${item.subscriptionSlug}`

  return (
    <EditionCard
      href={href}
      coverImage={item.coverImage}
      companyName={item.subscriptionName}
      companyBrandColors={item.companyBrandColors}
      title={item.bookTitle ?? undefined}
      authors={item.authors.map((name) => ({ name }))}
      highlight={item.highlight}
      footer={
        <div className="text-[10px] text-stone-500">
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/companies/${item.companySlug}` }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); window.location.href = `/companies/${item.companySlug}` } }}
            className="hover:text-amber-400 transition-colors cursor-pointer"
          >
            {item.companyName}
          </span>
          {item.isPlaceholder && <span className="block italic text-stone-600 mt-0.5">Not yet announced</span>}
        </div>
      }
    />
  )
}

const TOGGLE_BASE = 'px-3 py-2 rounded-lg text-xs font-medium transition-colors border'
const TOGGLE_ACTIVE = 'bg-amber-500/20 text-amber-400 border-amber-500/30'
const TOGGLE_INACTIVE = 'bg-stone-800 text-stone-400 border-stone-700 hover:text-stone-200 hover:border-stone-600'

const LEGEND_PILL_BASE = 'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors'

export function BooksByMonthClient() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [viewMode, setViewMode] = useState<ViewMode>('flat')
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>(null)

  const { data, isLoading } = useQuery<BooksByMonthResponse>({
    queryKey: ['books-by-month', year, month],
    queryFn: () => authFetch<BooksByMonthResponse>(`/subscriptions/books-by-month?year=${year}&month=${month}`),
  })

  const items = data?.items ?? []
  const hasAnyHighlight = items.some((i) => i.highlight != null)

  const filteredItems = useMemo(() => {
    if (!highlightFilter) return items
    if (highlightFilter === 'other') return items.filter((i) => i.highlight == null)
    return items.filter((i) => i.highlight === highlightFilter)
  }, [items, highlightFilter])

  const groups = useMemo(() => {
    if (viewMode === 'flat') return null
    const map = new Map<string, { key: string; label: string; items: BookByMonthItem[] }>()
    for (const item of filteredItems) {
      const key = viewMode === 'by-book' ? (item.bookId ?? `placeholder-${item.subscriptionId}`) : item.companySlug
      const label = viewMode === 'by-company' ? item.companyName : (item.bookTitle ?? 'Not yet announced')
      if (!map.has(key)) map.set(key, { key, label, items: [] })
      map.get(key)!.items.push(item)
    }
    return [...map.values()]
  }, [filteredItems, viewMode])

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} maxAheadMonths={1} />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setViewMode('flat')} className={`${TOGGLE_BASE} ${viewMode === 'flat' ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`}>
            Flat list
          </button>
          <button onClick={() => setViewMode('by-book')} className={`${TOGGLE_BASE} ${viewMode === 'by-book' ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`}>
            Group by book
          </button>
          <button onClick={() => setViewMode('by-company')} className={`${TOGGLE_BASE} ${viewMode === 'by-company' ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`}>
            Group by company
          </button>
        </div>
      </div>

      {hasAnyHighlight && (
        <div className="flex flex-wrap gap-2 mb-6" aria-label="Highlight legend and filter">
          <button
            onClick={() => setHighlightFilter((f) => (f === 'mine' ? null : 'mine'))}
            className={`${LEGEND_PILL_BASE} edition-glow-gold ${highlightFilter === 'mine' ? 'border-amber-400 text-amber-300' : 'border-stone-700 text-stone-400'}`}
          >
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Mine
          </button>
          <button
            onClick={() => setHighlightFilter((f) => (f === 'skipped' ? null : 'skipped'))}
            className={`${LEGEND_PILL_BASE} edition-glow-red ${highlightFilter === 'skipped' ? 'border-red-400 text-red-300' : 'border-stone-700 text-stone-400'}`}
          >
            <span className="h-2 w-2 rounded-full bg-red-500" /> Skipped
          </button>
          <button
            onClick={() => setHighlightFilter((f) => (f === 'other' ? null : 'other'))}
            className={`${LEGEND_PILL_BASE} ${highlightFilter === 'other' ? 'border-stone-400 text-stone-200' : 'border-stone-700 text-stone-400'}`}
          >
            <span className="h-2 w-2 rounded-full bg-stone-600" /> Other
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-stone-400 py-12 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-stone-500 text-center py-12 bg-stone-900/50 rounded-2xl border border-stone-800">
          No entries for this month.
        </div>
      ) : viewMode === 'flat' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredItems.map((item) => <BookByMonthCard key={itemKey(item)} item={item} />)}
        </div>
      ) : (
        <div className="space-y-8">
          {groups!.map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-serif font-semibold text-stone-300">{group.label}</h2>
                {group.items.length > 1 && (
                  <span className="text-xs text-stone-500">
                    {viewMode === 'by-book' ? `Shared by ${group.items.length} subscriptions this month` : `${group.items.length} books`}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {group.items.map((item) => <BookByMonthCard key={itemKey(item)} item={item} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
