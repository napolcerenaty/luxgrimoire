'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiBook, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'

interface BookFormData {
  title: string
  originalTitle: string
  description: string
  seriesName: string
  volumeNumber: string
  genreTags: string
  coverImage: string
  authorIds: string
}

const EMPTY_FORM: BookFormData = {
  title: '',
  originalTitle: '',
  description: '',
  seriesName: '',
  volumeNumber: '',
  genreTags: '',
  coverImage: '',
  authorIds: '',
}

function bookToForm(book: ApiBook): BookFormData {
  return {
    title: book.title,
    originalTitle: book.altTitle ?? '',
    description: book.description ?? '',
    seriesName: book.seriesName ?? '',
    volumeNumber: book.volumeNumber != null ? String(book.volumeNumber) : '',
    genreTags: '',
    coverImage: book.coverImage ?? '',
    authorIds: book.authors.map((a) => a.id).join(', '),
  }
}

interface BookFormProps {
  initial: BookFormData
  onSubmit: (data: BookFormData) => void
  submitting: boolean
  submitLabel: string
}

function BookForm({ initial, onSubmit, submitting, submitLabel }: BookFormProps) {
  const [form, setForm] = useState<BookFormData>(initial)

  const set = (field: keyof BookFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [field]: e.target.value }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <label className={LABEL_CLASS}>Title *</label>
        <input required className={INPUT_CLASS} value={form.title} onChange={set('title')} />
      </div>
      <div>
        <label className={LABEL_CLASS}>Original Title</label>
        <input className={INPUT_CLASS} value={form.originalTitle} onChange={set('originalTitle')} />
      </div>
      <div>
        <label className={LABEL_CLASS}>Description</label>
        <textarea
          rows={3}
          className={INPUT_CLASS}
          value={form.description}
          onChange={set('description')}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLASS}>Series Name</label>
          <input className={INPUT_CLASS} value={form.seriesName} onChange={set('seriesName')} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Volume #</label>
          <input
            type="number"
            className={INPUT_CLASS}
            value={form.volumeNumber}
            onChange={set('volumeNumber')}
          />
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Genre Tags (comma-separated)</label>
        <input className={INPUT_CLASS} value={form.genreTags} onChange={set('genreTags')} />
      </div>
      <div>
        <label className={LABEL_CLASS}>Cover Image (Cloudinary publicId)</label>
        <input className={INPUT_CLASS} value={form.coverImage} onChange={set('coverImage')} />
      </div>
      <div>
        <label className={LABEL_CLASS}>Author IDs (comma-separated)</label>
        <input className={INPUT_CLASS} value={form.authorIds} onChange={set('authorIds')} />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

function formToPayload(form: BookFormData) {
  return {
    title: form.title,
    altTitle: form.originalTitle || undefined,
    description: form.description || undefined,
    seriesName: form.seriesName || undefined,
    volumeNumber: form.volumeNumber ? Number(form.volumeNumber) : undefined,
    genreTags: form.genreTags
      ? form.genreTags.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
    coverImage: form.coverImage || undefined,
    authorIds: form.authorIds
      ? form.authorIds.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
  }
}

export default function AdminBooksPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editBook, setEditBook] = useState<ApiBook | null>(null)
  const [deleteBook, setDeleteBook] = useState<ApiBook | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'books'],
    queryFn: () => authFetch<PaginatedResponse<ApiBook>>('/books?page=1&pageSize=20'),
  })

  const books = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      authFetch('/books', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'books'] })
      setCreateOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: ReturnType<typeof formToPayload> }) =>
      authFetch(`/books/${slug}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'books'] })
      setEditBook(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/books/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'books'] })
      setDeleteBook(null)
    },
  })

  const columns = [
    { key: 'title', label: 'Title', render: (row: ApiBook) => row.title },
    {
      key: 'series',
      label: 'Series',
      render: (row: ApiBook) =>
        row.seriesName
          ? `${row.seriesName}${row.volumeNumber != null ? ` #${row.volumeNumber}` : ''}`
          : '—',
    },
    {
      key: 'authors',
      label: 'Authors',
      render: (row: ApiBook) => row.authors.map((a) => a.name).join(', ') || '—',
    },
    {
      key: 'editions',
      label: 'Editions',
      render: (row: ApiBook) => row.editions?.length ?? 0,
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Books</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Book
        </button>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          data={books}
          onEdit={(row) => setEditBook(row)}
          onDelete={(row) => setDeleteBook(row)}
        />
      )}

      <FormModal open={createOpen} title="Add Book" onClose={() => setCreateOpen(false)}>
        <BookForm
          initial={EMPTY_FORM}
          submitLabel="Create Book"
          submitting={createMutation.isPending}
          onSubmit={(form) => createMutation.mutate(formToPayload(form))}
        />
      </FormModal>

      <FormModal
        open={editBook !== null}
        title="Edit Book"
        onClose={() => setEditBook(null)}
      >
        {editBook && (
          <BookForm
            initial={bookToForm(editBook)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={(form) =>
              editMutation.mutate({ slug: editBook.slug, payload: formToPayload(form) })
            }
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteBook !== null}
        message={`Delete "${deleteBook?.title}"? This cannot be undone.`}
        onConfirm={() => deleteBook && deleteMutation.mutate(deleteBook.slug)}
        onCancel={() => setDeleteBook(null)}
      />
    </div>
  )
}
