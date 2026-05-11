'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import type { ApiBook, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { type PersonEntry } from '@/components/admin/pickers/PersonPicker'
import { BookForm, type BookFormState } from '@/components/admin/BookForm'
import CreateBookEditionForm from '@/components/admin/CreateBookEditionForm'

const BTN_SM = 'px-2.5 py-1 rounded-md text-xs font-medium transition-colors'

// Raw API shape (authors are nested under .author)
type RawBook = Omit<ApiBook, 'authors'> & {
  authors: { author: { id: string; name: string; slug: string } }[]
  status: string
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [seriesFilter, statusFilter])

  const buildParams = () => {
    const p = new URLSearchParams({ page: String(page), pageSize: '20', status: statusFilter })
    if (debouncedSearch) p.set('search', debouncedSearch)
    if (seriesFilter) p.set('seriesName', seriesFilter)
    return p.toString()
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'books', page, debouncedSearch, seriesFilter, statusFilter],
    queryFn: () => authFetch<PaginatedResponse<RawBook>>(`/books?${buildParams()}`),
    placeholderData: keepPreviousData,
  })
  const books = data?.data ?? []

  // Create handled by CreateBookEditionForm
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
    onError: (e: Error) => alert(`Error deleting book: ${e.message}`),
  })

  const approveMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/books/${slug}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'books'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const columns = [
    {
      key: 'title', label: 'Title',
      render: (row: RawBook) => (
        <a href={`/books/${row.slug}`} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 font-medium">
          {row.title}
        </a>
      ),
    },
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
      key: 'status', label: 'Status',
      render: (row: RawBook) => (
        <div className="flex items-center gap-2">
          {row.status === 'pending' ? (
            <>
              <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">Pending</span>
              <button
                type="button"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate(row.slug)}
                className={`${BTN_SM} bg-emerald-700 text-emerald-100 hover:bg-emerald-600 disabled:opacity-50`}
              >
                Approve
              </button>
            </>
          ) : row.status === 'rejected' ? (
            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">Rejected</span>
          ) : (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">Approved</span>
          )}
        </div>
      ),
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
      <div className="flex gap-3 mb-4 flex-wrap">
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

      {/* Status tabs */}
      <div className="flex gap-1 mb-5 border-b border-stone-700 pb-0">
        {(['all', 'pending', 'approved'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors capitalize ${
              statusFilter === s
                ? 'bg-stone-800 text-amber-400 border border-stone-700 border-b-stone-800 -mb-px'
                : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            {s === 'all' ? 'All' : s === 'pending' ? '⏳ Pending' : '✅ Approved'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : books.length === 0 ? (
        <div className="text-stone-500 py-8 text-center">No books found{search || seriesFilter ? ' matching your filters' : ''}.</div>
      ) : (
        <>
          <DataTable columns={columns} data={books}
            onEdit={row => setEditBook(row)}
            onDelete={isManager ? undefined : row => setDeleteBook(row)} />
          {(data?.totalPages ?? 1) > 1 && (
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 rounded border border-stone-700 text-stone-400 disabled:opacity-40 hover:border-amber-500 hover:text-amber-400 transition-colors text-sm">← Prev</button>
              <span className="text-stone-500 text-sm">Page {page} / {data?.totalPages}</span>
              <button onClick={() => setPage(p => Math.min(data?.totalPages ?? 1, p + 1))} disabled={page === (data?.totalPages ?? 1)}
                className="px-3 py-1 rounded border border-stone-700 text-stone-400 disabled:opacity-40 hover:border-amber-500 hover:text-amber-400 transition-colors text-sm">Next →</button>
            </div>
          )}
        </>
      )}

      <FormModal open={createOpen} title="Add Book" onClose={() => setCreateOpen(false)}>
        <CreateBookEditionForm
          bookOnly
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['admin', 'books'] }); setCreateOpen(false) }}
          onCancel={() => setCreateOpen(false)}
        />
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