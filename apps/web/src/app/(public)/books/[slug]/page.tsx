import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { BookDescription } from '@/components/books/BookDescription'
import { BookEditionsSection } from '@/components/books/BookEditionsSection'
import { BookBundleInfo } from '@/components/books/BookBundleInfo'
import type { ApiBook } from '@luxgrimoire/shared-types'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const book = await apiFetch<ApiBook>(`/books/${slug}`)
    return {
      title: book.title,
      description: book.description ?? undefined,
      openGraph: {
        title: book.title,
        description: book.description ?? undefined,
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

  const editions = book.editions ?? []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    description: book.description,
    author: book.authors.map((a) => ({
      '@type': 'Person',
      name: a.name,
      url: `https://luxgrimoire.com/authors/${a.slug}`,
    })),
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Book header — single column, no cover image */}
      <div className="mb-10">
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
          <BookDescription description={book.description} />
        )}

        {book.genres.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-5">
            {book.genres.map(g => (
              <span key={g} className="text-xs bg-stone-800 border border-stone-700 px-2.5 py-1 rounded-full text-stone-400">{g}</span>
            ))}
          </div>
        )}
      </div>

      {/* Editions */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-serif font-semibold text-stone-100">
            Editions
            {editions.length > 0 && (
              <span className="ml-2 text-base font-sans font-normal text-stone-500">({editions.length})</span>
            )}
          </h2>
        </div>
        <BookEditionsSection editions={editions} />
      </section>

      <BookBundleInfo editionIds={editions.map(e => e.id)} />
    </div>
  )
}
