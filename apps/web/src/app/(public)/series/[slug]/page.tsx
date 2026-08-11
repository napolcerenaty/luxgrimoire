import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { BackButton } from '@/components/ui/BackButton'
import { EditionCard } from '@/components/books/EditionCard'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { formatVolumeNumbers } from '@/lib/volumeNumbers'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

interface RawEdition {
  id: string
  slug: string
  additionalImages: string[]
  communityPhotoCover?: string | null
  bookBoxCompany: { name: string; slug: string; brandColors?: string[] | null } | null
  verifiedAt: string | null
  generalSaleDate: string | null
  resolvedSaleDate?: { label: string; date: string } | null
  variantLabel?: string | null
}

interface RawBook {
  id: string
  slug: string
  title: string
  volumeNumbers: number[]
  isPrimarySeries: boolean
  authors: { author: { id: string; name: string; slug: string } }[]
  editions?: RawEdition[]
}

interface SeriesDetail {
  id: string
  slug: string
  name: string
  volumes: RawBook[]
  omnibuses: RawBook[]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const series = await apiFetch<SeriesDetail>(`/book-series/${slug}`)
    return {
      title: `${series.name} – Series · LuxGrimoire`,
      description: `All books in the ${series.name} series`,
    }
  } catch {
    return { title: 'Series not found' }
  }
}

export default async function SeriesPage({ params }: Props) {
  const { slug } = await params

  const series = await apiFetch<SeriesDetail>(`/book-series/${slug}`).catch(() => null)
  const totalCount = (series?.volumes.length ?? 0) + (series?.omnibuses.length ?? 0)
  if (!series || totalCount === 0) notFound()

  const seriesAuthors = Array.from(
    new Map(
      [...series.volumes, ...series.omnibuses].flatMap((b) => b.authors.map((ba) => [ba.author.id, ba.author])),
    ).values(),
  )

  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      <BackButton />

      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-stone-500 uppercase tracking-widest mb-1">Series</p>
        <h1 className="text-3xl font-serif font-bold text-brand-400">{series.name}</h1>
        {seriesAuthors.length > 0 && (
          <p className="text-stone-400 text-sm mt-1">
            by{' '}
            {seriesAuthors.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <Link href={`/authors/${a.slug}`} className="hover:text-brand-400 transition-colors">
                  {a.name}
                </Link>
              </span>
            ))}
          </p>
        )}
        <p className="text-stone-500 text-xs mt-1">{totalCount} book{totalCount !== 1 ? 's' : ''}</p>
      </div>

      {/* Individual volumes */}
      <div className="flex flex-col gap-10">
        {series.volumes.map((book) => (
          <SeriesBookSection key={book.id} book={book} />
        ))}
      </div>

      {/* Omnibus / bind-up editions — kept separate rather than interleaved by volume number:
          an omnibus spanning e.g. volumes 1-3 has no single numeric position that wouldn't be
          surprising sitting in a strictly-numbered list of individual volumes. */}
      {series.omnibuses.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-medium mb-4 border-b border-stone-800 pb-2">
            Also available as a bind-up edition
          </h2>
          <div className="flex flex-col gap-10">
            {series.omnibuses.map((book) => (
              <SeriesBookSection key={book.id} book={book} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Per-book section ────────────────────────────────────────────────────────

function SeriesBookSection({ book }: { book: RawBook }) {
  const editions = book.editions ?? []
  const volumeLabel = book.volumeNumbers.length > 0 ? `Vol. ${formatVolumeNumbers(book.volumeNumbers)}` : null

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-4 border-b border-stone-800 pb-3">
        {volumeLabel && (
          <span className="text-xs font-semibold uppercase tracking-widest text-brand-600/80 shrink-0">
            {volumeLabel}
          </span>
        )}
        <Link
          href={`/books/${book.slug}`}
          className="text-xl font-serif font-semibold text-stone-100 hover:text-brand-400 transition-colors"
        >
          {book.title}
        </Link>
      </div>

      {editions.length === 0 ? (
        <p className="text-stone-600 text-sm italic">No verified editions yet.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {editions.map((edition) => (
            <EditionCard
              key={edition.id}
              href={`/editions/${edition.slug}`}
              coverImage={resolveEditionCoverRaw(edition)}
              companyName={edition.bookBoxCompany?.name}
              companySlug={edition.bookBoxCompany?.slug}
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
