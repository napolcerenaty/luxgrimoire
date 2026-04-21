'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/authFetch'
import { apiFetch } from '@/lib/api'

interface ReviewUser {
  id: string
  username: string
  avatarUrl: string | null
}

interface Review {
  id: string
  user: ReviewUser
  rating: number
  title: string | null
  body: string
  containsSpoilers: boolean
  helpfulCount: number
  createdAt: string
}

interface ReviewsResponse {
  data: Review[]
  total: number
  page: number
  pageSize: number
}

interface RatingSummary {
  average: number
  count: number
  distribution: Record<string, number>
}

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <svg
          key={i}
          className={`w-4 h-4 ${i < rating ? 'text-amber-400' : 'text-stone-700'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  )
}

function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <span className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="focus:outline-none"
        >
          <svg
            className={`w-7 h-7 transition-colors ${(hovered || value) >= star ? 'text-amber-400' : 'text-stone-600'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </span>
  )
}

function RatingSummaryCard({ bookId }: { bookId: string }) {
  const { data } = useQuery<RatingSummary>({
    queryKey: ['rating-summary', bookId],
    queryFn: () => apiFetch(`/books/${bookId}/reviews/summary`),
  })

  if (!data || data.count === 0) return null

  return (
    <div className="rounded-2xl bg-stone-900 border border-stone-800 p-6 mb-8">
      <div className="flex items-center gap-6 mb-4">
        <div className="text-center">
          <p className="text-5xl font-serif font-bold text-amber-400">{data.average.toFixed(1)}</p>
          <StarRating rating={Math.round(data.average)} />
          <p className="text-stone-500 text-sm mt-1">{data.count} review{data.count !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex-1 space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = data.distribution[star] ?? 0
            const pct = data.count > 0 ? Math.round((count / data.count) * 100) : 0
            return (
              <div key={star} className="flex items-center gap-2 text-xs text-stone-400">
                <span className="w-3">{star}</span>
                <div className="flex-1 h-2 bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-6 text-right">{count}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ReviewForm({
  bookId,
  onSuccess,
  onCancel,
  initial,
  reviewId,
}: {
  bookId: string
  onSuccess: () => void
  onCancel: () => void
  initial?: Partial<Review>
  reviewId?: string
}) {
  const qc = useQueryClient()
  const [rating, setRating] = useState(initial?.rating ?? 0)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [spoiler, setSpoiler] = useState(initial?.containsSpoilers ?? false)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      if (reviewId) {
        return authFetch(`/reviews/${reviewId}`, {
          method: 'PATCH',
          body: JSON.stringify({ rating, title: title || undefined, body, containsSpoilers: spoiler }),
        })
      }
      return authFetch(`/books/${bookId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ bookId, rating, title: title || undefined, body, containsSpoilers: spoiler }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', bookId] })
      qc.invalidateQueries({ queryKey: ['rating-summary', bookId] })
      onSuccess()
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="rounded-2xl bg-stone-900 border border-stone-800 p-6 mb-6">
      <h3 className="font-serif text-lg text-stone-100 mb-4">
        {reviewId ? 'Edit Review' : 'Write a Review'}
      </h3>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      <div className="mb-4">
        <label className="text-sm text-stone-400 mb-1 block">Your Rating *</label>
        <StarSelector value={rating} onChange={setRating} />
      </div>
      <input
        className="w-full bg-stone-800 border border-stone-700 rounded-xl px-4 py-2.5 text-stone-100 text-sm mb-3 placeholder-stone-500 focus:outline-none focus:border-amber-500/50"
        placeholder="Review title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full bg-stone-800 border border-stone-700 rounded-xl px-4 py-2.5 text-stone-100 text-sm mb-3 placeholder-stone-500 focus:outline-none focus:border-amber-500/50 resize-none"
        placeholder="Share your thoughts…"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <label className="flex items-center gap-2 text-sm text-stone-400 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={spoiler}
          onChange={(e) => setSpoiler(e.target.checked)}
          className="accent-amber-400"
        />
        Contains spoilers
      </label>
      <div className="flex gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || rating === 0 || !body.trim()}
          className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold text-sm transition-colors"
        >
          {mutation.isPending ? 'Saving…' : 'Submit'}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2 rounded-xl border border-stone-700 text-stone-400 hover:text-stone-200 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function ReviewCard({
  review,
  currentUserId,
  bookId,
}: {
  review: Review
  currentUserId?: string
  bookId: string
}) {
  const qc = useQueryClient()
  const [showBody, setShowBody] = useState(!review.containsSpoilers)
  const [editing, setEditing] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => authFetch(`/reviews/${review.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', bookId] })
      qc.invalidateQueries({ queryKey: ['rating-summary', bookId] })
    },
  })

  const helpfulMutation = useMutation({
    mutationFn: () => authFetch(`/reviews/${review.id}/helpful`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews', bookId] }),
  })

  if (editing) {
    return (
      <ReviewForm
        bookId={bookId}
        reviewId={review.id}
        initial={review}
        onSuccess={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="rounded-2xl bg-stone-900 border border-stone-800 p-6">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-stone-700 overflow-hidden shrink-0 flex items-center justify-center text-stone-400 text-xs font-bold">
          {review.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={review.user.avatarUrl} alt={review.user.username} className="w-full h-full object-cover" />
          ) : (
            review.user.username[0]?.toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-200">{review.user.username}</p>
          <p className="text-xs text-stone-500">{new Date(review.createdAt).toLocaleDateString()}</p>
        </div>
        <StarRating rating={review.rating} />
      </div>

      {review.title && (
        <h4 className="font-serif text-stone-100 font-semibold mb-2">{review.title}</h4>
      )}

      {review.containsSpoilers && !showBody ? (
        <div className="relative mb-3">
          <p className="blur-sm select-none text-stone-400 text-sm line-clamp-3">{review.body}</p>
          <button
            onClick={() => setShowBody(true)}
            className="absolute inset-0 flex items-center justify-center text-amber-400 text-xs font-medium"
          >
            ⚠ Spoiler — click to reveal
          </button>
        </div>
      ) : (
        <p className="text-stone-300 text-sm leading-relaxed mb-3">{review.body}</p>
      )}

      <div className="flex items-center gap-4 mt-2">
        {currentUserId && (
          <button
            onClick={() => helpfulMutation.mutate()}
            disabled={helpfulMutation.isPending}
            className="text-xs text-stone-500 hover:text-amber-400 transition-colors"
          >
            👍 Helpful ({review.helpfulCount})
          </button>
        )}
        {currentUserId === review.user.id && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-stone-500 hover:text-amber-400 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="text-xs text-stone-500 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function ReviewsSection({ bookId }: { bookId: string }) {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading } = useQuery<ReviewsResponse>({
    queryKey: ['reviews', bookId, page],
    queryFn: () => apiFetch(`/books/${bookId}/reviews?page=${page}&pageSize=10`),
  })

  const userReview = data?.data.find((r) => r.user.id === user?.id)
  const hasReviewed = !!userReview

  return (
    <section className="mt-16">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-serif font-semibold text-stone-100">Reviews</h2>
        {user && !hasReviewed && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors"
          >
            Write a Review
          </button>
        )}
      </div>

      <RatingSummaryCard bookId={bookId} />

      {showForm && user && (
        <ReviewForm
          bookId={bookId}
          onSuccess={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <p className="text-stone-500 text-sm animate-pulse">Loading reviews…</p>
      ) : data?.data.length === 0 ? (
        <p className="text-stone-500 text-sm italic">No reviews yet. Be the first!</p>
      ) : (
        <div className="space-y-4">
          {data?.data.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              currentUserId={user?.id}
              bookId={bookId}
            />
          ))}
        </div>
      )}

      {data && data.total > data.pageSize && (
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
            disabled={page * data.pageSize >= data.total}
            className="px-4 py-2 rounded-xl border border-stone-700 text-stone-400 disabled:opacity-40 hover:text-stone-100 text-sm"
          >
            Next
          </button>
        </div>
      )}
    </section>
  )
}
