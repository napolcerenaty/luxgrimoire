'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Search, BookOpen, User, Brush, Package, Building2, Layers, Megaphone, X } from 'lucide-react'
import type { ApiSearchResult } from '@luxgrimoire/shared-types'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { resolveEditionCoverUrl } from '@/lib/editionCover'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'
import { API_BASE } from '@/lib/authFetch'

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function SearchDropdown() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiSearchResult | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const fetchResults = useCallback(
    debounce(async (q: string) => {
      if (q.length < 2) {
        setResults(null)
        setOpen(false)
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const data: ApiSearchResult = await res.json()
          setResults(data)
          setOpen(true)
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    }, 300),
    [],
  )

  useEffect(() => {
    fetchResults(query)
  }, [query, fetchResults])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const total = results
    ? results.books.length + (results.editions?.length ?? 0) + results.authors.length + results.artists.length +
      results.subscriptions.length + results.companies.length + (results.sales?.length ?? 0)
    : 0

  const navigate = useCallback((href: string) => {
    setOpen(false)
    setQuery('')
    setResults(null)
    router.push(href)
  }, [router])

  const goSearch = () => {
    if (query.trim().length >= 2) {
      setOpen(false)
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative w-full">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && goSearch()}
          placeholder="Search books, editions…"
          className="w-full bg-stone-800/80 border border-stone-700 rounded-full pl-4 pr-9 py-1.5 text-xs text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-amber-600 transition-colors"
        />
        {query ? (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus() }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-amber-400 transition-colors"
          >
            <X size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={goSearch}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-amber-400 transition-colors"
          >
            <Search size={13} className={loading ? 'animate-pulse' : ''} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full mt-2 left-0 w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-stone-700 bg-stone-900 shadow-2xl z-[200]">
          {results !== null && total === 0 ? (
            <div className="px-4 py-4 space-y-2">
              <p className="text-xs text-stone-400">Didn&apos;t find what you&apos;re looking for?</p>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => navigate('/data-requests')}
                  className="text-left text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  ✦ Add it to the database →
                </button>
                <button
                  onClick={() => navigate('/sale-announcement-requests')}
                  className="text-left text-xs text-stone-500 hover:text-stone-400 transition-colors"
                >
                  📢 Report a sale announcement →
                </button>
              </div>
            </div>
          ) : (
            <div className="py-1">
              <ResultGroup
                title="Books"
                icon={<BookOpen size={11} />}
                items={results!.books.map((b) => ({
                  key: b.id,
                  label: b.title,
                  sub: b.authors[0]?.author.name,
                  image: null,
                  noPlaceholder: true,
                  href: `/books/${b.slug}`,
                }))}
                onNavigate={navigate}
                query={query}
              />
              <ResultGroup
                title="Editions"
                icon={<Layers size={11} />}
                items={(results!.editions ?? []).map((e) => ({
                  key: e.id,
                  label: formatEditionDisplayTitle(e.book, e),
                  sub: [e.bookBoxCompany?.name, e.publisher].filter(Boolean).join(' · ') || null,
                  image: resolveEditionCoverUrl(e),
                  badge: e.generalSaleDate && new Date(e.generalSaleDate) > new Date() ? 'Upcoming' : null,
                  href: `/editions/${e.slug}`,
                }))}
                onNavigate={navigate}
                query={query}
              />
              <ResultGroup
                title="Authors"
                icon={<User size={11} />}
                items={results!.authors.map((a) => ({
                  key: a.id,
                  label: a.name,
                  sub: a.nationality,
                  image: a.photoUrl,
                  href: `/authors/${a.slug}`,
                }))}
                onNavigate={navigate}
                query={query}
              />
              <ResultGroup
                title="Artists"
                icon={<Brush size={11} />}
                items={results!.artists.map((a) => ({
                  key: a.id,
                  label: a.name,
                  sub: a.specialty,
                  image: a.photoUrl,
                  href: `/artists/${a.slug}`,
                }))}
                onNavigate={navigate}
                query={query}
              />
              <ResultGroup
                title="Subscriptions"
                icon={<Package size={11} />}
                items={results!.subscriptions.map((s) => ({
                  key: s.id,
                  label: s.name,
                  sub: s.company?.name,
                  image: cloudinaryUrl(s.company?.logoUrl),
                  href: `/subscriptions/${s.slug}`,
                }))}
                onNavigate={navigate}
                query={query}
              />
              <ResultGroup
                title="Companies"
                icon={<Building2 size={11} />}
                items={results!.companies.map((c) => ({
                  key: c.id,
                  label: c.name,
                  sub: c.country,
                  image: cloudinaryUrl(c.logoUrl),
                  href: `/companies/${c.slug}`,
                }))}
                onNavigate={navigate}
                query={query}
              />
              <ResultGroup
                title="Sales"
                icon={<Megaphone size={11} />}
                items={(results!.sales ?? []).map((s) => ({
                  key: s.id,
                  label: s.title,
                  sub: s.company?.name,
                  image: cloudinaryUrl(s.imageUrl) ?? cloudinaryUrl(s.company?.logoUrl),
                  badge: s.availableForPurchase ? 'Live' : null,
                  href: `/sale-announcements/${s.id}`,
                }))}
                onNavigate={navigate}
                query={query}
              />

              {total > 0 && (
                <button
                  onClick={goSearch}
                  className="w-full text-left px-4 py-2.5 text-xs text-amber-500 hover:bg-stone-800 border-t border-stone-800 transition-colors"
                >
                  See all results for &ldquo;{query}&rdquo;
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ResultItem {
  key: string
  label: string
  sub?: string | null
  image?: string | null
  badge?: string | null
  href: string
  noPlaceholder?: boolean
}

function ResultGroup({
  title,
  icon,
  items,
  onNavigate,
  query,
}: {
  title: string
  icon: React.ReactNode
  items: ResultItem[]
  onNavigate: (href: string) => void
  query: string
}) {
  if (!items.length) return null

  const highlight = (text: string | null | undefined) => {
    if (!text) return <span>{text}</span>
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return <span>{text}</span>
    return (
      <span>
        {text.slice(0, idx)}
        <mark className="bg-amber-500/20 text-amber-600 rounded-sm px-px">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-widest text-stone-500 font-semibold">
        {icon} {title}
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onNavigate(item.href)}
          className="w-full flex items-center gap-3 px-4 py-2 hover:bg-stone-800 transition-colors text-left"
        >
          {(item.image || !item.noPlaceholder) && (
            <div className="w-8 h-8 rounded-md bg-stone-800 shrink-0 overflow-hidden flex items-center justify-center">
              {item.image ? (
                <Image src={item.image} alt={item.label} width={32} height={32} className="w-full h-full object-cover" unoptimized />
              ) : (
                <span className="text-stone-700"><BookOpen size={12} /></span>
              )}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-stone-200 truncate">{highlight(item.label)}</p>
            {item.sub && <p className="text-[10px] text-stone-500 truncate">{item.sub}</p>}
          </div>
          {item.badge && (
            <span className="text-[9px] text-amber-600 border border-amber-800 rounded px-1 py-0.5 shrink-0 max-w-[70px] truncate">
              {item.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

