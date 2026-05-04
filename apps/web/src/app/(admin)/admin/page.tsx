'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { useAuth } from '@/components/AuthProvider'
import dynamic from 'next/dynamic'
import type { ApiBookEdition, PaginatedResponse, ApiBook, ApiAuthor } from '@luxgrimoire/shared-types'
import FormModal from '@/components/admin/FormModal'
import { PersonPicker, type PersonEntry } from '@/components/admin/pickers/PersonPicker'
import { SeriesPicker } from '@/components/admin/pickers/SeriesPicker'
import { GenreTagsPicker } from '@/components/admin/pickers/GenreTagsPicker'

const EditBookEditionForm = dynamic(() => import('@/components/admin/EditBookEditionForm'), { ssr: false })

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-sm text-stone-400 mb-1'

interface RecentEdition extends ApiBookEdition {
  createdAt: string
  updatedAt: string
  book?: Pick<ApiBook, 'id' | 'slug' | 'title' | 'seriesName' | 'volumeNumber'> & {
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
  _count?: { userEntries: number }
}

interface PendingBook {
  id: string
  slug: string
  title: string
  createdAt: string
  authors?: { author: { id: string; name: string; slug: string } }[]
}

// ─── EditEditionLoader ─────────────────────────────────────────────────────────
function EditEditionLoader({ slug, onSuccess, onCancel }: { slug: string; onSuccess: () => void; onCancel: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['edition-detail', slug],
    queryFn: () => authFetch<ApiBookEdition>(`/editions/${slug}`),
    staleTime: 0, gcTime: 0,
  })
  if (isLoading || !data) return <div className="py-12 text-center text-stone-400">Loading…</div>
  return (
    <EditBookEditionForm
      edition={data}
      onSuccess={() => { qc.invalidateQueries({ queryKey: ['edition-detail', slug] }); onSuccess() }}
      onCancel={onCancel}
    />
  )
}

// ─── EditBookForm ──────────────────────────────────────────────────────────────
interface BookFormState {
  title: string; description: string; seriesName: string; volumeNumber: string
  genres: string[]; authors: PersonEntry[]
}

type FullBook = Omit<ApiBook, 'authors'> & { authors: { author: { id: string; name: string; slug: string } }[] }

