'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { useAuth } from '@/components/AuthProvider'
import type { ApiBookEdition, PaginatedResponse, ApiBook, ApiAuthor } from '@luxgrimoire/shared-types'

interface RecentEdition extends ApiBookEdition {
  createdAt: string
  updatedAt: string
  book?: Pick<ApiBook, 'id' | 'slug' | 'title' | 'coverImage' | 'seriesName' | 'volumeNumber'> & {
    authors?: ApiAuthor[]
  }
  bookBoxCompany?: { id: string; name: string; slug: string } | null
  lastAudit: {
    entityId: string | null
    action: string
    username: string | null
    userId: string | null
    createdAt: string
  } | null
}

interface PendingBook {
  id: string
  slug: string
  title: string
  altTitle?: string | null
  coverImage?: string | null
  createdAt: string
  authors?: { author: { id: string; name: string; slug: string } }[]
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-stone-800 ${className}`} />
}

const TAB_CLASS = (active: boolean) =>
  `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
    active
      ? 'bg-stone-800 text-stone-100'
      : 'text-stone-400 hover:text-stone-200'
  }`

export default function AdminDashboard() {
  const router = useRouter()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'editions' | 'books'>('editions')

  useEffect(() => {
    if (user?.role === 'COMPANY_MANAGER') {
      router.replace('/admin/companies')
    }
  }, [user, router])

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['admin', 'pending-editions'],
    queryFn: () => authFetch<PaginatedResponse<RecentEdition>>('/editions?needsVerification=true&pageSize=50'),
  })

  const { data: booksData, isLoading: booksLoading } = useQuery({
    queryKey: ['admin', 'pending-books'],
    queryFn: () => authFetch<PaginatedResponse<PendingBook>>('/books?status=pending&pageSize=50'),
  })

  const pendingEditions = pendingData?.data ?? []
  const pendingEditionsCount = pendingData?.total ?? 0
  const pendingBooks = booksData?.data ?? []
  const pendingBooksCount = booksData?.total ?? 0

  async function verifyEdition(slug: string) {
    await authFetch(`/editions/${slug}/verify`, { method: 'POST' })
    void qc.invalidateQueries({ queryKey: ['admin', 'pending-editions'] })
  }

  async function approveBook(slug: string) {
    await authFetch(`/books/${slug}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) })
    void qc.invalidateQueries({ queryKey: ['admin', 'pending-books'] })
  }

  async function rejectBook(slug: string) {
    await authFetch(`/books/${slug}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) })
    void qc.invalidateQueries({ queryKey: ['admin', 'pending-books'] })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-100 mb-1">Dashboard</h1>
          <p className="text-stone-400 text-sm">Monitor content changes and recent activity</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-stone-800 pb-2">
        <button className={TAB_CLASS(tab === 'editions')} onClick={() => setTab('editions')}>
          Editions
          {pendingEditionsCount > 0 && (
            <span className="ml-1.5 bg-amber-700 text-amber-100 text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] inline-block text-center">
              {pendingEditionsCount}
            </span>
          )}
        </button>
        <button className={TAB_CLASS(tab === 'books')} onClick={() => setTab('books')}>
          Books
          {pendingBooksCount > 0 && (
            <span className="ml-1.5 bg-amber-700 text-amber-100 text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] inline-block text-center">
              {pendingBooksCount}
            </span>
          )}
        </button>
      </div>

      {/* Editions tab */}
      {tab === 'editions' && (
        <section>
          <p className="text-sm text-stone-400 mb-4">
            Editions submitted by users that have not yet been verified by an admin or moderator.
          </p>
          {pendingLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : pendingEditions.length === 0 ? (
            <div className="text-center py-16 text-stone-500">
              <p className="text-4xl mb-3">✓</p>
              <p className="font-serif">Nothing pending — all caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingEditions.map((edition) => (
                <div key={edition.id} className="rounded-xl border border-amber-800/40 bg-stone-900 p-4 flex items-start gap-4">
                  {edition.additionalImages?.[0] && cloudinaryUrl(edition.additionalImages[0], 'w_60,h_90,c_fill,q_auto') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cloudinaryUrl(edition.additionalImages[0], 'w_60,h_90,c_fill,q_auto')!}
                      alt=""
                      className="w-12 h-[72px] object-cover rounded border border-stone-700 flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-100 text-sm">
                      {edition.book?.title ?? '—'}
                      {edition.editionName && <span className="text-stone-400 ml-1">· {edition.editionName}</span>}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {edition.publisher ?? ''}
                    </p>
                    {edition.book?.authors && edition.book.authors.length > 0 && (
                      <p className="text-xs text-amber-600/80 mt-0.5">
                        by {edition.book.authors.map(a => a.name).join(', ')}
                      </p>
                    )}
                    <p className="text-[11px] text-stone-600 mt-1 font-mono">{edition.slug}</p>
                  </div>
                  <div className="flex gap-2 items-center flex-shrink-0">
                    <a
                      href={edition.book?.slug ? `/books/${edition.book.slug}` : '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-stone-400 hover:text-amber-400 border border-stone-700 px-2 py-1 rounded transition-colors"
                    >
                      View
                    </a>
                    <button
                      onClick={() => verifyEdition(edition.slug)}
                      className="text-xs bg-emerald-800 hover:bg-emerald-700 text-emerald-100 px-3 py-1 rounded transition-colors font-medium"
                    >
                      ✓ Verify
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Books tab */}
      {tab === 'books' && (
        <section>
          <p className="text-sm text-stone-400 mb-4">
            Books suggested by users that have not yet been approved.
          </p>
          {booksLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : pendingBooks.length === 0 ? (
            <div className="text-center py-16 text-stone-500">
              <p className="text-4xl mb-3">✓</p>
              <p className="font-serif">Nothing pending — all caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingBooks.map((book) => (
                <div key={book.id} className="rounded-xl border border-amber-800/40 bg-stone-900 p-4 flex items-start gap-4">
                  {book.coverImage && cloudinaryUrl(book.coverImage, 'w_60,h_90,c_fill,q_auto') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cloudinaryUrl(book.coverImage, 'w_60,h_90,c_fill,q_auto')!}
                      alt=""
                      className="w-12 h-[72px] object-cover rounded border border-stone-700 flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-100 text-sm">
                      {book.title}
                      {book.altTitle && <span className="text-stone-400 ml-1">· {book.altTitle}</span>}
                    </p>
                    {book.authors && book.authors.length > 0 && (
                      <p className="text-xs text-amber-600/80 mt-0.5">
                        by {book.authors.map(a => a.author.name).join(', ')}
                      </p>
                    )}
                    <p className="text-[11px] text-stone-600 mt-1 font-mono">{book.slug}</p>
                  </div>
                  <div className="flex gap-2 items-center flex-shrink-0">
                    <a
                      href={`/books/${book.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-stone-400 hover:text-amber-400 border border-stone-700 px-2 py-1 rounded transition-colors"
                    >
                      View
                    </a>
                    <button
                      onClick={() => rejectBook(book.slug)}
                      className="text-xs bg-red-900 hover:bg-red-800 text-red-100 px-3 py-1 rounded transition-colors font-medium"
                    >
                      ✕ Reject
                    </button>
                    <button
                      onClick={() => approveBook(book.slug)}
                      className="text-xs bg-emerald-800 hover:bg-emerald-700 text-emerald-100 px-3 py-1 rounded transition-colors font-medium"
                    >
                      ✓ Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
