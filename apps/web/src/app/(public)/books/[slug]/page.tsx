import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
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
            <p className="text-sm text-amber-500 mb-2 font-medium">
              {book.seriesName}
              {book.volumeNumber ? ` · Vol. ${book.volumeNumber}` : ''}
            </p>
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
      {editions.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">Editions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {editions.map((edition) => {
              const editionCover = cloudinaryUrl(edition.coverImage, 'w_400,c_fill,q_auto,f_auto')
              return (
                <div
                  key={edition.id}
                  className="rounded-xl bg-stone-900 border border-stone-800 overflow-hidden"
                >
                  {editionCover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editionCover}
                      alt={`${book.title} – ${edition.publisher ?? 'Edition'}`}
                      className="w-full aspect-[3/2] object-cover"
                    />
                  )}
                  <div className="p-4">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {edition.isSpecial && <Badge variant="warning">Special</Badge>}
                      {edition.format && <Badge variant="outline">{edition.format}</Badge>}
                    </div>
                    {edition.publisher && (
                      <p className="font-semibold text-stone-100 text-sm">{edition.publisher}</p>
                    )}
                    {edition.publishYear && (
                      <p className="text-xs text-stone-400 mt-0.5">{edition.publishYear}</p>
                    )}
                    {edition.artists.length > 0 && (
                      <p className="text-xs text-stone-500 mt-2">
                        Art by{' '}
                        {edition.artists.map((a, i) => (
                          <span key={a.artist.id}>
                            {i > 0 && ', '}
                            <Link
                              href={`/artists/${a.artist.slug}`}
                              className="text-amber-500 hover:underline"
                            >
                              {a.artist.name}
                            </Link>
                            {a.role ? ` (${a.role})` : ''}
                          </span>
                        ))}
                      </p>
                    )}
                    {edition.notes && (
                      <p className="text-xs text-stone-500 mt-2 italic">{edition.notes}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
