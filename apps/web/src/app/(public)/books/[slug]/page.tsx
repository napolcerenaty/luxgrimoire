import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import { ReviewsSection } from '@/components/reviews/ReviewsSection'
import { AddEditionForm } from '@/components/books/AddEditionForm'
import { ArtistLink } from '@/components/ui/ArtistLink'
import { EditionCard } from '@/components/books/EditionCard'
import { BookBundleInfo } from '@/components/books/BookBundleInfo'
import type { ApiBook } from '@luxgrimoire/shared-types'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const book = await apiFetch<ApiBook>(`/books/${slug}`)
    const ogImage = cloudinaryUrl(book.coverImage, 'w_800,c_fill,q_auto,f_auto')
    return {
      title: book.title,
      description: book.description ?? undefined,
      openGraph: {
        title: book.title,
        description: book.description ?? undefined,
        images: ogImage ? [ogImage] : [],
      },
    }
  } catch {
    return { title: 'Book not found' }
  }
}

export default async function BookPage({ params }: Props) {
  const { slug } = await params

  let book: ApiBook
  try {
    book = await apiFetch<ApiBook>(`/books/${slug}`)
  } catch {
    notFound()
  }

  const coverUrl = cloudinaryUrl(book.coverImage, 'w_600,c_fill,q_auto,f_auto')
  const editions = book.editions ?? []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    description: book.description,
    inLanguage: book.language,
    author: book.authors.map((a) => ({
      '@type': 'Person',
      name: a.name,
      url: `https://luxgrimoire.com/authors/${a.slug}`,
    })),
    ...(coverUrl ? { image: coverUrl } : {}),
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Book header */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-10">
        {/* Cover */}
        <div className="flex flex-col items-center md:items-start">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={book.title}
              className="rounded-xl shadow-2xl w-full max-w-xs md:max-w-full object-cover"
            />
          ) : (
            <div className="w-full max-w-xs md:max-w-full aspect-[2/3] rounded-xl bg-stone-800 flex items-center justify-center text-stone-600">
              No cover
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          {book.seriesName && (
            <Link
              href={`/books?series=${encodeURIComponent(book.seriesName)}`}
              className="inline-block text-sm text-amber-500 hover:text-amber-400 mb-2 font-medium transition-colors hover:underline"
            >
              {book.seriesName}
              {book.volumeNumber ? ` #${book.volumeNumber}` : ''}
              <span className="ml-1 text-xs text-stone-500">→ series</span>
            </Link>
          )}
          <h1 className="text-4xl font-serif font-bold text-stone-100 mb-3 leading-tight">
            {book.title}
          </h1>
          {book.altTitle && (
            <p className="text-stone-400 text-sm mb-3 italic">{book.altTitle}</p>
          )}

          {book.authors.length > 0 && (
            <p className="text-stone-300 mb-6">
              by{' '}
              {book.authors.map((author, i) => (
                <span key={author.id}>
                  {i > 0 && ', '}
                  <Link
                    href={`/authors/${author.slug}`}
                    className="text-amber-400 hover:underline"
                  >
                    {author.name}
                  </Link>
                </span>
              ))}
            </p>
          )}

          {book.description && (
            <div className="prose prose-invert prose-stone max-w-none">
              <p className="text-stone-300 leading-relaxed text-base">{book.description}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-6">
            {book.language && (
              <Badge variant="outline">{book.language.toUpperCase()}</Badge>
            )}
            {editions.length > 0 && (
              <Badge variant="default">{editions.length} edition{editions.length !== 1 ? 's' : ''}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Editions */}
      <section className="mt-16">
        <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">
          Editions
          {editions.length > 0 && (
            <span className="ml-2 text-base font-sans font-normal text-stone-500">({editions.length})</span>
          )}
        </h2>
        {editions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {editions.map((edition) => (
              <EditionCard
                key={edition.id}
                href={`/books/${book.slug}`}
                coverImage={edition.coverImage}
                companyName={(edition as any).bookBoxCompany?.name}
                seriesName={book.seriesName}
                volumeNumber={book.volumeNumber}
                title={book.title}
                authors={book.authors}
                unverified={!edition.verifiedAt}
                footer={
                  edition.artists?.length > 0 ? (
                    <p className="text-[11px] text-stone-500 flex flex-wrap gap-x-1 items-center mt-1">
                      {edition.artists.map((a: any, i: number) => (
                        <span key={a.artist.id} className="flex items-center gap-x-0.5">
                          {i > 0 && <span className="text-stone-600">,</span>}
                          <ArtistLink artist={a.artist} />
                          {a.role ? <span className="text-stone-600 text-[10px]"> ({a.role})</span> : null}
                        </span>
                      ))}
                    </p>
                  ) : null
                }
              />
            ))}
          </div>
        )}
        <AddEditionForm bookId={book.id} bookSlug={book.slug} />
      </section>
      <BookBundleInfo editionIds={editions.map(e => e.id)} />
      <ReviewsSection bookId={book.id} />
    </div>
  )
}
