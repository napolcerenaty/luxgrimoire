'use client'

import { use, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiSubscriptionMonth } from '@luxgrimoire/shared-types'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

const INPUT_CLASS =
  'bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-xs text-stone-400 mb-1'

interface AddMonthFormProps {
  slug: string
  onSuccess: () => void
}

function AddMonthForm({ slug, onSuccess }: AddMonthFormProps) {
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [theme, setTheme] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await authFetch(`/subscriptions/${slug}/months`, {
        method: 'POST',
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          theme: theme || undefined,
          coverImage: coverImage || undefined,
        }),
      })
      setYear('')
      setMonth('')
      setTheme('')
      setCoverImage('')
      onSuccess()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-stone-900 border border-stone-800 rounded-2xl p-4 mb-6">
      <h3 className="text-sm font-semibold text-stone-300 mb-3">Add Month</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className={LABEL_CLASS}>Year *</label>
          <input
            required
            type="number"
            className={`${INPUT_CLASS} w-full`}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2024"
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Month (1–12) *</label>
          <input
            required
            type="number"
            min={1}
            max={12}
            className={`${INPUT_CLASS} w-full`}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="1"
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Theme</label>
          <input
            className={`${INPUT_CLASS} w-full`}
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Cover Image</label>
          <input
            className={`${INPUT_CLASS} w-full`}
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors text-sm"
      >
        {submitting ? 'Adding…' : 'Add Month'}
      </button>
    </form>
  )
}

interface MonthCardProps {
  month: ApiSubscriptionMonth
  slug: string
  onDeleted: () => void
}

function MonthCard({ month, slug, onDeleted }: MonthCardProps) {
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [bookEditionId, setBookEditionId] = useState('')
  const [isMainBook, setIsMainBook] = useState(false)
  const [addingBook, setAddingBook] = useState(false)
  const [removeBookId, setRemoveBookId] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: () =>
      authFetch(`/subscriptions/${slug}/months/${month.year}/${month.month}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions', slug, 'months'] })
      onDeleted()
    },
  })

  const addBookMutation = useMutation({
    mutationFn: (payload: { bookEditionId: string; isMainBook: boolean }) =>
      authFetch(`/subscriptions/${slug}/months/${month.year}/${month.month}/books`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions', slug, 'months'] })
      setBookEditionId('')
      setIsMainBook(false)
    },
  })

  const removeBookMutation = useMutation({
    mutationFn: (bookEditionId: string) =>
      authFetch(
        `/subscriptions/${slug}/months/${month.year}/${month.month}/books/${bookEditionId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions', slug, 'months'] })
      setRemoveBookId(null)
    },
  })

  const monthName = new Date(month.year, month.month - 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-stone-100">{monthName}</h3>
          {month.theme && <p className="text-stone-400 text-sm mt-0.5">Theme: {month.theme}</p>}
        </div>
        <button
          onClick={() => setConfirmDelete(true)}
          className="bg-red-900/50 text-red-300 px-3 py-1 rounded text-sm hover:bg-red-900 transition-colors"
        >
          Delete Month
        </button>
      </div>

      {/* Books list */}
      {month.books.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Books</p>
          {month.books.map((mb) => (
            <div
              key={`${mb.bookId}-${mb.editionId ?? 'no-edition'}`}
              className="flex items-center justify-between bg-stone-800/50 rounded-lg px-3 py-2"
            >
              <div>
                <span className="text-stone-200 text-sm">{mb.book.title}</span>
                {mb.edition && (
                  <span className="text-stone-500 text-xs ml-2">
                    {mb.edition.publisher} {mb.edition.publishYear}
                  </span>
                )}
                {mb.isMainBook && (
                  <span className="ml-2 text-amber-400 text-xs font-medium">Main</span>
                )}
              </div>
              <button
                onClick={() => setRemoveBookId(`${mb.bookId}-${mb.editionId ?? 'no-edition'}`)}
                className="text-red-400 text-xs hover:text-red-300 transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add book form */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          addBookMutation.mutate({ bookEditionId, isMainBook })
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div>
          <label className={LABEL_CLASS}>Book Edition ID</label>
          <input
            required
            className={`${INPUT_CLASS} w-48`}
            value={bookEditionId}
            onChange={(e) => setBookEditionId(e.target.value)}
            placeholder="edition-uuid"
          />
        </div>
        <label className="flex items-center gap-1.5 text-stone-400 text-xs pb-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={isMainBook}
            onChange={(e) => setIsMainBook(e.target.checked)}
            className="accent-amber-400"
          />
          Main book
        </label>
        <button
          type="submit"
          disabled={addingBook || addBookMutation.isPending}
          onClick={() => setAddingBook(true)}
          className="bg-stone-700 text-stone-200 px-3 py-2 rounded-lg hover:bg-stone-600 text-xs transition-colors disabled:opacity-50"
        >
          {addBookMutation.isPending ? 'Adding…' : 'Add Book'}
        </button>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        message={`Delete ${monthName}? All books in this month will also be removed.`}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      {month.books.map((mb) => {
        const bookEdId = `${mb.bookId}-${mb.editionId ?? 'no-edition'}`
        return (
          <ConfirmDialog
            key={bookEdId}
            open={removeBookId === bookEdId}
            message={`Remove "${mb.book.title}" from this month?`}
            onConfirm={() =>
              removeBookMutation.mutate(mb.editionId ?? mb.bookId)
            }
            onCancel={() => setRemoveBookId(null)}
          />
        )
      })}
    </div>
  )
}

export default function SubscriptionMonthsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const queryClient = useQueryClient()

  const { data: months, isLoading } = useQuery({
    queryKey: ['admin', 'subscriptions', slug, 'months'],
    queryFn: () => authFetch<ApiSubscriptionMonth[]>(`/subscriptions/${slug}/months`),
  })

  return (
    <div>
      <div className="mb-6">
        <p className="text-stone-500 text-sm mb-1">Subscription</p>
        <h1 className="text-2xl font-bold text-stone-100">{slug}</h1>
      </div>

      <AddMonthForm
        slug={slug}
        onSuccess={() =>
          queryClient.invalidateQueries({
            queryKey: ['admin', 'subscriptions', slug, 'months'],
          })
        }
      />

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading months…</div>
      ) : months && months.length > 0 ? (
        <div className="space-y-4">
          {months.map((m) => (
            <MonthCard
              key={m.id}
              month={m}
              slug={slug}
              onDeleted={() =>
                queryClient.invalidateQueries({
                  queryKey: ['admin', 'subscriptions', slug, 'months'],
                })
              }
            />
          ))}
        </div>
      ) : (
        <div className="text-stone-500 text-center py-8">No months found for this subscription.</div>
      )}
    </div>
  )
}
