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
interface BookGroup {
  key: string
  label: string
  items: BookByMonthItem[]
}

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

// Both the view-mode toggle and the highlight filter render as this same segmented-control
// shape — one bordered pill-group container, plain buttons inside — instead of two visually
// different toolbar styles bolted on next to each other.
const SEGMENT_WRAP = 'inline-flex items-center gap-1 rounded-lg border border-stone-700 bg-stone-900/60 p-1'
const SEGMENT_BTN = 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap'
const SEGMENT_ACTIVE = 'bg-stone-700 text-stone-100'
const SEGMENT_INACTIVE = 'text-stone-400 hover:text-stone-200'

const CARD_GRID = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
const SEARCH_INPUT = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400 text-sm'

function matchesSearch(item: BookByMonthItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    (item.bookTitle?.toLowerCase().includes(q) ?? false) ||
    item.authors.some((a) => a.toLowerCase().includes(q)) ||
    item.companyName.toLowerCase().includes(q) ||
    item.subscriptionName.toLowerCase().includes(q)
  )
}

export function BooksByMonthClient() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [viewMode, setViewMode] = useState<ViewMode>('flat')
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const { data, isLoading } = useQuery<BooksByMonthResponse>({
    queryKey: ['books-by-month', year, month],
    queryFn: () => authFetch<BooksByMonthResponse>(`/subscriptions/books-by-month?year=${year}&month=${month}`),
  })

  const items = data?.items ?? []
  const hasAnyHighlight = items.some((i) => i.highlight != null)

  const filteredItems = useMemo(() => {
    let result = items
    if (highlightFilter) {
      result = highlightFilter === 'other'
        ? result.filter((i) => i.highlight == null)
        : result.filter((i) => i.highlight === highlightFilter)
    }
    if (searchQuery.trim()) result = result.filter((i) => matchesSearch(i, searchQuery))
    return result
  }, [items, highlightFilter, searchQuery])

  const groups = useMemo((): BookGroup[] | null => {
    if (viewMode === 'flat') return null
    const map = new Map<string, BookGroup>()
    for (const item of filteredItems) {
      const key = viewMode === 'by-book' ? (item.bookId ?? `placeholder-${item.subscriptionId}`) : item.companySlug
      const label = viewMode === 'by-company' ? item.companyName : (item.bookTitle ?? 'Not yet announced')
      if (!map.has(key)) map.set(key, { key, label, items: [] })
      map.get(key)!.items.push(item)
    }
    return [...map.values()]
  }, [filteredItems, viewMode])

  // Most groups (especially "by book") only ever have one item — giving each of those its own
  // header + near-empty row produces a long, sparse list. Only groups with an actual overlap
  // (2+ items) earn a dedicated section; every singleton collapses into one compact flat grid
  // below them (the company/book name is still visible per-card in its footer/title either way).
  const { multiGroups, singleItems } = useMemo(() => {
    if (!groups) return { multiGroups: [] as BookGroup[], singleItems: [] as BookByMonthItem[] }
    return {
      multiGroups: groups.filter((g) => g.items.length > 1),
      singleItems: groups.filter((g) => g.items.length === 1).flatMap((g) => g.items),
    }
  }, [groups])

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center mb-4">
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} maxAheadMonths={1} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title, author, company, or subscription…"
          className={`${SEARCH_INPUT} lg:flex-1`}
          aria-label="Search books by month"
        />
        <div className={SEGMENT_WRAP}>
          <button onClick={() => setViewMode('flat')} className={`${SEGMENT_BTN} ${viewMode === 'flat' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}>
            Flat
          </button>
          <button onClick={() => setViewMode('by-book')} className={`${SEGMENT_BTN} ${viewMode === 'by-book' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}>
            By book
          </button>
          <button onClick={() => setViewMode('by-company')} className={`${SEGMENT_BTN} ${viewMode === 'by-company' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}>
            By company
          </button>
        </div>
      </div>

      {hasAnyHighlight && (
        <div className={`${SEGMENT_WRAP} mb-6`} aria-label="Highlight filter">
          <button
            onClick={() => setHighlightFilter(null)}
            className={`${SEGMENT_BTN} ${highlightFilter === null ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
          >
            All
          </button>
          <button
            onClick={() => setHighlightFilter((f) => (f === 'mine' ? null : 'mine'))}
            className={`${SEGMENT_BTN} ${highlightFilter === 'mine' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: '#d4af37' }} /> Mine
          </button>
          <button
            onClick={() => setHighlightFilter((f) => (f === 'skipped' ? null : 'skipped'))}
            className={`${SEGMENT_BTN} ${highlightFilter === 'skipped' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
          >
            <span className="h-2 w-2 rounded-full bg-red-500" /> Skipped
          </button>
          <button
            onClick={() => setHighlightFilter((f) => (f === 'other' ? null : 'other'))}
            className={`${SEGMENT_BTN} ${highlightFilter === 'other' ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
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
      ) : filteredItems.length === 0 ? (
        <div className="text-stone-500 text-center py-12 bg-stone-900/50 rounded-2xl border border-stone-800">
          No matches for your search{highlightFilter ? ' and filters' : ''}.
        </div>
      ) : viewMode === 'flat' ? (
        <div className={CARD_GRID}>
          {filteredItems.map((item) => <BookByMonthCard key={itemKey(item)} item={item} />)}
        </div>
      ) : (
        <div className="space-y-8">
          {multiGroups.length === 0 && (
            <p className="text-sm text-stone-500">
              {viewMode === 'by-book'
                ? 'No duplicates this month — every book is unique to one subscription.'
                : 'No company has more than one release this month.'}
            </p>
          )}
          {multiGroups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-serif font-semibold text-stone-300">{group.label}</h2>
                <span className="text-xs text-stone-500">
                  {viewMode === 'by-book' ? `Shared by ${group.items.length} subscriptions this month` : `${group.items.length} books`}
                </span>
              </div>
              <div className={CARD_GRID}>
                {group.items.map((item) => <BookByMonthCard key={itemKey(item)} item={item} />)}
              </div>
            </div>
          ))}
          {singleItems.length > 0 && (
            <div>
              {multiGroups.length > 0 && (
                <h2 className="text-sm font-serif font-semibold text-stone-300 mb-3">
                  {viewMode === 'by-book' ? 'Everything else this month' : 'Other releases'}
                </h2>
              )}
              <div className={CARD_GRID}>
                {singleItems.map((item) => <BookByMonthCard key={itemKey(item)} item={item} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
