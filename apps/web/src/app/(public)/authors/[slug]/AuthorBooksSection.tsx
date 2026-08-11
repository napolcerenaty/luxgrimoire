import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { EditionCard } from '@/components/books/EditionCard'
import { formatVolumeNumbers, compareVolumeNumbers } from '@/lib/volumeNumbers'

interface EditionSnippet {
  id: string
  slug: string
  additionalImages: string[]
  communityPhotoCover?: string | null
  verifiedAt: string | null
  generalSaleDate?: string | null
  resolvedSaleDate?: { label: string; date: string } | null
  variantLabel?: string | null
  bookBoxCompany: { name: string; slug: string; brandColors?: string[] | null } | null
}

interface BookSnippet {
  id: string
  slug: string
  title: string
  seriesName: string | null
  series?: { id: string; slug: string; name: string } | null
  volumeNumbers: number[]
  editions: EditionSnippet[]
}

function BookRow({ book }: { book: BookSnippet }) {
  const label = book.volumeNumbers.length > 0
    ? `#${formatVolumeNumbers(book.volumeNumbers)} ${book.title}`
    : book.title

  return (
    <div className="py-4 border-b border-stone-800 last:border-0">
      <Link
        href={`/books/${book.slug}`}
        className="inline-block font-serif font-semibold text-stone-100 hover:text-brand-400 transition-colors mb-3 text-base leading-snug"
      >
        {label}
      </Link>
      {book.editions.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {book.editions.map(edition => (
            <EditionCard
              key={edition.id}
              href={`/editions/${edition.slug}`}
              coverImage={resolveEditionCoverRaw(edition)}
              companyName={edition.bookBoxCompany?.name}
              companyBrandColors={edition.bookBoxCompany?.brandColors}
              unverified={!edition.verifiedAt}
              generalSaleDate={edition.resolvedSaleDate?.date ?? null}
              variantLabel={edition.variantLabel}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export async function AuthorBooksSection({ authorSlug, authorName }: { authorSlug: string; authorName: string }) {
  const books = await apiFetch<BookSnippet[]>(`/authors/${authorSlug}/books`)

  if (!books.length) {
    return <p className="text-stone-600 text-sm">No books listed yet.</p>
  }

  const standalones = books
    .filter(b => !b.series && !b.seriesName)
    .sort((a, b) => a.title.localeCompare(b.title))
  // A book spanning more than one volume number (e.g. [1,2,3]) is a bind-up/omnibus edition —
  // kept in its own section rather than interleaved by volume number, same reasoning as the
  // series page: an omnibus has no single numeric position that wouldn't read as surprising
  // sitting in a strictly-numbered list of individual volumes.
  const standaloneVolumes = standalones.filter(b => b.volumeNumbers.length <= 1)
  const standaloneOmnibuses = standalones.filter(b => b.volumeNumbers.length > 1)

  // key = series slug (preferred) or series name (legacy fallback)
  const seriesMap = new Map<string, { label: string; slug: string | null; books: BookSnippet[] }>()
  for (const book of books) {
    const key = book.series?.slug ?? book.seriesName
    if (!key) continue
    const existing = seriesMap.get(key)
    if (existing) existing.books.push(book)
    else seriesMap.set(key, { label: book.series?.name ?? book.seriesName!, slug: book.series?.slug ?? null, books: [book] })
  }

  return (
    <section>
      <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">
        Books by {authorName}
        <span className="ml-2 text-base font-sans font-normal text-stone-500">({books.length})</span>
      </h2>

      {standalones.length > 0 && (
        <div className="mb-10">
          {seriesMap.size > 0 && (
            <h3 className="text-xs uppercase tracking-widest text-stone-500 font-medium mb-2 border-b border-stone-800 pb-2">
              Standalones
            </h3>
          )}
          {standaloneVolumes.map(book => <BookRow key={book.id} book={book} />)}
          {standaloneOmnibuses.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-widest text-stone-600 font-medium mb-2">
                Also available as a bind-up edition
              </p>
              {standaloneOmnibuses.map(book => <BookRow key={book.id} book={book} />)}
            </div>
          )}
        </div>
      )}

      {Array.from(seriesMap.entries()).map(([key, { label, slug, books: seriesBooks }]) => {
        const volumes = seriesBooks
          .filter(b => b.volumeNumbers.length <= 1)
          .sort((a, b) => compareVolumeNumbers(a.volumeNumbers, b.volumeNumbers))
        const omnibuses = seriesBooks
          .filter(b => b.volumeNumbers.length > 1)
          .sort((a, b) => compareVolumeNumbers(a.volumeNumbers, b.volumeNumbers))
        return (
          <div key={key} className="mb-10">
            <h3 className="text-xs uppercase tracking-widest text-stone-500 font-medium mb-2 border-b border-stone-800 pb-2">
              {slug ? (
                <Link href={`/series/${slug}`} className="hover:text-brand-400 transition-colors">
                  {label}
                </Link>
              ) : label}
            </h3>
            {volumes.map(book => <BookRow key={book.id} book={book} />)}
            {omnibuses.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-widest text-stone-600 font-medium mb-2">
                  Also available as a bind-up edition
                </p>
                {omnibuses.map(book => <BookRow key={book.id} book={book} />)}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
