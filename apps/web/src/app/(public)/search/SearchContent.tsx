'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, Loader2, Megaphone, X } from 'lucide-react'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { resolveEditionCoverUrl } from '@/lib/editionCover'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'
import { API_BASE } from '@/lib/authFetch'
import { getEarliestTierDate } from '@/lib/saleTiers'
import type { ApiSearchResult } from '@luxgrimoire/shared-types'

type SearchTab = 'all' | 'books' | 'editions' | 'authors' | 'artists' | 'subscriptions' | 'companies' | 'sales'

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms) }
}

function SkeletonCard() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-stone-800 animate-pulse">
      <div className="w-10 h-14 rounded bg-stone-700 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-stone-700 rounded w-3/4" />
        <div className="h-3 bg-stone-700 rounded w-1/2" />
      </div>
    </div>
  )
}

export function SearchContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const q = searchParams.get('q') ?? ''
  const filterParam = (searchParams.get('filter') ?? 'all') as SearchTab

  const [query, setQuery] = useState(q)
  const [results, setResults] = useState<ApiSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<SearchTab>(filterParam)

  const doSearch = useCallback(
    debounce(async (searchQuery: string, tab: SearchTab) => {
      if (!searchQuery.trim() || searchQuery.trim().length < 2) { setResults(null); setLoading(false); return }
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(searchQuery)}&filter=${tab}`)
        if (res.ok) setResults(await res.json())
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }, 300),
    [],
  )

  useEffect(() => { setQuery(q); setActiveTab(filterParam) }, [q, filterParam])
  useEffect(() => { doSearch(query, activeTab) }, [query, activeTab, doSearch])

  const handleQueryChange = (v: string) => {
    setQuery(v)
    const p = new URLSearchParams(searchParams.toString())
    if (v) p.set('q', v); else p.delete('q')
    router.replace(`/search?${p.toString()}`, { scroll: false })
  }

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab)
    const p = new URLSearchParams(searchParams.toString())
    if (tab !== 'all') p.set('filter', tab); else p.delete('filter')
    router.replace(`/search?${p.toString()}`, { scroll: false })
  }

  const totalCount =
    (results?.books?.length ?? 0) + (results?.editions?.length ?? 0) +
    (results?.authors?.length ?? 0) +
    (results?.artists?.length ?? 0) + (results?.subscriptions?.length ?? 0) +
    (results?.companies?.length ?? 0) + (results?.sales?.length ?? 0)

  const tabs: { id: SearchTab; label: string; count: number }[] = [
    { id: 'all',           label: 'All',           count: totalCount },
    { id: 'books',         label: 'Books',         count: results?.books?.length ?? 0 },
    { id: 'editions',      label: 'Editions',      count: results?.editions?.length ?? 0 },
    { id: 'authors',       label: 'Authors',       count: results?.authors?.length ?? 0 },
    { id: 'artists',       label: 'Artists',       count: results?.artists?.length ?? 0 },
    { id: 'subscriptions', label: 'Subscriptions', count: results?.subscriptions?.length ?? 0 },
    { id: 'companies',     label: 'Companies',     count: results?.companies?.length ?? 0 },
    { id: 'sales',         label: 'Sales',         count: results?.sales?.length ?? 0 },
  ]

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <h1 className="text-4xl font-serif font-bold text-stone-100 mb-8">Search</h1>

      {/* Search input — real-time, debounced */}
      <div className="relative mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search books, authors, artists, subscriptions, companies…"
          className="w-full bg-stone-800 border border-stone-700 rounded-full px-5 py-3 pr-12 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-brand-600 transition-colors"
          autoFocus
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-500">
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : query ? (
            <button
              type="button"
              onClick={() => handleQueryChange('')}
              className="text-stone-400 hover:text-brand-400 transition-colors"
            >
              <X size={18} />
            </button>
          ) : (
            <Search size={18} />
          )}
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && results && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id ? 'bg-brand-700 text-white' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {tab.label}
                {tab.count > 0 && <span className="ml-1 text-xs opacity-70">({tab.count})</span>}
              </button>
            ))}
          </div>

          {totalCount === 0 && (
            <div className="py-10 space-y-5">
              <div className="text-center">
                <p className="text-stone-300 text-lg mb-1">Didn&apos;t find what you&apos;re looking for?</p>
                <p className="text-stone-500 text-sm">Send us a data request and we&apos;ll add it to the database.</p>
              </div>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link
                  href="/data-requests"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-700 hover:bg-brand-600 text-stone-950 font-semibold rounded-full text-sm transition-colors"
                >
                  Request missing data
                </Link>
                <Link
                  href="/sale-announcement-requests"
                  className="inline-flex items-center gap-2 px-5 py-2.5 border border-stone-700 hover:border-stone-500 text-stone-300 hover:text-stone-100 rounded-full text-sm transition-colors"
                >
                  <span>📣</span> Report a sale
                </Link>
              </div>
            </div>
          )}

          {/* Books */}
          {(activeTab === 'all' || activeTab === 'books') && (results.books?.length ?? 0) > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && <h2 className="text-sm text-stone-500 uppercase tracking-wider mb-3 font-medium">Books</h2>}
              <div className="space-y-2">
                {results.books!.map((book) => (
                  <Link key={book.id} href={`/books/${book.slug}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-stone-800 transition-colors group">
                    <div className="w-2 h-8 rounded-sm bg-brand-900/50 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-100 group-hover:text-brand-400 transition-colors truncate">{book.title}</p>
                      {book.authors?.length > 0 && <p className="text-xs text-stone-400 truncate">{book.authors.map((a) => a.author.name).join(', ')}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Editions */}
          {(activeTab === 'all' || activeTab === 'editions') && (results.editions?.length ?? 0) > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && <h2 className="text-sm text-stone-500 uppercase tracking-wider mb-3 font-medium">Editions</h2>}
              <div className="space-y-2">
                {results.editions!.map((ed) => {
                  const cover = resolveEditionCoverUrl(ed, 'w_60,c_fill,q_auto,f_auto')
                  const isUpcoming = ed.resolvedSaleDate?.date && new Date(ed.resolvedSaleDate.date) > new Date()
                  const displayTitle = formatEditionDisplayTitle(ed.book, ed)
                  return (
                    <Link key={ed.id} href={`/editions/${ed.slug}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-stone-800 transition-colors group">
                      <div className="relative w-10 h-14 rounded overflow-hidden bg-stone-800 shrink-0">
                        {cover ? <Image src={cover} alt={displayTitle} fill className="object-cover" unoptimized /> : <div className="w-full h-full bg-stone-800 flex items-center justify-center text-stone-600 text-[10px]">no img</div>}
                        {isUpcoming && <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-brand-400 uppercase bg-black/60">soon</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-100 group-hover:text-brand-400 transition-colors truncate">{displayTitle}</p>
                        <p className="text-xs text-stone-500 truncate">
                          {[ed.bookBoxCompany?.name, ed.publisher].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      {isUpcoming && <span className="text-[9px] text-brand-500 border border-brand-700 rounded px-1.5 py-0.5 shrink-0">Upcoming</span>}
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* Authors */}
          {(activeTab === 'all' || activeTab === 'authors') && (results.authors?.length ?? 0) > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && <h2 className="text-sm text-stone-500 uppercase tracking-wider mb-3 font-medium">Authors</h2>}
              <div className="space-y-2">
                {results.authors!.map((author) => {
                  const photo = cloudinaryUrl(author.photoUrl, 'w_60,h_60,c_fill,q_auto,f_auto')
                  return (
                    <Link key={author.id} href={`/authors/${author.slug}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-stone-800 transition-colors group">
                      <div className="relative w-10 h-10 rounded-full overflow-hidden bg-stone-800 shrink-0">
                        {photo ? <Image src={photo} alt={author.name} fill className="object-cover" unoptimized /> : <div className="w-full h-full bg-stone-700 flex items-center justify-center text-xs text-stone-500">{author.name.charAt(0)}</div>}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-100 group-hover:text-brand-400 transition-colors">{author.name}</p>
                        {author.nationality && <p className="text-xs text-stone-500">{author.nationality}</p>}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* Artists */}
          {(activeTab === 'all' || activeTab === 'artists') && (results.artists?.length ?? 0) > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && <h2 className="text-sm text-stone-500 uppercase tracking-wider mb-3 font-medium">Artists</h2>}
              <div className="space-y-2">
                {results.artists!.map((artist) => {
                  const photo = cloudinaryUrl(artist.photoUrl, 'w_60,h_60,c_fill,q_auto,f_auto')
                  return (
                    <Link key={artist.id} href={`/artists/${artist.slug}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-stone-800 transition-colors group">
                      <div className="relative w-10 h-10 rounded-full overflow-hidden bg-stone-800 shrink-0">
                        {photo ? <Image src={photo} alt={artist.name} fill className="object-cover" unoptimized /> : <div className="w-full h-full bg-stone-700 flex items-center justify-center text-xs text-stone-500">{artist.name.charAt(0)}</div>}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-100 group-hover:text-brand-400 transition-colors">{artist.name}</p>
                        {artist.specialty && <p className="text-xs text-stone-500">{artist.specialty}</p>}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* Subscriptions */}
          {(activeTab === 'all' || activeTab === 'subscriptions') && (results.subscriptions?.length ?? 0) > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && <h2 className="text-sm text-stone-500 uppercase tracking-wider mb-3 font-medium">Subscriptions</h2>}
              <div className="space-y-2">
                {results.subscriptions!.map((sub) => {
                  const logo = cloudinaryUrl(sub.company?.logoUrl, 'w_60,h_60,c_fill,q_auto,f_auto')
                  return (
                    <Link key={sub.id} href={`/subscriptions/${sub.slug}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-stone-800 transition-colors group">
                      <div className="relative w-10 h-10 rounded overflow-hidden bg-stone-800 shrink-0">
                        {logo ? <Image src={logo} alt={sub.name} fill className="object-cover" unoptimized /> : <div className="w-full h-full bg-stone-700 flex items-center justify-center text-xs text-stone-500">{sub.name.charAt(0)}</div>}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-100 group-hover:text-brand-400 transition-colors">{sub.name}</p>
                        <p className="text-xs text-stone-500">{[sub.company?.name, sub.type, sub.isDiscontinued ? 'Discontinued' : null].filter(Boolean).join(' · ')}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* Companies */}
          {(activeTab === 'all' || activeTab === 'companies') && (results.companies?.length ?? 0) > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && <h2 className="text-sm text-stone-500 uppercase tracking-wider mb-3 font-medium">Companies</h2>}
              <div className="space-y-2">
                {results.companies!.map((company) => {
                  const logo = cloudinaryUrl(company.logoUrl, 'w_60,h_60,c_fill,q_auto,f_auto')
                  return (
                    <Link key={company.id} href={`/companies/${company.slug}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-stone-800 transition-colors group">
                      <div className="relative w-10 h-10 rounded overflow-hidden bg-stone-800 shrink-0">
                        {logo ? <Image src={logo} alt={company.name} fill className="object-cover" unoptimized /> : <div className="w-full h-full bg-stone-700 flex items-center justify-center text-xs text-stone-500">{company.name.charAt(0)}</div>}
                      </div>
                      <p className="text-sm font-medium text-stone-100 group-hover:text-brand-400 transition-colors">{company.name}</p>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* Sales */}
          {(activeTab === 'all' || activeTab === 'sales') && (results.sales?.length ?? 0) > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && <h2 className="text-sm text-stone-500 uppercase tracking-wider mb-3 font-medium">Sales</h2>}
              <div className="space-y-2">
                {results.sales!.map((sale) => {
                  const saleDate = getEarliestTierDate(sale)
                  const isPast = saleDate && new Date(saleDate) < new Date()
                  const saleImage = cloudinaryUrl(sale.imageUrl) ?? cloudinaryUrl(sale.company?.logoUrl) ?? null
                  return (
                    <Link key={sale.id} href={`/sale-announcements/${sale.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-stone-800 transition-colors group">
                      <div className="relative w-10 h-10 rounded bg-stone-800 shrink-0 overflow-hidden flex items-center justify-center">
                        {saleImage
                          ? <Image src={saleImage} alt={sale.title} fill className="object-cover" unoptimized />
                          : <Megaphone size={18} className="text-brand-700/60" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-100 group-hover:text-brand-400 transition-colors truncate">{sale.title}</p>
                        <p className="text-xs text-stone-500 truncate">
                          {[sale.company?.name, sale.isBundle ? 'Bundle' : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      {isPast
                        ? <span className="text-[9px] text-stone-500 border border-stone-700 rounded px-1.5 py-0.5 shrink-0">Past</span>
                        : <span className="text-[9px] text-brand-500 border border-brand-700 rounded px-1.5 py-0.5 shrink-0">Upcoming</span>
                      }
                    </Link>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}

      {!loading && !results && query.length >= 2 && (
        <p className="text-stone-500 text-sm">Searching…</p>
      )}
      {!loading && !results && query.length < 2 && (
        <p className="text-stone-500 text-sm">Enter at least 2 characters to search.</p>
      )}

      {/* Always shown below results */}
      <div className="mt-10 pt-6 border-t border-stone-800 text-center">
        <p className="text-stone-400 text-sm mb-2">Didn't find what you're looking for?</p>
        <Link
          href="/sale-announcement-requests"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-stone-500 text-stone-300 hover:text-stone-100 text-sm transition-colors"
        >
          Request missing data
        </Link>
      </div>
    </div>
  )
}