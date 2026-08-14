'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type WheelEvent, type PointerEvent } from 'react'
import { EditionCard } from '@/components/books/EditionCard'
import type { ApiCompanyEdition } from '@luxgrimoire/shared-types'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { API_BASE, authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'

export interface EditionGroup {
  label: string
  href: string | null
  fetchPath: string
  /** Hide this tab entirely if the loaded total is 0 */
  hideIfEmpty?: boolean
}

interface Props {
  companySlug: string
  groups: EditionGroup[]
  brandColors?: string[] | null
}

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300

type OwnershipBucket = 'have-it' | 'coming' | 'gone'
type StatusFilter = OwnershipBucket | 'skipped'

// Dot colors are hardcoded CSS classes (status-dot-*, globals.css), not Tailwind bg-brand-*/
// bg-stone-* utilities — this site's @theme block remaps those palettes to its blue/navy brand
// accent, so e.g. "bg-brand-400" renders blue here, not gold. Each status-dot-* class matches
// the RGB of its corresponding .edition-glow-* box-shadow so the filter dot and the card glow
// it represents can never visually disagree.
const STATUS_FILTER_META: { value: StatusFilter; label: string; dotClass: string }[] = [
  { value: 'have-it', label: 'Have it', dotClass: 'status-dot-gold' },
  { value: 'coming', label: 'Coming', dotClass: 'status-dot-amber' },
  { value: 'gone', label: 'Gone', dotClass: 'status-dot-slate' },
  { value: 'skipped', label: 'Skipped', dotClass: 'status-dot-red' },
]

function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

export function CompanyBooksSection({ companySlug, groups, brandColors }: Props) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Per-user ownership/skip overlay — deliberately fetched separately from the public,
  // shared-cache edition list above (see CompaniesService.getMyEditionStatuses), merged
  // onto cards by editionId once it resolves so it never blocks the public grid's render.
  const [ownership, setOwnership] = useState<Record<string, OwnershipBucket>>({})
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [fetchedIds, setFetchedIds] = useState<Set<string>>(new Set())
  const [statusFilters, setStatusFilters] = useState<Set<StatusFilter>>(new Set())

  // Clear the overlay on sign-out (or account switch) — otherwise the previous user's glow
  // stays on screen since it was fetched into local state, not derived from the auth context.
  useEffect(() => {
    setOwnership({})
    setSkipped(new Set())
    setFetchedIds(new Set())
  }, [user?.id])
  // Accumulated editions per tab index (unfiltered browsing, not search)
  const [loadedEditions, setLoadedEditions] = useState<Record<number, ApiCompanyEdition[]>>({})
  // Server-reported total per tab (used for hasMore)
  const [totals, setTotals] = useState<Record<number, number>>({})
  const [loadingTab, setLoadingTab] = useState<number | null>(null)
  // Tabs hidden after loading with 0 results (hideIfEmpty groups)
  const [hiddenTabs, setHiddenTabs] = useState<Set<number>>(new Set())

  // Server-side search results for the active tab — kept separate from loadedEditions
  // so clearing the search restores the previously-loaded browsing list instantly.
  const [searchResults, setSearchResults] = useState<ApiCompanyEdition[]>([])
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchLoading, setSearchLoading] = useState(false)

  if (groups.length === 0) return null

  // Debounce the raw input before it drives a server request
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  const loadPage = useCallback(async (idx: number, skip: number) => {
    setLoadingTab(idx)
    try {
      const sep = groups[idx].fetchPath.includes('?') ? '&' : '?'
      const url = `${API_BASE}${groups[idx].fetchPath}${sep}skip=${skip}&take=${PAGE_SIZE}`
      const res = await fetch(url, { credentials: 'include' })
      const { data, total }: { data: ApiCompanyEdition[]; total: number } = await res.json()
      setTotals((prev) => ({ ...prev, [idx]: total }))
      setLoadedEditions((prev) => {
        const existing = prev[idx] ?? []
        // Deduplicate by id in case of race conditions
        const existingIds = new Set(existing.map((e) => e.id))
        const newItems = data.filter((e) => !existingIds.has(e.id))
        return { ...prev, [idx]: [...existing, ...newItems] }
      })
    } catch {
      setLoadedEditions((prev) => ({ ...prev, [idx]: prev[idx] ?? [] }))
    } finally {
      setLoadingTab((prev) => (prev === idx ? null : prev))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups])

  // Runs the search server-side against the active tab's endpoint. `append` controls
  // whether this is a fresh search (replace results) or a "load more" continuation.
  const loadSearchPage = useCallback(async (idx: number, term: string, skip: number, append: boolean) => {
    setSearchLoading(true)
    try {
      const sep = groups[idx].fetchPath.includes('?') ? '&' : '?'
      const url = `${API_BASE}${groups[idx].fetchPath}${sep}search=${encodeURIComponent(term)}&skip=${skip}&take=${PAGE_SIZE}`
      const res = await fetch(url, { credentials: 'include' })
      const { data, total }: { data: ApiCompanyEdition[]; total: number } = await res.json()
      setSearchTotal(total)
      setSearchResults((prev) => {
        if (!append) return data
        const existingIds = new Set(prev.map((e) => e.id))
        return [...prev, ...data.filter((e) => !existingIds.has(e.id))]
      })
    } catch {
      if (!append) setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups])

  // Load first tab on mount
  useEffect(() => {
    loadPage(0, 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fire a fresh server-side search whenever the debounced term or active tab changes
  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([])
      setSearchTotal(0)
      return
    }
    loadSearchPage(activeTab, debouncedSearch, 0, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, activeTab])

  // Hide tabs marked hideIfEmpty once we know they're empty, then switch away
  useEffect(() => {
    const newHidden = new Set(hiddenTabs)
    let changed = false
    groups.forEach((group, idx) => {
      if (
        group.hideIfEmpty &&
        totals[idx] === 0 &&
        loadedEditions[idx] !== undefined &&
        loadingTab !== idx &&
        !newHidden.has(idx)
      ) {
        newHidden.add(idx)
        changed = true
      }
    })
    if (changed) {
      setHiddenTabs(newHidden)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, loadedEditions, loadingTab])

  // Auto-switch away from active tab if it becomes hidden
  useEffect(() => {
    if (!hiddenTabs.has(activeTab)) return
    const nextVisible = groups.findIndex((_, idx) => !hiddenTabs.has(idx))
    if (nextVisible !== -1) {
      setActiveTab(nextVisible)
      setSearch('')
      setDebouncedSearch('')
      if (loadedEditions[nextVisible] === undefined) {
        loadPage(nextVisible, 0)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenTabs])

  const activeEditions = loadedEditions[activeTab] ?? []
  const isSearching = debouncedSearch.length > 0
  const displayed = isSearching ? searchResults : activeEditions
  const isLoading = isSearching
    ? searchLoading && searchResults.length === 0
    : loadingTab === activeTab && activeEditions.length === 0
  const isFetchingMore = isSearching
    ? searchLoading && searchResults.length > 0
    : loadingTab === activeTab && activeEditions.length > 0

  const serverTotal = isSearching ? searchTotal : (totals[activeTab] ?? 0)
  const hasMore = displayed.length < serverTotal

  // Fetch ownership/skip status for any newly-visible editions (new page load, tab switch, or
  // search results) — one bulk call per batch of new ids, capped the same way the API caps it.
  useEffect(() => {
    if (!user) return
    const newIds = displayed.map((e) => e.id).filter((id) => !fetchedIds.has(id))
    if (newIds.length === 0) return
    setFetchedIds((prev) => new Set([...prev, ...newIds]))
    authFetch<{ ownership: Record<string, OwnershipBucket>; skipped: string[] }>(
      `/companies/${companySlug}/editions/my-status?editionIds=${newIds.slice(0, 100).join(',')}`,
    ).then(({ ownership: newOwnership, skipped: newSkipped }) => {
      setOwnership((prev) => ({ ...prev, ...newOwnership }))
      setSkipped((prev) => new Set([...prev, ...newSkipped]))
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayed, user?.id])

  // Ownership takes priority over "skipped" — if the user has the book some other way, that's
  // the fact worth showing, not that this particular box's copy was skipped.
  const highlightFor = useCallback((editionId: string): StatusFilter | null => {
    if (ownership[editionId]) return ownership[editionId]
    if (skipped.has(editionId)) return 'skipped'
    return null
  }, [ownership, skipped])

  const hasAnyStatus = useMemo(
    () => displayed.some((e) => highlightFor(e.id) != null),
    [displayed, highlightFor],
  )

  const filteredDisplayed = statusFilters.size === 0
    ? displayed
    : displayed.filter((e) => {
        const h = highlightFor(e.id)
        return h != null && statusFilters.has(h)
      })

  const toggleStatusFilter = (value: StatusFilter) => {
    setStatusFilters((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  // The chip strip hides its scrollbar for a cleaner look, which leaves desktop mouse users
  // (no touch/trackpad swipe) with no discoverable way to scroll it — a plain wheel only
  // scrolls the page vertically. Redirect vertical wheel input into horizontal scroll while
  // hovering the strip, the standard pattern for horizontal carousels.
  const handleChipStripWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY === 0) return
    e.currentTarget.scrollLeft += e.deltaY
  }

  // Click-and-drag scrolling (Pointer Events unify mouse/touch/pen). `moved` tracks whether
  // the pointer travelled far enough to count as a drag rather than a click, so a drag that
  // ends on top of a chip doesn't also fire that chip's onClick and change the active tab.
  const dragState = useRef({ dragging: false, startX: 0, startScrollLeft: 0, moved: false })

  const handleChipStripPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    dragState.current = { dragging: true, startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false }
    // Deliberately NOT capturing the pointer here yet — capturing on every press (even a
    // stationary click) retargets the subsequent native `click` event to this container
    // instead of the chip button underneath, silently breaking normal clicks. Only capture
    // once movement confirms this is an actual drag, in handlePointerMove below.
  }

  const handleChipStripPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return
    const dx = e.clientX - dragState.current.startX
    if (!dragState.current.moved && Math.abs(dx) > 3) {
      dragState.current.moved = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (dragState.current.moved) {
      e.currentTarget.scrollLeft = dragState.current.startScrollLeft - dx
    }
  }

  const handleChipStripPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    dragState.current.dragging = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleChipClick = (idx: number) => {
    if (dragState.current.moved) return
    handleTabChange(idx)
  }

  const handleTabChange = (idx: number) => {
    setActiveTab(idx)
    setSearch('')
    setDebouncedSearch('')
    if (loadedEditions[idx] === undefined) {
      loadPage(idx, 0)
    }
  }

  const loadMore = () => {
    if (isSearching) {
      if (searchLoading) return
      loadSearchPage(activeTab, debouncedSearch, searchResults.length, true)
      return
    }
    if (loadingTab !== null) return
    loadPage(activeTab, activeEditions.length)
  }

  return (
    <section className="mt-12">
      {/* Header row: title + search */}
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-2xl font-serif font-semibold text-navy-100 shrink-0">Books</h2>
        <div className="ml-auto relative w-full max-w-[12rem]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-500 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search books…"
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg bg-navy-800 border border-navy-700 text-navy-200 placeholder-navy-500 focus:outline-none focus:border-brand-600/60 w-full"
          />
        </div>
      </div>

      {/* Tabs always render as the horizontal-scroll chip strip, regardless of group count —
          a plain wrapping tab row for ≤3 groups used to look like a different component
          switching in as soon as a 4th group appeared. One interaction pattern instead of
          forking per count (see CLAUDE.md's responsive-design guidance): swipe is the native
          mobile gesture, and desktop users can still scroll/shift+scroll it.
          -mx-4/px-4 bleed to the true screen edge, which only makes sense in the single-column
          mobile layout — at lg: the two-column layout makes this the narrower main column
          (sharing width with the 320px sticky rail), so the bleed math was cutting chips off
          at the main column's edge instead of the real viewport edge. Reset to 0 at lg:. */}
      <div
        onWheel={handleChipStripWheel}
        onPointerDown={handleChipStripPointerDown}
        onPointerMove={handleChipStripPointerMove}
        onPointerUp={handleChipStripPointerUp}
        onPointerCancel={handleChipStripPointerUp}
        className="mb-6 -mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory cursor-grab active:cursor-grabbing select-none"
      >
        {groups.map((group, idx) => {
          if (hiddenTabs.has(idx)) return null
          return (
            <button
              key={group.label}
              onClick={() => handleChipClick(idx)}
              className={`shrink-0 snap-start whitespace-nowrap flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-medium font-serif transition-colors border ${
                activeTab === idx
                  ? 'bg-brand-900/30 border-brand-600 text-brand-400'
                  : 'bg-navy-800 border-navy-700 text-navy-400'
              }`}
            >
              {/* No truncation — several groups can share a long common prefix (e.g.
                  "Signing Edition: X"), and truncating right where they diverge made chips
                  indistinguishable from each other. The strip already scrolls/drags, so a
                  wider chip costs nothing. */}
              <span>{group.label}</span>
              {totals[idx] !== undefined && <span className="text-navy-500">({totals[idx]})</span>}
            </button>
          )
        })}
      </div>

      {/* Ownership/skip filter chips — only appears once we know the logged-in user has at
          least one status to filter by, on the currently visible batch of editions. */}
      {hasAnyStatus && (
        <div className="inline-flex items-center gap-1 rounded-lg border border-navy-700 bg-navy-900/60 p-1 mb-5" aria-label="Filter by your status — select any combination">
          <button
            onClick={() => setStatusFilters(new Set())}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${statusFilters.size === 0 ? 'bg-navy-700 text-navy-100' : 'text-navy-400 hover:text-navy-200'}`}
          >
            All
          </button>
          {STATUS_FILTER_META.map(({ value, label, dotClass }) => (
            <button
              key={value}
              onClick={() => toggleStatusFilter(value)}
              aria-pressed={statusFilters.has(value)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${statusFilters.has(value) ? 'bg-navy-700 text-navy-100' : 'text-navy-400 hover:text-navy-200'}`}
            >
              <span className={`h-2 w-2 rounded-full ${dotClass}`} /> {label}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-navy-500 text-sm">
          Loading…
        </div>
      ) : filteredDisplayed.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredDisplayed.map((edition) => (
              <EditionCard
                key={edition.id}
                href={`/editions/${edition.slug}`}
                coverImage={resolveEditionCoverRaw(edition)}
                title={edition.book.title}
                variantLabel={edition.variantLabel}
                seriesName={edition.book.seriesName}
                volumeNumbers={edition.book.volumeNumbers}
                authors={edition.book.authors.map((a) => ({ name: a.author.name }))}
                companyBrandColors={brandColors}
                highlight={highlightFor(edition.id)}
              />
            ))}
          </div>

          <div className="mt-5 flex items-center justify-center">
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={isFetchingMore}
                className="px-5 py-2 text-sm rounded-lg bg-navy-800 border border-navy-700 text-navy-300 hover:bg-navy-700 hover:text-brand-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFetchingMore ? 'Loading…' : `Load more (${serverTotal - displayed.length} remaining)`}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-navy-500 text-sm py-10 text-center">
          {isSearching
            ? 'No books match your search.'
            : statusFilters.size > 0
              ? 'No books match your status filter.'
              : 'No books in this group yet.'}
        </p>
      )}
    </section>
  )
}
