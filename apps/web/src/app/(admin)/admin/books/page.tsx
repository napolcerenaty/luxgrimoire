'use client'

import { useState, useEffect } from 'react'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import type { ApiBook, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { Pagination } from '@/components/admin/Pagination'
import { type PersonEntry } from '@/components/admin/pickers/PersonPicker'
import { BookForm, seriesEntriesToPayload, type BookFormState } from '@/components/admin/BookForm'
import CreateBookEditionForm from '@/components/admin/CreateBookEditionForm'
import { formatVolumeNumbers } from '@/lib/volumeNumbers'
import { Check } from 'lucide-react'

const BTN_SM = 'px-2.5 py-1 rounded-md text-xs font-medium transition-colors'

// List endpoint returns nested authors: { author: { id, name, slug } }[]
// Same shape as the lean /for-edit endpoint — both use nested authors.
type RawBook = Omit<ApiBook, 'authors'> & {
  authors: { author: { id: string; name: string; slug: string } }[]
}

function rawBookToForm(book: RawBook): BookFormState {
  return {
    title: book.title,
    description: book.description ?? '',
    seriesEntries: (book.seriesEntries ?? [])
      .slice()
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
      .map(e => ({
        seriesName: e.series.name,
        volumeNumbers: formatVolumeNumbers(e.volumeNumbers),
        isPrimary: e.isPrimary,
      })),
    genres: book.genres ?? [],
    authors: book.authors.map(ba => ({ id: ba.author.id, name: ba.author.name })),
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminBooksPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isManager = user?.role === 'COMPANY_MANAGER'
  const createModal = useModalState()
  const [editBookSlug, setEditBookSlug] = useState<string | null>(null)
  const [deleteBook, setDeleteBook] = useState<RawBook | null>(null)

  const { data: editBookData, isLoading: editBookLoading } = useQuery({
    queryKey: ['admin', 'books', 'detail', editBookSlug],
    queryFn: () => authFetch<RawBook>(`/books/${editBookSlug}/for-edit`),
    enabled: editBookSlug !== null,
  })

  const [search, setSearch] = useState('')
  const [seriesFilter, setSeriesFilter] = useState('')
  const [omnibusOnly, setOmnibusOnly] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [seriesFilter, omnibusOnly])

  const buildParams = () => {
    const p = new URLSearchParams({ page: String(page), pageSize: '20' })
    if (debouncedSearch) p.set('search', debouncedSearch)
    if (seriesFilter) p.set('seriesName', seriesFilter)
    if (omnibusOnly) p.set('isOmnibus', 'true')
    return p.toString()
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'books', page, debouncedSearch, seriesFilter, omnibusOnly],
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
          description: form.description || null,
          seriesEntries: seriesEntriesToPayload(form.seriesEntries),
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
      setEditBookSlug(null)
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

  const columns = [
    {
      key: 'title', label: 'Title',
      render: (row: RawBook) => (
        <a href={`/books/${row.slug}`} target="_blank" rel="noreferrer" className="text-brand-400 hover:text-brand-300 font-medium">
          {row.title}
        </a>
      ),
    },
    {
      key: 'series', label: 'Series',
      render: (row: RawBook) => row.seriesName
        ? `${row.seriesName}${row.volumeNumbers?.length ? ` #${formatVolumeNumbers(row.volumeNumbers)}` : ''}` : '—',
    },
    {
      key: 'isOmnibus', label: 'Omnibus',
      render: (row: RawBook) => row.isOmnibus ? (
        <span className="inline-flex items-center gap-1 text-green-400">
          <Check size={14} /> {row.componentCount ?? 0}
        </span>
      ) : '—',
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
              <span key={g} className="bg-brand-500/15 text-brand-300 border border-brand-500/30 text-xs px-2 py-0.5 rounded-full">{g}</span>
            ))}
          </div>
        ) : '—',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Books</h1>
        <button onClick={() => createModal.open()}
          className="bg-brand-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-brand-300 transition-colors">
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
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-brand-400 w-72"
        />
        <input
          type="text"
          placeholder="Filter by series…"
          value={seriesFilter}
          onChange={(e) => setSeriesFilter(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-brand-400 w-48"
        />
        <label className="flex items-center gap-2 px-3 py-2 text-sm text-stone-300 whitespace-nowrap">
          <input type="checkbox" checked={omnibusOnly} onChange={e => setOmnibusOnly(e.target.checked)}
            className="accent-brand-400" />
          Omnibuses only
        </label>
        {(search || seriesFilter || omnibusOnly) && (
          <button
            onClick={() => { setSearch(''); setSeriesFilter(''); setOmnibusOnly(false) }}
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
        <>
          <DataTable columns={columns} data={books}
            onEdit={row => setEditBookSlug(row.slug)}
            onDelete={isManager ? undefined : row => setDeleteBook(row)} />
          <Pagination page={page} totalPages={data?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}

      <FormModal open={createModal.isOpen} title="Add Book" onClose={() => createModal.close()}>
        <CreateBookEditionForm
          bookOnly
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['admin', 'books'] }); createModal.close() }}
          onCancel={() => createModal.close()}
        />
      </FormModal>

      <FormModal open={editBookSlug !== null} title="Edit Book" onClose={() => setEditBookSlug(null)}>
        {editBookLoading && (
          <div className="text-stone-400 py-8 text-center">Loading…</div>
        )}
        {editBookData && (
          <BookForm initial={rawBookToForm(editBookData)} submitLabel="Save Changes"
            submitting={editMutation.isPending} bookSlug={editBookData.slug} initialIsOmnibus={editBookData.isOmnibus}
            onSubmit={form => editMutation.mutate({ book: editBookData, form })} />
        )}
      </FormModal>

      <ConfirmDialog open={deleteBook !== null}
        message={`Delete "${deleteBook?.title}"? This cannot be undone.`}
        onConfirm={() => deleteBook && deleteMutation.mutate(deleteBook.slug)}
        onCancel={() => setDeleteBook(null)} />
    </div>
  )
}