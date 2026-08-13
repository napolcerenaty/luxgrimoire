import Link from 'next/link'
import { formatVolumeNumbers } from '@/lib/volumeNumbers'

interface BookCardProps {
  book: {
    slug: string
    title: string
    seriesName?: string | null
    volumeNumbers?: number[] | null
    authors?: Array<{ name: string; slug: string }>
  }
}

export function BookCard({ book }: BookCardProps) {
  const cover = null

  return (
    <Link
      href={`/books/${book.slug}`}
      className="group flex flex-col gap-3 hover:opacity-90 transition-opacity"
    >
      <div className="aspect-[2/3] overflow-hidden rounded-lg bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 shadow-md">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={book.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-stone-700 px-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}
      </div>
      <div>
        {(book.seriesName || book.volumeNumbers?.length) && (
          <p className="text-xs text-brand-600 mb-0.5 truncate">
            {book.seriesName}
            {book.volumeNumbers?.length ? ` #${formatVolumeNumbers(book.volumeNumbers)}` : ''}
          </p>
        )}
        <h3 className="text-sm font-semibold font-serif text-stone-100 leading-snug line-clamp-2">
          {book.title}
        </h3>
        {book.authors && book.authors.length > 0 && (
          <p className="text-xs text-stone-400 mt-1 truncate">
            {book.authors.map((a) => a.name).join(', ')}
          </p>
        )}
      </div>
    </Link>
  )
}
