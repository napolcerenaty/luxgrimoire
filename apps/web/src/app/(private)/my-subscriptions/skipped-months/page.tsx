'use client'

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import Link from 'next/link'
import { BookOpen, ArrowLeft } from 'lucide-react'

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface SkippedMonthBook {
  title: string
  authors: string
  coverImage: string | null
}

interface SkippedMonth {
  year: number
  month: number
  theme: string | null
  skippedAt: string
  monthCoverImage: string | null
  subscription: {
    name: string
    slug: string
    coverImage: string | null
  }
  books: SkippedMonthBook[]
}

function SkippedBookCard({ item }: { item: SkippedMonth }) {
  const book = item.books[0]
  const photo = book?.coverImage
    ? cloudinaryUrl(book.coverImage, 'w_300,h_450,c_fill,q_auto,f_auto')
    : item.monthCoverImage
    ? cloudinaryUrl(item.monthCoverImage, 'w_300,h_450,c_fill,q_auto,f_auto')
    : item.subscription.coverImage
    ? cloudinaryUrl(item.subscription.coverImage, 'w_300,h_450,c_fill,q_auto,f_auto')
    : null

  return (
    <div className="flex flex-col rounded-2xl bg-stone-900 border border-stone-800 overflow-hidden">
      {/* Cover */}
      <div className="relative aspect-[2/3] bg-stone-950">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={book?.title ?? item.theme ?? ''} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen size={32} className="text-stone-700" />
          </div>
        )}
        {/* Month badge */}
        <span className="absolute top-2 left-2 text-[11px] font-medium bg-stone-950/80 text-stone-300 px-2 py-0.5 rounded-full backdrop-blur-sm">
          {MONTH_NAMES[item.month]} {item.year}
        </span>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1 flex-1 flex flex-col justify-between">
        <div>
          {book ? (
            <>
              <p className="text-sm font-medium text-stone-100 line-clamp-2 leading-snug">{book.title}</p>
              <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">{book.authors || 'Unknown author'}</p>
            </>
          ) : (
            <p className="text-sm text-stone-400 italic">{item.theme ?? 'No book added yet'}</p>
          )}
        </div>
        <Link
          href={`/subscriptions/${item.subscription.slug}`}
          className="text-[11px] text-stone-600 hover:text-amber-400 transition-colors mt-1.5 truncate"
        >
          {item.subscription.name}
        </Link>
      </div>
    </div>
  )
}

export default function SkippedMonthsPage() {
  const { data, isLoading, error } = useQuery<SkippedMonth[]>({
    queryKey: ['my-skipped-months'],
    queryFn: () => authFetch<SkippedMonth[]>('/skip-policy/my-skipped'),
  })

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/my-subscriptions" className="text-stone-500 hover:text-stone-300 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Skipped Months</h1>
          {data && data.length > 0 && (
            <p className="text-sm text-stone-500 mt-0.5">{data.length} skipped box{data.length !== 1 ? 'es' : ''}</p>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-2xl bg-stone-800 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm">Could not load skipped months.</p>
      )}

      {data && data.length === 0 && (
        <div className="text-center py-20 text-stone-500">
          <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No skipped months yet.</p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {data.map((item) => (
            <SkippedBookCard key={`${item.subscription.slug}-${item.year}-${item.month}`} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
