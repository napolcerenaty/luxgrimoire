import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import type { ApiBook } from '@luxgrimoire/shared-types'
import { BackButton } from '@/components/ui/BackButton'

interface Props {
  params: Promise<{ name: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params
  const seriesName = decodeURIComponent(name)
  return {
    title: `${seriesName} — Series`,
    description: `All books in the ${seriesName} series`,
  }
}

export default async function SeriesPage({ params }: Props) {
  const { name } = await params
  const seriesName = decodeURIComponent(name)

  let books: ApiBook[] = []
  try {
    const res = await apiFetch<{ data: ApiBook[] }>(
      `/books?seriesName=${encodeURIComponent(seriesName)}&pageSize=100`
    )
    books = res.data ?? []
  } catch {
    notFound()
  }

  if (books.length === 0) notFound()

  // Sort by volume number ascending, nulls last
  const sorted = [...books].sort((a, b) => {
    if (a.volumeNumber == null && b.volumeNumber == null) return 0
    if (a.volumeNumber == null) return 1
    if (b.volumeNumber == null) return -1
    return a.volumeNumber - b.volumeNumber
  })

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <BackButton />

      <div className="mb-8">
        <p className="text-sm text-stone-500 mb-1 uppercase tracking-widest font-medium">Series</p>
        <h1 className="text-3xl font-serif font-bold text-stone-100">{seriesName}</h1>
        <p className="text-stone-400 mt-2 text-sm">{sorted.length} book{sorted.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="space-y-3">
        {sorted.map(book => (
          <Link
            key={book.id}
            href={`/books/${book.slug}`}
            className="flex items-start gap-4 p-4 bg-stone-900 border border-stone-800 rounded-xl hover:border-stone-600 transition-colors group"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-400 text-sm font-medium">
              {book.volumeNumber != null ? `#${book.volumeNumber}` : '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-stone-100 font-medium group-hover:text-amber-400 transition-colors">
                {book.title}
              </p>
              {book.authors.length > 0 && (
                <p className="text-stone-500 text-sm mt-0.5">
                  {book.authors.map(a => a.name).join(', ')}
                </p>
              )}
              {book.editions && book.editions.length > 0 && (
                <p className="text-stone-600 text-xs mt-1">
                  {book.editions.length} edition{book.editions.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <span className="text-stone-600 group-hover:text-stone-400 transition-colors text-sm mt-1">→</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
