'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { EditionCard } from '@/components/books/EditionCard'
import type { ApiCompanyEdition } from '@luxgrimoire/shared-types'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { API_BASE } from '@/lib/authFetch'

export interface EditionGroup {
  label: string
  href: string | null
  fetchPath: string
}

interface Props {
  groups: EditionGroup[]
  brandColors?: string[] | null
}

const PAGE_SIZE = 20

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
  // Accumulated editions per tab index
  const [loadedEditions, setLoadedEditions] = useState<Record<number, ApiCompanyEdition[]>>({})
  // Server-reported total per tab (used for hasMore)
  const [totals, setTotals] = useState<Record<number, number>>({})
  const [loadingTab, setLoadingTab] = useState<number | null>(null)
  const didAutoSwitch = useRef(false)

  if (groups.length === 0) return null

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

  // Load first tab on mount
  useEffect(() => {
    loadPage(0, 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-switch away from tab 0 ("Exclusive Editions") if it's empty
  useEffect(() => {
    if (
      !didAutoSwitch.current &&
      activeTab === 0 &&
      totals[0] === 0 &&
      loadedEditions[0] !== undefined &&
      loadingTab !== 0 &&
      groups.length > 1
    ) {
      didAutoSwitch.current = true
      setActiveTab(1)
      setSearch('')
      if (loadedEditions[1] === undefined) {
        loadPage(1, 0)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, loadedEditions, loadingTab])

  const activeEditions = loadedEditions[activeTab] ?? []
  const isLoading = loadingTab === activeTab && activeEditions.length === 0
  const isFetchingMore = loadingTab === activeTab && activeEditions.length > 0

  const filtered = (() => {
    const q = search.toLowerCase().trim()
    if (!q) return activeEditions
    return activeEditions.filter(
      (e) =>
        e.book.title.toLowerCase().includes(q) ||
        e.book.authors.some((a) => a.author.name.toLowerCase().includes(q)),
    )
  })()

  const serverTotal = totals[activeTab] ?? 0
  const hasMore = activeEditions.length < serverTotal

  const handleTabChange = (idx: number) => {
    setActiveTab(idx)
    setSearch('')
    if (loadedEditions[idx] === undefined) {
      loadPage(idx, 0)
    }
  }

  const loadMore = () => {
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
          {groups.map((group, idx) => (
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
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-stone-500 text-sm">
          Loading…
        </div>
      ) : filtered.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((edition) => (
              <EditionCard
                key={edition.id}
                href={`/editions/${edition.slug}`}
                coverImage={resolveEditionCoverRaw(edition)}
                title={edition.book.title}
                seriesName={edition.book.seriesName}
                volumeNumber={edition.book.volumeNumber}
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
                {isFetchingMore ? 'Loading…' : `Load more (${serverTotal - activeEditions.length} remaining)`}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-stone-500 text-sm py-10 text-center">
          {search ? 'No books match your search.' : 'No books in this group yet.'}
        </p>
      )}
    </section>
  )
}
