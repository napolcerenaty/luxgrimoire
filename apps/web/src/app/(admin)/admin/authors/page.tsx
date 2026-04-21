'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiAuthor, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'

interface AuthorFormData {
  name: string
  bio: string
  nationality: string
  website: string
  photoUrl: string
}

const EMPTY_FORM: AuthorFormData = {
  name: '',
  bio: '',
  nationality: '',
  website: '',
  photoUrl: '',
}

function authorToForm(author: ApiAuthor): AuthorFormData {
  return {
    name: author.name,
    bio: author.bio ?? '',
    nationality: '',
    website: '',
    photoUrl: author.photoUrl ?? '',
  }
}

function formToPayload(form: AuthorFormData) {
  return {
    name: form.name,
    bio: form.bio || undefined,
    nationality: form.nationality || undefined,
    website: form.website || undefined,
    photoUrl: form.photoUrl || undefined,
  }
}

interface AuthorFormProps {
  initial: AuthorFormData
  onSubmit: (data: AuthorFormData) => void
  submitting: boolean
  submitLabel: string
}

function AuthorForm({ initial, onSubmit, submitting, submitLabel }: AuthorFormProps) {
  const [form, setForm] = useState<AuthorFormData>(initial)

  const set = (field: keyof AuthorFormData) => (
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
        <label className={LABEL_CLASS}>Name *</label>
        <input required className={INPUT_CLASS} value={form.name} onChange={set('name')} />
      </div>
      <div>
        <label className={LABEL_CLASS}>Biography</label>
        <textarea
          rows={4}
          className={INPUT_CLASS}
          value={form.bio}
          onChange={set('bio')}
        />
      </div>
      <div>
        <label className={LABEL_CLASS}>Nationality</label>
        <input className={INPUT_CLASS} value={form.nationality} onChange={set('nationality')} />
      </div>
      <div>
        <label className={LABEL_CLASS}>Website</label>
        <input
          type="url"
          className={INPUT_CLASS}
          value={form.website}
          onChange={set('website')}
        />
      </div>
      <div>
        <label className={LABEL_CLASS}>Photo (Cloudinary publicId)</label>
        <input className={INPUT_CLASS} value={form.photoUrl} onChange={set('photoUrl')} />
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

export default function AdminAuthorsPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editAuthor, setEditAuthor] = useState<ApiAuthor | null>(null)
  const [deleteAuthor, setDeleteAuthor] = useState<ApiAuthor | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'authors'],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiAuthor> | ApiAuthor[]>('/authors?page=1&pageSize=20'),
  })

  const authors = data
    ? Array.isArray(data)
      ? data
      : data.data
    : []

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      authFetch('/authors', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'authors'] })
      setCreateOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: ReturnType<typeof formToPayload> }) =>
      authFetch(`/authors/${slug}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'authors'] })
      setEditAuthor(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/authors/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'authors'] })
      setDeleteAuthor(null)
    },
  })

  const columns = [
    { key: 'name', label: 'Name', render: (row: ApiAuthor) => row.name },
    {
      key: 'bio',
      label: 'Bio',
      render: (row: ApiAuthor) =>
        row.bio ? `${row.bio.slice(0, 60)}${row.bio.length > 60 ? '…' : ''}` : '—',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Authors</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Author
        </button>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          data={authors}
          onEdit={(row) => setEditAuthor(row)}
          onDelete={(row) => setDeleteAuthor(row)}
        />
      )}

      <FormModal open={createOpen} title="Add Author" onClose={() => setCreateOpen(false)}>
        <AuthorForm
          initial={EMPTY_FORM}
          submitLabel="Create Author"
          submitting={createMutation.isPending}
          onSubmit={(form) => createMutation.mutate(formToPayload(form))}
        />
      </FormModal>

      <FormModal
        open={editAuthor !== null}
        title="Edit Author"
        onClose={() => setEditAuthor(null)}
      >
        {editAuthor && (
          <AuthorForm
            initial={authorToForm(editAuthor)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={(form) =>
              editMutation.mutate({ slug: editAuthor.slug, payload: formToPayload(form) })
            }
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteAuthor !== null}
        message={`Delete author "${deleteAuthor?.name}"? This cannot be undone.`}
        onConfirm={() => deleteAuthor && deleteMutation.mutate(deleteAuthor.slug)}
        onCancel={() => setDeleteAuthor(null)}
      />
    </div>
  )
}
