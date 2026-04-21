'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiBookEdition, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'

const FORMAT_OPTIONS = ['STANDARD', 'SPECIAL', 'DELUXE', 'COLLECTORS', 'LIMITED']

interface EditionFormData {
  bookId: string
  publisher: string
  publishYear: string
  format: string
  coverImage: string
  pageCount: string
  isbn: string
  language: string
}

const EMPTY_FORM: EditionFormData = {
  bookId: '',
  publisher: '',
  publishYear: '',
  format: 'STANDARD',
  coverImage: '',
  pageCount: '',
  isbn: '',
  language: '',
}

function editionToForm(edition: ApiBookEdition): EditionFormData {
  return {
    bookId: edition.bookId,
    publisher: edition.publisher ?? '',
    publishYear: edition.publishYear != null ? String(edition.publishYear) : '',
    format: edition.format ?? 'STANDARD',
    coverImage: edition.coverImage ?? '',
    pageCount: '',
    isbn: '',
    language: '',
  }
}

function formToPayload(form: EditionFormData) {
  return {
    bookId: form.bookId,
    publisher: form.publisher || undefined,
    publishYear: form.publishYear ? Number(form.publishYear) : undefined,
    format: form.format || undefined,
    coverImage: form.coverImage || undefined,
    pageCount: form.pageCount ? Number(form.pageCount) : undefined,
    isbn: form.isbn || undefined,
    language: form.language || undefined,
  }
}

interface EditionFormProps {
  initial: EditionFormData
  onSubmit: (data: EditionFormData) => void
  submitting: boolean
  submitLabel: string
}

function EditionForm({ initial, onSubmit, submitting, submitLabel }: EditionFormProps) {
  const [form, setForm] = useState<EditionFormData>(initial)

  const set = (field: keyof EditionFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
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
        <label className={LABEL_CLASS}>Book ID</label>
        <input className={INPUT_CLASS} value={form.bookId} onChange={set('bookId')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLASS}>Publisher</label>
          <input className={INPUT_CLASS} value={form.publisher} onChange={set('publisher')} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Publish Year</label>
          <input
            type="number"
            className={INPUT_CLASS}
            value={form.publishYear}
            onChange={set('publishYear')}
          />
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Format</label>
        <select className={INPUT_CLASS} value={form.format} onChange={set('format')}>
          {FORMAT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL_CLASS}>Cover Image (Cloudinary publicId)</label>
        <input className={INPUT_CLASS} value={form.coverImage} onChange={set('coverImage')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLASS}>Page Count</label>
          <input
            type="number"
            className={INPUT_CLASS}
            value={form.pageCount}
            onChange={set('pageCount')}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Language</label>
          <input className={INPUT_CLASS} value={form.language} onChange={set('language')} />
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>ISBN</label>
        <input className={INPUT_CLASS} value={form.isbn} onChange={set('isbn')} />
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

export default function AdminEditionsPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editEdition, setEditEdition] = useState<ApiBookEdition | null>(null)
  const [deleteEdition, setDeleteEdition] = useState<ApiBookEdition | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'editions'],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiBookEdition> | ApiBookEdition[]>(
        '/editions?page=1&pageSize=20',
      ),
  })

  const editions = data
    ? Array.isArray(data)
      ? data
      : data.data
    : []

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      authFetch('/editions', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'editions'] })
      setCreateOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({
      slug,
      payload,
    }: {
      slug: string
      payload: ReturnType<typeof formToPayload>
    }) => authFetch(`/editions/${slug}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'editions'] })
      setEditEdition(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/editions/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'editions'] })
      setDeleteEdition(null)
    },
  })

  const columns = [
    {
      key: 'publisher',
      label: 'Publisher',
      render: (row: ApiBookEdition) => row.publisher ?? '—',
    },
    {
      key: 'publishYear',
      label: 'Year',
      render: (row: ApiBookEdition) => row.publishYear ?? '—',
    },
    {
      key: 'format',
      label: 'Format',
      render: (row: ApiBookEdition) => row.format ?? '—',
    },
    {
      key: 'coverImage',
      label: 'Cover',
      render: (row: ApiBookEdition) =>
        row.coverImage ? (
          <span className="text-stone-400 text-xs truncate max-w-[120px] inline-block">
            {row.coverImage}
          </span>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Editions</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Edition
        </button>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          data={editions}
          onEdit={(row) => setEditEdition(row)}
          onDelete={(row) => setDeleteEdition(row)}
        />
      )}

      <FormModal open={createOpen} title="Add Edition" onClose={() => setCreateOpen(false)}>
        <EditionForm
          initial={EMPTY_FORM}
          submitLabel="Create Edition"
          submitting={createMutation.isPending}
          onSubmit={(form) => createMutation.mutate(formToPayload(form))}
        />
      </FormModal>

      <FormModal
        open={editEdition !== null}
        title="Edit Edition"
        onClose={() => setEditEdition(null)}
      >
        {editEdition && (
          <EditionForm
            initial={editionToForm(editEdition)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={(form) =>
              editMutation.mutate({ slug: editEdition.slug, payload: formToPayload(form) })
            }
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteEdition !== null}
        message={`Delete edition "${deleteEdition?.publisher ?? deleteEdition?.slug}"? This cannot be undone.`}
        onConfirm={() => deleteEdition && deleteMutation.mutate(deleteEdition.slug)}
        onCancel={() => setDeleteEdition(null)}
      />
    </div>
  )
}
