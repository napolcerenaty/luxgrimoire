import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'

interface BookCardProps {
  book: {
    slug: string
    title: string
    seriesName?: string | null
    volumeNumber?: number | null
    coverImage?: string | null
    authors?: Array<{ name: string; slug: string }>
  }
}

export function BookCard({ book }: BookCardProps) {
  const cover = cloudinaryUrl(book.coverImage, 'w_300,c_fill,q_auto,f_auto')

  return (
    <Link
      href={`/books/${book.slug}`}
      className="group flex flex-col gap-3 hover:opacity-90 transition-opacity"
    >
      <div className="aspect-[2/3] overflow-hidden rounded-lg bg-stone-800 shadow-md">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={book.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-600 text-sm">
            No cover
          </div>
        )}
      </div>
      <div>
        {(book.seriesName || book.volumeNumber) && (
          <p className="text-xs text-amber-600 mb-0.5 truncate">
            {book.seriesName}
            {book.volumeNumber ? ` #${book.volumeNumber}` : ''}
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
