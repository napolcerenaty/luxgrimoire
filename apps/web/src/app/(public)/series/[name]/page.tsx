import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiBook, PaginatedResponse } from '@luxgrimoire/shared-types'
import { BackButton } from '@/components/ui/BackButton'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ name: string }>
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params
  const seriesName = decodeURIComponent(name)
  return {
    title: `${seriesName} – Series · LuxGrimoire`,
    description: `All books in the ${seriesName} series`,
  }
}

export default async function SeriesPage({ params }: Props) {
  const { name } = await params
  const seriesName = decodeURIComponent(name)

  const res = await apiFetch<PaginatedResponse<RawBook>>(
    `/books?seriesName=${encodeURIComponent(seriesName)}&pageSize=100`
  ).catch(() => null)

  const books = res?.data ?? []
  if (books.length === 0) notFound()

  const sorted = [...books].sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0))

  const seriesAuthors = Array.from(
    new Map(
      sorted.flatMap((b) => b.authors.map((ba) => [ba.author.id, ba.author])),
    ).values(),
  )

  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      <BackButton />

      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-stone-500 uppercase tracking-widest mb-1">Series</p>
        <h1 className="text-3xl font-serif font-bold text-amber-400">{seriesName}</h1>
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
        <p className="text-stone-500 text-xs mt-1">{sorted.length} book{sorted.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Books grouped with edition cards */}
      <div className="flex flex-col gap-10">
        {sorted.map((book) => (
          <SeriesBookSection key={book.id} book={book} />
        ))}
      </div>
    </div>
  )
}

// ── Per-book section ────────────────────────────────────────────────────────

function SeriesBookSection({ book }: { book: RawBook }) {
  const editions = book.editions ?? []
  const volumeLabel = book.volumeNumber != null ? `Vol. ${book.volumeNumber}` : null

  return (
    <div>
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

// ── Edition mini card ────────────────────────────────────────────────────────

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
      <div className="px-2 py-1.5">
        <p className="text-[11px] text-stone-400 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug text-center">
          {companyName}
        </p>
      </div>
    </Link>
  )
}
