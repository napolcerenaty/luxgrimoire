import type { Metadata } from 'next'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiBook, PaginatedResponse } from '@luxgrimoire/shared-types'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ series?: string; search?: string; page?: string }>
}

interface RawEdition {
  id: string
  slug: string
  editionName: string | null
  additionalImages: string[]
  bookBoxCompanyCustomName: string | null
  bookBoxCompany: { name: string; slug: string } | null
  verifiedAt: string | null
}

interface RawBook extends Omit<ApiBook, 'authors' | 'editions'> {
  authors: { author: { id: string; name: string; slug: string } }[]
  editions?: RawEdition[]
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

  // Collect all authors for the series header (deduplicated)
  const seriesAuthors = series
    ? Array.from(
        new Map(
          sorted.flatMap((b) => b.authors.map((ba) => [ba.author.id, ba.author])),
        ).values(),
      )
    : []

  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          {series ? (
            <>
              <p className="text-xs text-stone-500 uppercase tracking-widest mb-1">Series</p>
              <h1 className="text-3xl font-serif font-bold text-amber-400">{series}</h1>
              {seriesAuthors.length > 0 && (
                <p className="text-stone-400 text-sm mt-1">
                  by{' '}
                  {seriesAuthors.map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && ', '}
                      <Link href={`/authors/${a.slug}`} className="hover:text-amber-400 transition-colors">
                        {a.name}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
              <p className="text-stone-500 text-xs mt-1">{total} book{total !== 1 ? 's' : ''}</p>
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

      {/* Series view — grouped by book with edition cards */}
      {series ? (
        sorted.length === 0 ? (
          <p className="text-stone-500 text-center py-20">No books found.</p>
        ) : (
          <div className="flex flex-col gap-10">
            {sorted.map((book) => (
              <SeriesBookSection key={book.id} book={book} />
            ))}
          </div>
        )
      ) : (
        /* Default grid view */
        <>
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
                    <div className="relative overflow-hidden" style={{ aspectRatio: '2/3' }}>
                      <div className="w-full h-full flex items-center justify-center bg-stone-800">
                        <span className="text-3xl font-serif text-amber-700/50">{book.title.charAt(0)}</span>
                      </div>
                    </div>
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
        </>
      )}
    </div>
  )
}

// ── Per-book section in series view ─────────────────────────────────────────

function SeriesBookSection({ book }: { book: RawBook }) {
  const editions = book.editions ?? []
  const volumeLabel = book.volumeNumber != null ? `Vol. ${book.volumeNumber}` : null

  return (
    <div>
      {/* Book header */}
      <div className="flex items-baseline gap-3 mb-4 border-b border-stone-800 pb-3">
        {volumeLabel && (
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-600/80 shrink-0">
            {volumeLabel}
          </span>
        )}
        <Link
          href={`/books/${book.slug}`}
          className="text-xl font-serif font-semibold text-stone-100 hover:text-amber-400 transition-colors"
        >
          {book.title}
        </Link>
      </div>

      {/* Edition cards */}
      {editions.length === 0 ? (
        <p className="text-stone-600 text-sm italic">No verified editions yet.</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {editions.map((edition) => (
            <EditionMiniCard key={edition.id} edition={edition} bookTitle={book.title} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Simplified edition card — cover + company name ───────────────────────────

function EditionMiniCard({ edition, bookTitle }: { edition: RawEdition; bookTitle: string }) {
  const companyName = edition.bookBoxCompanyCustomName ?? edition.bookBoxCompany?.name ?? 'Unknown'
  const coverUrl = cloudinaryUrl(
    edition.additionalImages?.[0] ?? null,
    'w_300,c_fill,q_auto,f_auto',
  )

  return (
    <Link
      href={`/editions/${edition.slug}`}
      className="group w-28 sm:w-32 flex flex-col rounded-lg overflow-hidden border border-stone-800 hover:border-amber-600/50 transition-all duration-200 bg-stone-900"
    >
      {/* Cover */}
      <div className="relative overflow-hidden bg-stone-800" style={{ aspectRatio: '2/3' }}>
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={`${bookTitle} – ${companyName}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl font-serif text-amber-700/40">{bookTitle.charAt(0)}</span>
          </div>
        )}
      </div>

      {/* Company name */}
      <div className="px-2 py-1.5">
        <p className="text-[11px] text-stone-400 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug text-center">
          {companyName}
        </p>
      </div>
    </Link>
  )
}
