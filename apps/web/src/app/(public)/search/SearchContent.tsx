'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

type SearchTab = 'all' | 'books' | 'authors' | 'artists' | 'companies'

interface SearchResults {
  books?: Array<{ id: string; slug: string; title: string; coverImage: string | null; authors: Array<{ name: string }> }>
  authors?: Array<{ id: string; slug: string; name: string; photoUrl: string | null }>
  artists?: Array<{ id: string; slug: string; name: string; photoUrl: string | null }>
  companies?: Array<{ id: string; slug: string; name: string; logoUrl: string | null }>
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

  const [query, setQuery] = useState(q)
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<SearchTab>('all')

  const doSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(null)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(searchQuery)}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setQuery(q)
    doSearch(q)
  }, [q, doSearch])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    params.set('q', query)
    router.push(`/search?${params.toString()}`)
  }

  const totalCount =
    (results?.books?.length ?? 0) +
    (results?.authors?.length ?? 0) +
    (results?.artists?.length ?? 0) +
    (results?.companies?.length ?? 0)

  const tabs: { id: SearchTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'books', label: 'Books', count: results?.books?.length ?? 0 },
    { id: 'authors', label: 'Authors', count: results?.authors?.length ?? 0 },
    { id: 'artists', label: 'Artists', count: results?.artists?.length ?? 0 },
    { id: 'companies', label: 'Companies', count: results?.companies?.length ?? 0 },
  ]

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <h1 className="text-4xl font-serif font-bold text-stone-100 mb-8">Search</h1>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search books, authors, companies…"
          className="flex-1 bg-stone-800 border border-stone-700 rounded-full px-5 py-3 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-600 transition-colors"
          autoFocus
        />
        <button
          type="submit"
          className="px-6 py-3 bg-amber-700 hover:bg-amber-600 text-white rounded-full font-medium transition-colors"
        >
          Search
        </button>
      </form>

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
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-amber-700 text-white'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1 text-xs opacity-70">({tab.count})</span>
                )}
              </button>
            ))}
          </div>

          {totalCount === 0 && (
            <div className="text-center py-16">
              <p className="text-stone-400 text-lg mb-2">No results found</p>
              <p className="text-stone-600 text-sm">Try a different search term</p>
            </div>
          )}

          {/* Books */}
          {(activeTab === 'all' || activeTab === 'books') && (results.books?.length ?? 0) > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && (
                <h2 className="text-sm text-stone-500 uppercase tracking-wider mb-3 font-medium">Books</h2>
              )}
              <div className="space-y-2">
                {results.books!.map((book) => {
                  const cover = cloudinaryUrl(book.coverImage, 'w_60,c_fill,q_auto,f_auto')
                  return (
                    <Link
                      key={book.id}
                      href={`/books/${book.slug}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-stone-800 transition-colors group"
                    >
                      <div className="w-10 h-14 rounded overflow-hidden bg-stone-800 shrink-0">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover} alt={book.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-stone-700" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-100 group-hover:text-amber-400 transition-colors">
                          {book.title}
                        </p>
                        {book.authors?.length > 0 && (
                          <p className="text-xs text-stone-400">
                            {book.authors.map((a) => a.name).join(', ')}
                          </p>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* Authors */}
          {(activeTab === 'all' || activeTab === 'authors') && (results.authors?.length ?? 0) > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && (
                <h2 className="text-sm text-stone-500 uppercase tracking-wider mb-3 font-medium">Authors</h2>
              )}
              <div className="space-y-2">
                {results.authors!.map((author) => {
                  const photo = cloudinaryUrl(author.photoUrl, 'w_60,h_60,c_fill,q_auto,f_auto')
                  return (
                    <Link
                      key={author.id}
                      href={`/authors/${author.slug}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-stone-800 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-stone-800 shrink-0">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo} alt={author.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-stone-700 flex items-center justify-center text-xs text-stone-500">
                            {author.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-medium text-stone-100 group-hover:text-amber-400 transition-colors">
                        {author.name}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* Artists */}
          {(activeTab === 'all' || activeTab === 'artists') && (results.artists?.length ?? 0) > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && (
                <h2 className="text-sm text-stone-500 uppercase tracking-wider mb-3 font-medium">Artists</h2>
              )}
              <div className="space-y-2">
                {results.artists!.map((artist) => {
                  const photo = cloudinaryUrl(artist.photoUrl, 'w_60,h_60,c_fill,q_auto,f_auto')
                  return (
                    <Link
                      key={artist.id}
                      href={`/artists/${artist.slug}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-stone-800 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-stone-800 shrink-0">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo} alt={artist.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-stone-700 flex items-center justify-center text-xs text-stone-500">
                            {artist.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-medium text-stone-100 group-hover:text-amber-400 transition-colors">
                        {artist.name}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {/* Companies */}
          {(activeTab === 'all' || activeTab === 'companies') && (results.companies?.length ?? 0) > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && (
                <h2 className="text-sm text-stone-500 uppercase tracking-wider mb-3 font-medium">Companies</h2>
              )}
              <div className="space-y-2">
                {results.companies!.map((company) => {
                  const logo = cloudinaryUrl(company.logoUrl, 'w_60,h_60,c_fill,q_auto,f_auto')
                  return (
                    <Link
                      key={company.id}
                      href={`/companies/${company.slug}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-stone-800 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded overflow-hidden bg-stone-800 shrink-0">
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt={company.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-stone-700 flex items-center justify-center text-xs text-stone-500">
                            {company.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-medium text-stone-100 group-hover:text-amber-400 transition-colors">
                        {company.name}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}

      {!loading && !results && q && (
        <p className="text-stone-500 text-sm">Press Search to find results.</p>
      )}
    </div>
  )
}
