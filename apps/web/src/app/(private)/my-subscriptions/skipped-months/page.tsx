'use client'

import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
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
    <div className="flex flex-col rounded-2xl bg-navy-900 border border-navy-800 overflow-hidden">
      <div className="relative aspect-[2/3] bg-navy-950">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={book?.title ?? item.theme ?? ''} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen size={32} className="text-navy-700" />
          </div>
        )}
        <span className="absolute top-2 left-2 text-[11px] font-medium bg-navy-950/80 text-navy-300 px-2 py-0.5 rounded-full backdrop-blur-sm">
          {MONTH_NAMES[item.month]} {item.year}
        </span>
      </div>

      <div className="p-3 space-y-1 flex-1 flex flex-col justify-between">
        <div>
          {book ? (
            <>
              <p className="text-sm font-medium text-navy-100 line-clamp-2 leading-snug">{book.title}</p>
              <p className="text-xs text-navy-500 mt-0.5 line-clamp-1">{book.authors || 'Unknown author'}</p>
            </>
          ) : (
            <p className="text-sm text-navy-400 italic">{item.theme ?? 'No book added yet'}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SkippedMonthsPage() {
  const searchParams = useSearchParams()
  const subSlug = searchParams.get('sub')

  const { data, isLoading, error } = useQuery<SkippedMonth[]>({
    queryKey: ['my-skipped-months'],
    queryFn: () => authFetch<SkippedMonth[]>('/skip-policy/my-skipped'),
  })

  const filtered = subSlug && data ? data.filter(m => m.subscription.slug === subSlug) : data ?? []
  const subName = subSlug && filtered.length > 0 ? filtered[0].subscription.name : null

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/my-subscriptions" className="text-navy-500 hover:text-navy-300 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          {subName ? (
            <>
              <p className="text-xs text-navy-500 mb-0.5">
                <Link href={`/subscriptions/${subSlug}`} className="hover:text-brand-400 transition-colors">{subName}</Link>
              </p>
              <h1 className="text-2xl font-bold text-navy-100">Skipped Months</h1>
            </>
          ) : (
            <h1 className="text-2xl font-bold text-navy-100">All Skipped Months</h1>
          )}
          {filtered.length > 0 && (
            <p className="text-sm text-navy-500 mt-0.5">{filtered.length} skipped box{filtered.length !== 1 ? 'es' : ''}</p>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-2xl bg-navy-800 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm">Could not load skipped months.</p>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="text-center py-20 text-navy-500">
          <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No skipped months yet.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((item) => (
            <SkippedBookCard key={`${item.subscription.slug}-${item.year}-${item.month}`} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
