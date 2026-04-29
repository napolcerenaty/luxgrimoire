import type { Metadata } from 'next'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import type { ApiBook, PaginatedResponse } from '@luxgrimoire/shared-types'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ series?: string; search?: string; page?: string }>
}

interface RawBook extends Omit<ApiBook, 'authors'> {
  authors: { author: { id: string; name: string; slug: string } }[]
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { series } = await searchParams
  return {
    title: series ? `${series} – Books · LuxGrimoire` : 'Books · LuxGrimoire',
    description: series
      ? `All books in the ${series} series`
      : 'Browse all books in the LuxGrimoire collection',
  }
}

export default async function BooksPage({ searchParams }: Props) {
  const { series, search, page: pageStr } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10))
  const pageSize = 48

  const params = new URLSearchParams({ pageSize: String(pageSize), page: String(page) })
  if (series) params.set('seriesName', series)
  if (search) params.set('search', search)

  const res = await apiFetch<PaginatedResponse<RawBook>>(`/books?${params}`).catch(() => null)
  const books = res?.data ?? []
  const total = res?.total ?? 0
  const totalPages = res?.totalPages ?? 1

  // Within a series, sort by volume number
  const sorted = series
    ? [...books].sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0))
    : books

  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          {series ? (
            <>
              <p className="text-xs text-stone-500 uppercase tracking-widest mb-1">Series</p>
              <h1 className="text-3xl font-serif font-bold text-amber-400">{series}</h1>
              <p className="text-stone-400 text-sm mt-1">{total} book{total !== 1 ? 's' : ''}</p>
            </>
          ) : (
            <h1 className="text-3xl font-serif font-bold text-stone-100">Books</h1>
          )}
        </div>
        {series && (
          <Link
            href="/books"
            className="text-xs text-stone-400 hover:text-amber-400 border border-stone-700 hover:border-amber-700 px-3 py-1.5 rounded-full transition-colors"
          >
            ← All books
          </Link>
        )}
      </div>

      {/* Search */}
      {!series && (
        <form method="get" className="mb-8 flex gap-2 max-w-md">
          <input
            name="search"
            defaultValue={search}
            placeholder="Search books…"
            className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-600"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm rounded-lg transition-colors"
          >
            Search
          </button>
        </form>
      )}

      {/* Grid */}
      {sorted.length === 0 ? (
        <p className="text-stone-500 text-center py-20">No books found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {sorted.map((book) => {
            const authors = book.authors.map((ba) => ba.author.name).join(', ')
            const seriesLabel = book.seriesName
              ? book.volumeNumber
                ? `${book.seriesName} #${book.volumeNumber}`
                : book.seriesName
              : null

            return (
              <Link
                key={book.id}
                href={`/books/${book.slug}`}
                className="group flex flex-col rounded-lg overflow-hidden border border-stone-800 hover:border-amber-600/60 transition-all duration-200"
                style={{ background: 'var(--bg-raised)' }}
              >
                {/* Cover */}
                <div className="relative overflow-hidden" style={{ aspectRatio: '2/3' }}>
                  <div className="w-full h-full flex items-center justify-center bg-stone-800">
                    <span className="text-3xl font-serif text-amber-700/50">{book.title.charAt(0)}</span>
                  </div>
                </div>

                {/* Info */}
                <div className="px-2.5 py-2 flex-1 flex flex-col">
                  <p className="text-xs font-serif font-semibold text-stone-200 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">
                    {book.title}
                  </p>
                  {authors && (
                    <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-1">{authors}</p>
                  )}
                  {seriesLabel && (
                    <p className="text-[10px] text-amber-600/80 mt-0.5 line-clamp-1">{seriesLabel}</p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-10">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const ps = new URLSearchParams()
            if (series) ps.set('series', series)
            if (search) ps.set('search', search)
            ps.set('page', String(p))
            return (
              <Link
                key={p}
                href={`/books?${ps}`}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  p === page
                    ? 'bg-amber-700 border-amber-600 text-stone-100'
                    : 'border-stone-700 text-stone-400 hover:border-amber-700 hover:text-amber-400'
                }`}
              >
                {p}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
