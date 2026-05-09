'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { EditionCard } from '@/components/books/EditionCard'
import type { ApiCompanyEdition } from '@luxgrimoire/shared-types'

export interface EditionGroup {
  label: string
  href: string | null
  editions: ApiCompanyEdition[]
}

interface Props {
  groups: EditionGroup[]
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

export function CompanyBooksSection({ groups }: Props) {
  const [activeTab, setActiveTab] = useState(0)
  const [search, setSearch] = useState('')
  const [visible, setVisible] = useState<Record<number, number>>({})

  if (groups.length === 0) return null

  const getVisible = (idx: number) => visible[idx] ?? PAGE_SIZE
  const activeGroup = groups[activeTab]

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return activeGroup.editions
    return activeGroup.editions.filter(
      (e) =>
        e.book.title.toLowerCase().includes(q) ||
        e.book.authors.some((a) => a.author.name.toLowerCase().includes(q)),
    )
  }, [activeGroup, search])

  const visibleCount = getVisible(activeTab)
  const displayed = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  const handleTabChange = (idx: number) => {
    setActiveTab(idx)
    setSearch('')
  }

  const loadMore = () => {
    setVisible((prev) => ({
      ...prev,
      [activeTab]: (prev[activeTab] ?? PAGE_SIZE) + PAGE_SIZE,
    }))
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

      {/* Tabs — scrollable on mobile */}
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-stone-800 mb-6">
        <div className="flex gap-0 min-w-max">
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
              <span className="ml-1.5 text-xs text-stone-500">({group.editions.length})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {displayed.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {displayed.map((edition) => (
              <EditionCard
                key={edition.id}
                href={`/editions/${edition.slug}`}
                coverImage={edition.additionalImages?.[0] ?? edition.communityPhotoCover ?? null}
                title={edition.book.title}
                seriesName={edition.book.seriesName}
                volumeNumber={edition.book.volumeNumber}
                authors={edition.book.authors.map((a) => ({ name: a.author.name }))}
              />
            ))}
          </div>

          <div className="mt-5 flex items-center justify-center gap-4">
            {hasMore && (
              <button
                onClick={loadMore}
                className="px-5 py-2 text-sm rounded-lg bg-stone-800 border border-stone-700 text-stone-300 hover:bg-stone-700 hover:text-amber-400 transition-colors"
              >
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            )}
            {activeGroup.href && !hasMore && (
              <Link
                href={activeGroup.href}
                className="text-xs text-amber-600 hover:text-amber-400 transition-colors"
              >
                View full collection →
              </Link>
            )}
          </div>
        </>
      ) : (
        <p className="text-stone-500 text-sm py-10 text-center">
          {search ? 'No books match your search.' : 'No books in this collection.'}
        </p>
      )}
    </section>
  )
}
