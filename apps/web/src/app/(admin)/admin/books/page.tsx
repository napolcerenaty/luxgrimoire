'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import type { ApiBook, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { PersonPicker, type PersonEntry } from '@/components/admin/pickers/PersonPicker'
import { SeriesPicker } from '@/components/admin/pickers/SeriesPicker'
import { GenreTagsPicker } from '@/components/admin/pickers/GenreTagsPicker'

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-sm text-stone-400 mb-1'
const BTN_SM = 'px-2.5 py-1 rounded-md text-xs font-medium transition-colors'

// Raw API shape (authors are nested under .author)
type RawBook = Omit<ApiBook, 'authors'> & {
  authors: { author: { id: string; name: string; slug: string } }[]
}

// ─── BookForm ─────────────────────────────────────────────────────────────────
interface BookFormState {
  title: string
  description: string
  seriesName: string
  volumeNumber: string
  genres: string[]
  authors: PersonEntry[]
}

const EMPTY_FORM: BookFormState = {
  title: '', description: '', seriesName: '', volumeNumber: '',
  genres: [], authors: [],
}

function rawBookToForm(book: RawBook): BookFormState {
  return {
    title: book.title,
    description: book.description ?? '',
    seriesName: book.seriesName ?? '',
    volumeNumber: book.volumeNumber != null ? String(book.volumeNumber) : '',
    genres: book.genres ?? [],
    authors: book.authors.map(ba => ({ id: ba.author.id, name: ba.author.name })),
  }
}

