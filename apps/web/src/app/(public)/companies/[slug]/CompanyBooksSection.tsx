'use client'

import { useState, useEffect, useCallback } from 'react'
import { EditionCard } from '@/components/books/EditionCard'
import type { ApiCompanyEdition } from '@luxgrimoire/shared-types'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { API_BASE } from '@/lib/authFetch'

export interface EditionGroup {
  label: string
  href: string | null
  fetchPath: string
  /** Hide this tab entirely if the loaded total is 0 */
  hideIfEmpty?: boolean
}

interface Props {
  groups: EditionGroup[]
  brandColors?: string[] | null
}

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300

function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

export function CompanyBooksSection({ groups, brandColors }: Props) {
  const [activeTab, setActiveTab] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
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
        <h2 className="text-2xl font-serif font-semibold text-stone-100 shrink-0">Books</h2>
        <div className="ml-auto relative w-full max-w-[12rem]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search books…"
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg bg-stone-800 border border-stone-700 text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-600/60 w-full"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-stone-800 mb-6">
        <div className="flex flex-wrap gap-0">
          {groups.map((group, idx) => {
            if (hiddenTabs.has(idx)) return null
            return (
              <button
                key={group.label}
                onClick={() => handleTabChange(idx)}
                className={`px-4 py-2.5 text-sm font-medium font-serif whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  activeTab === idx
                    ? 'border-amber-600 text-amber-400'
                    : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                {group.label}
                {totals[idx] !== undefined && (
                  <span className="ml-1.5 text-xs text-stone-500">({totals[idx]})</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-stone-500 text-sm">
          Loading…
        </div>
      ) : displayed.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {displayed.map((edition) => (
              <EditionCard
                key={edition.id}
                href={`/editions/${edition.slug}`}
                coverImage={resolveEditionCoverRaw(edition)}
                title={edition.book.title}
                seriesName={edition.book.seriesName}
                volumeNumbers={edition.book.volumeNumbers}
                authors={edition.book.authors.map((a) => ({ name: a.author.name }))}
                companyBrandColors={brandColors}
              />
            ))}
          </div>

          <div className="mt-5 flex items-center justify-center">
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={isFetchingMore}
                className="px-5 py-2 text-sm rounded-lg bg-stone-800 border border-stone-700 text-stone-300 hover:bg-stone-700 hover:text-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFetchingMore ? 'Loading…' : `Load more (${serverTotal - displayed.length} remaining)`}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-stone-500 text-sm py-10 text-center">
          {isSearching ? 'No books match your search.' : 'No books in this group yet.'}
        </p>
      )}
    </section>
  )
}
