import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { BookDescription } from '@/components/books/BookDescription'
import { BookEditionsSection, BookEditionsSkeleton } from '@/components/books/BookEditionsSection'
import { EditionCard } from '@/components/books/EditionCard'
import { formatVolumeNumbers } from '@/lib/volumeNumbers'
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
        {book.series ? (
          <Link
            href={`/series/${book.series.slug}`}
            className="inline-block text-sm text-amber-500 hover:text-amber-400 mb-2 font-medium transition-colors hover:underline"
          >
            {book.series.name}
            {book.volumeNumbers.length > 0 ? ` #${formatVolumeNumbers(book.volumeNumbers)}` : ''}
            <span className="ml-1 text-xs text-stone-500">→ series</span>
          </Link>
        ) : book.seriesName ? (
          // Legacy plain-text series name with no linked BookSeries record — no series page
          // exists to link to (see /series/[slug] 404s from books like this).
          <p className="inline-block text-sm text-amber-500 mb-2 font-medium">
            {book.seriesName}
            {book.volumeNumbers.length > 0 ? ` #${formatVolumeNumbers(book.volumeNumbers)}` : ''}
          </p>
        ) : null}
        {book.seriesEntries && book.seriesEntries.filter(e => !e.isPrimary).length > 0 && (
          <p className="text-xs text-stone-500 mb-2">
            Also in{' '}
            {book.seriesEntries.filter(e => !e.isPrimary).map((entry, i, arr) => (
              <span key={entry.seriesId}>
                <Link href={`/series/${entry.series.slug}`} className="text-stone-400 hover:text-amber-400 transition-colors hover:underline">
                  {entry.series.name}{entry.volumeNumbers.length > 0 ? ` #${formatVolumeNumbers(entry.volumeNumbers)}` : ''}
                </Link>
                {i < arr.length - 1 && ', '}
              </span>
            ))}
          </p>
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

      {/* This book is itself an omnibus — what it contains */}
      {book.isOmnibus && book.omnibusComponents && book.omnibusComponents.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">Contains</h2>
          <ul className="flex flex-col gap-2">
            {book.omnibusComponents.map((c) => (
              <li key={c.id}>
                <Link href={`/books/${c.book.slug}`} className="text-stone-300 hover:text-amber-400 transition-colors">
                  {c.volumeNumber != null && <span className="text-amber-600/80 font-semibold mr-2">Vol. {c.volumeNumber}</span>}
                  {c.book.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Omnibus appearances */}
      {book.appearsInOmnibus && book.appearsInOmnibus.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">Part of Omnibus</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {book.appearsInOmnibus.map(({ id, volumeNumber, omnibusBookSlug, omnibusBookTitle, coverImage, companyName, companySlug, companyBrandColors }) => (
              <EditionCard
                key={id}
                href={`/books/${omnibusBookSlug}`}
                coverImage={coverImage}
                title={omnibusBookTitle}
                companyName={companyName}
                companySlug={companySlug}
                companyBrandColors={companyBrandColors}
                footer={volumeNumber != null ? (
                  <span className="text-[10px] text-stone-500">Vol. {volumeNumber}</span>
                ) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {/* Editions */}
      <Suspense fallback={<BookEditionsSkeleton />}>
        <BookEditionsSection bookSlug={slug} />
      </Suspense>

    </div>
  )
}