function BookForm({ initial, onSubmit, submitting, submitLabel }: {
  initial: BookFormState
  onSubmit: (data: BookFormState) => void
  submitting: boolean
  submitLabel: string
}) {
  const [form, setForm] = useState<BookFormState>(initial)

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="flex flex-col gap-4">
      {/* Title */}
      <div>
        <label className={LBL}>Title *</label>
        <input required className={INP} value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </div>

      {/* Description */}
      <div>
        <label className={LBL}>Description</label>
        <textarea rows={3} className={INP} value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>

      {/* Authors */}
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

      {/* Series + Volume */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Series</label>
          <SeriesPicker value={form.seriesName} onChange={v => setForm(f => ({ ...f, seriesName: v }))} />
        </div>
        <div>
          <label className={LBL}>Volume / position</label>
          <input type="number" className={INP} value={form.volumeNumber} min={0} step={0.5}
            onChange={e => setForm(f => ({ ...f, volumeNumber: e.target.value }))} />
        </div>
      </div>

      {/* Genres */}
      <div>
        <label className={LBL}>Genres</label>
        <GenreTagsPicker genres={form.genres} onChange={v => setForm(f => ({ ...f, genres: v }))} />
      </div>

      {/* Cover */}

      <button type="submit" disabled={submitting}
        className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors">
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminBooksPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isManager = user?.role === 'COMPANY_MANAGER'
  const [createOpen, setCreateOpen] = useState(false)
  const [editBook, setEditBook] = useState<RawBook | null>(null)
  const [deleteBook, setDeleteBook] = useState<RawBook | null>(null)

  const [search, setSearch] = useState('')
  const [seriesFilter, setSeriesFilter] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const buildParams = () => {
    const p = new URLSearchParams({ page: '1', pageSize: '50' })
    if (debouncedSearch) p.set('search', debouncedSearch)
    if (seriesFilter) p.set('seriesName', seriesFilter)
    return p.toString()
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'books', debouncedSearch, seriesFilter],
    queryFn: () => authFetch<PaginatedResponse<RawBook>>(`/books?${buildParams()}`),
  })
  const books = data?.data ?? []

  // Create: POST book then link authors
  const createMutation = useMutation({
    mutationFn: async (form: BookFormState) => {
      const book = await authFetch<{ id: string; slug: string; genres: string[] }>('/books', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          seriesName: form.seriesName || undefined,
          volumeNumber: form.volumeNumber ? Number(form.volumeNumber) : undefined,
          genres: form.genres.length ? form.genres : undefined,
        }),
      })
      for (const auth of form.authors) {
        let authorId = auth.id
        if (!authorId) {
          const created = await authFetch<{ id: string }>('/authors', {
            method: 'POST', body: JSON.stringify({ name: auth.name }),
          })
          authorId = created.id
        }
        await authFetch(`/books/${book.slug}/authors/${authorId}`, { method: 'POST' })
      }
      return book
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'books'] })
      setCreateOpen(false)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  // Edit: PATCH scalar fields + diff authors
  const editMutation = useMutation({
    mutationFn: async ({ book, form }: { book: RawBook; form: BookFormState }) => {
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
      // Diff authors
      const originalIds = new Set(book.authors.map(ba => ba.author.id))
      const newIds = new Set(form.authors.filter(a => a.id).map(a => a.id!))
      // Remove authors no longer in list
      for (const ba of book.authors) {
        if (!newIds.has(ba.author.id)) {
          await authFetch(`/books/${book.slug}/authors/${ba.author.id}`, { method: 'DELETE' })
        }
      }
      // Add new authors
      for (const auth of form.authors) {
        let authorId = auth.id
        if (!authorId) {
          const created = await authFetch<{ id: string }>('/authors', {
            method: 'POST', body: JSON.stringify({ name: auth.name }),
          })
          authorId = created.id
        }
        if (!originalIds.has(authorId)) {
          await authFetch(`/books/${book.slug}/authors/${authorId}`, { method: 'POST' })
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'books'] })
      setEditBook(null)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/books/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'books'] })
      setDeleteBook(null)
    },
  })

  const columns = [
    { key: 'title', label: 'Title', render: (row: RawBook) => row.title },
    {
      key: 'series', label: 'Series',
      render: (row: RawBook) => row.seriesName
        ? `${row.seriesName}${row.volumeNumber != null ? ` #${row.volumeNumber}` : ''}` : '—',
    },
    {
      key: 'authors', label: 'Authors',
      render: (row: RawBook) => row.authors.map(ba => ba.author.name).join(', ') || '—',
    },
    {
      key: 'genres', label: 'Genres',
      render: (row: RawBook) => (row.genres ?? []).length > 0
        ? (
          <div className="flex flex-wrap gap-1">
            {(row.genres ?? []).map(g => (
              <span key={g} className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs px-2 py-0.5 rounded-full">{g}</span>
            ))}
          </div>
        ) : '—',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Books</h1>
        <button onClick={() => setCreateOpen(true)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors">
          Add Book
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="search"
          placeholder="Search by title or author…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 w-72"
        />
        <input
          type="text"
          placeholder="Filter by series…"
          value={seriesFilter}
          onChange={(e) => setSeriesFilter(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 w-48"
        />
        {(search || seriesFilter) && (
          <button
            onClick={() => { setSearch(''); setSeriesFilter('') }}
            className="text-stone-400 hover:text-stone-200 text-sm px-3 py-2"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : books.length === 0 ? (
        <div className="text-stone-500 py-8 text-center">No books found{search || seriesFilter ? ' matching your filters' : ''}.</div>
      ) : (
        <DataTable columns={columns} data={books}
          onEdit={row => setEditBook(row)}
          onDelete={isManager ? undefined : row => setDeleteBook(row)} />
      )}

      <FormModal open={createOpen} title="Add Book" onClose={() => setCreateOpen(false)}>
        <BookForm initial={EMPTY_FORM} submitLabel="Create Book"
          submitting={createMutation.isPending}
          onSubmit={form => createMutation.mutate(form)} />
      </FormModal>

      <FormModal open={editBook !== null} title="Edit Book" onClose={() => setEditBook(null)}>
        {editBook && (
          <BookForm initial={rawBookToForm(editBook)} submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={form => editMutation.mutate({ book: editBook, form })} />
        )}
      </FormModal>

      <ConfirmDialog open={deleteBook !== null}
        message={`Delete "${deleteBook?.title}"? This cannot be undone.`}
        onConfirm={() => deleteBook && deleteMutation.mutate(deleteBook.slug)}
        onCancel={() => setDeleteBook(null)} />
    </div>
  )
}