function EditBookForm({ book, onSuccess, onCancel }: { book: FullBook; onSuccess: () => void; onCancel: () => void }) {
  const qc = useQueryClient()
  const normAuthors: PersonEntry[] = book.authors.map(a => ({ id: a.author.id, name: a.author.name }))
  const [form, setForm] = useState<BookFormState>({
    title: book.title,
    description: book.description ?? '',
    seriesName: book.seriesName ?? '',
    volumeNumber: book.volumeNumber != null ? String(book.volumeNumber) : '',
    genres: book.genres ?? [],
    authors: normAuthors,
  })
  const originalAuthorIds = new Set(normAuthors.map(a => a.id).filter(Boolean) as string[])

  const editMutation = useMutation({
    mutationFn: async () => {
      await authFetch(`/books/${book.slug}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          seriesName: form.seriesName || undefined,
          volumeNumber: form.volumeNumber ? Number(form.volumeNumber) : undefined,
          genres: form.genres,
        }),
      })
      const newIds = new Set(form.authors.filter(a => a.id).map(a => a.id!))
      for (const id of originalAuthorIds) {
        if (!newIds.has(id)) await authFetch(`/books/${book.slug}/authors/${id}`, { method: 'DELETE' })
      }
      for (const auth of form.authors) {
        let id = auth.id
        if (!id) {
          const created = await authFetch<{ id: string }>('/authors', { method: 'POST', body: JSON.stringify({ name: auth.name }) })
          id = created.id
        }
        if (!originalAuthorIds.has(id)) await authFetch(`/books/${book.slug}/authors/${id}`, { method: 'POST' })
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'pending-books'] }); onSuccess() },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); editMutation.mutate() }} className="flex flex-col gap-4">
      <div>
        <label className={LBL}>Title *</label>
        <input required className={INP} value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </div>
      <div>
        <label className={LBL}>Description</label>
        <textarea rows={3} className={INP} value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      <div>
        <label className={LBL}>Authors</label>
        <PersonPicker endpoint="authors" placeholder="Search or create author…"
          onAdd={a => {
            if (!form.authors.find(ex => ex.name.toLowerCase() === a.name.toLowerCase()))
              setForm(f => ({ ...f, authors: [...f.authors, a] }))
          }} />
        {form.authors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {form.authors.map((a, i) => (
              <span key={i} className="flex items-center gap-1.5 bg-stone-700 text-stone-200 text-xs px-2.5 py-1 rounded-full">
                {!a.id && <span className="text-amber-400 text-[9px] font-semibold uppercase">new</span>}
                {a.name}
                <button type="button" onClick={() => setForm(f => ({ ...f, authors: f.authors.filter((_, j) => j !== i) }))}
                  className="text-stone-500 hover:text-red-400">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Series</label>
          <SeriesPicker value={form.seriesName} onChange={v => setForm(f => ({ ...f, seriesName: v }))} />
        </div>
        <div>
          <label className={LBL}>Volume</label>
          <input type="number" className={INP} value={form.volumeNumber} min={0} step={0.5}
            onChange={e => setForm(f => ({ ...f, volumeNumber: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className={LBL}>Genres</label>
        <GenreTagsPicker genres={form.genres} onChange={v => setForm(f => ({ ...f, genres: v }))} />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={editMutation.isPending}
          className="flex-1 bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors">
          {editMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-stone-700 text-stone-300 hover:bg-stone-600 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

function EditBookLoader({ slug, onSuccess, onCancel }: { slug: string; onSuccess: () => void; onCancel: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['book-full', slug],
    queryFn: () => authFetch<FullBook>(`/books/${slug}`),
    staleTime: 0, gcTime: 0,
  })
  if (isLoading || !data) return <div className="py-12 text-center text-stone-400">Loading…</div>
  return <EditBookForm book={data} onSuccess={onSuccess} onCancel={onCancel} />
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
  const [editEditionSlug, setEditEditionSlug] = useState<string | null>(null)
  const [editBookSlug, setEditBookSlug] = useState<string | null>(null)

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

  async function rejectEdition(slug: string, collectionCount?: number) {
    const warningMsg = collectionCount && collectionCount > 0
      ? `This edition is in ${collectionCount} user collection(s). Deleting it will remove it from their collections too. Continue?`
      : 'Reject and delete this edition? This cannot be undone.'
    if (!confirm(warningMsg)) return
    try {
      await authFetch(`/editions/${slug}`, { method: 'DELETE' })
      void qc.invalidateQueries({ queryKey: ['admin', 'pending-editions'] })
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
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
                    {(edition._count?.userEntries ?? 0) > 0 && (
                      <p className="text-[11px] text-amber-500/70 mt-1">
                        ⚠ In {edition._count!.userEntries} user collection(s)
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 items-center flex-shrink-0">
                    <a
                      href={edition.book?.slug ? `/editions/${edition.slug}` : '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-stone-400 hover:text-amber-400 border border-stone-700 px-2 py-1 rounded transition-colors"
                    >
                      View
                    </a>
                    <button
                      onClick={() => setEditEditionSlug(edition.slug)}
                      className="text-xs text-stone-300 hover:text-amber-400 border border-stone-700 px-2 py-1 rounded transition-colors"
                    >
                      ✎ Edit
                    </button>
                    <button
                      onClick={() => rejectEdition(edition.slug, edition._count?.userEntries)}
                      className="text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-700/60 px-2 py-1 rounded transition-colors"
                    >
                      ✕ Reject
                    </button>
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
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-100 text-sm">
                      {book.title}
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
                      onClick={() => setEditBookSlug(book.slug)}
                      className="text-xs text-stone-300 hover:text-amber-400 border border-stone-700 px-2 py-1 rounded transition-colors"
                    >
                      ✎ Edit
                    </button>
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

      {/* Edit Edition modal */}
      <FormModal open={editEditionSlug !== null} title="Edit Edition" onClose={() => setEditEditionSlug(null)}>
        {editEditionSlug && (
          <EditEditionLoader
            slug={editEditionSlug}
            onSuccess={() => { qc.invalidateQueries({ queryKey: ['admin', 'pending-editions'] }); setEditEditionSlug(null) }}
            onCancel={() => setEditEditionSlug(null)}
          />
        )}
      </FormModal>

      {/* Edit Book modal */}
      <FormModal open={editBookSlug !== null} title="Edit Book" onClose={() => setEditBookSlug(null)}>
        {editBookSlug && (
          <EditBookLoader
            slug={editBookSlug}
            onSuccess={() => { qc.invalidateQueries({ queryKey: ['admin', 'pending-books'] }); setEditBookSlug(null) }}
            onCancel={() => setEditBookSlug(null)}
          />
        )}
      </FormModal>
    </div>
  )
}
