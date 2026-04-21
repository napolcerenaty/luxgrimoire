'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { authFetch } from '@/lib/authFetch'

interface FeedUser {
  id: string
  username: string
  avatarUrl: string | null
}

interface FeedBook {
  id: string
  slug: string
  title: string
  coverImage: string | null
}

interface ReviewFeedItem {
  type: 'review'
  user: FeedUser
  book: FeedBook
  rating: number
  title: string | null
  body: string
  createdAt: string
}

interface CollectionFeedItem {
  type: 'collection'
  user: FeedUser
  book: FeedBook
  createdAt: string
}

type FeedItem = ReviewFeedItem | CollectionFeedItem

interface FeedResponse {
  data: FeedItem[]
  page: number
  pageSize: number
}

function StarIcons({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`w-3.5 h-3.5 ${i <= rating ? 'text-amber-400' : 'text-stone-700'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  )
}

function UserAvatar({ user }: { user: FeedUser }) {
  return (
    <div className="w-9 h-9 rounded-full bg-stone-700 overflow-hidden shrink-0 flex items-center justify-center text-stone-400 text-xs font-bold">
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
      ) : (
        user.username[0]?.toUpperCase()
      )}
    </div>
  )
}

function FeedCard({ item }: { item: FeedItem }) {
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="rounded-2xl bg-stone-900 border border-stone-800 p-5">
      <div className="flex items-start gap-3">
        <UserAvatar user={item.user} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-stone-300">
            <Link href={`/users/${item.user.username}`} className="font-medium text-stone-100 hover:text-amber-400">
              {item.user.username}
            </Link>
            {' '}
            {item.type === 'review' ? (
              <>
                reviewed{' '}
                <Link href={`/books/${item.book.slug}`} className="text-amber-400 hover:underline">
                  {item.book.title}
                </Link>
              </>
            ) : (
              <>
                added{' '}
                <Link href={`/books/${item.book.slug}`} className="text-amber-400 hover:underline">
                  {item.book.title}
                </Link>
                {' '}to their collection
              </>
            )}
          </p>
          <p className="text-xs text-stone-500 mt-0.5">{timeAgo(item.createdAt)}</p>

          {item.type === 'review' && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <StarIcons rating={item.rating} />
                {item.title && (
                  <span className="text-sm font-medium text-stone-200">{item.title}</span>
                )}
              </div>
              <p className="text-stone-400 text-sm line-clamp-3">{item.body}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FeedPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery<FeedResponse>({
    queryKey: ['feed', page],
    queryFn: () => authFetch<FeedResponse>(`/social/feed?page=${page}&pageSize=20`),
  })

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-serif font-bold text-stone-100 mb-8">Activity Feed</h1>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-stone-900 border border-stone-800 h-28 animate-pulse" />
          ))}
        </div>
      ) : !data || data.data.length === 0 ? (
        <div className="rounded-2xl bg-stone-900 border border-stone-800 p-12 text-center">
          <p className="text-stone-400 text-lg mb-2">No activity yet</p>
          <p className="text-stone-500 text-sm mb-6">Follow other collectors to see their activity here.</p>
          <Link
            href="/search"
            className="inline-block px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm transition-colors"
          >
            Find people to follow
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {data.data.map((item, i) => (
              <FeedCard key={i} item={item} />
            ))}
          </div>
          <div className="flex gap-2 mt-6 justify-center">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl border border-stone-700 text-stone-400 disabled:opacity-40 hover:text-stone-100 text-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(data.data.length ?? 0) < data.pageSize}
              className="px-4 py-2 rounded-xl border border-stone-700 text-stone-400 disabled:opacity-40 hover:text-stone-100 text-sm"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
