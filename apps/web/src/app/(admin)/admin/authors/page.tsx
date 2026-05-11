'use client'

import { useState } from 'react'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { INPUT_CLASS, LABEL_CLASS } from '@/lib/adminFormStyles'
import type { ApiAuthor, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

import ImageUpload from '@/components/admin/ImageUpload'


interface AuthorFormData {
  name: string
  bio: string
  nationality: string
  website: string
  instagram: string
  twitter: string
  facebook: string
  tiktok: string
  photoUrl: string
}

const EMPTY_FORM: AuthorFormData = {
  name: '',
  bio: '',
  nationality: '',
  website: '',
  instagram: '',
  twitter: '',
  facebook: '',
  tiktok: '',
  photoUrl: '',
}

function authorToForm(author: ApiAuthor): AuthorFormData {
  return {
    name: author.name,
    bio: author.bio ?? '',
    nationality: author.nationality ?? '',
    website: author.website ?? '',
    instagram: author.instagram ?? '',
    twitter: author.twitter ?? '',
    facebook: author.facebook ?? '',
    tiktok: author.tiktok ?? '',
    photoUrl: author.photoUrl ?? '',
  }
}

function formToPayload(form: AuthorFormData) {
  return {
    name: form.name,
    bio: form.bio || undefined,
    nationality: form.nationality || undefined,
    website: form.website || undefined,
    instagram: form.instagram || undefined,
    twitter: form.twitter || undefined,
    facebook: form.facebook || undefined,
    tiktok: form.tiktok || undefined,
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
        <label className={LABEL_CLASS}>Instagram handle</label>
        <input className={INPUT_CLASS} placeholder="e.g. johndoe" value={form.instagram} onChange={set('instagram')} />
      </div>
      <div>
        <label className={LABEL_CLASS}>Twitter / X handle</label>
        <input className={INPUT_CLASS} placeholder="e.g. johndoe" value={form.twitter} onChange={set('twitter')} />
      </div>
      <div>
        <label className={LABEL_CLASS}>TikTok handle</label>
        <input className={INPUT_CLASS} placeholder="e.g. johndoe" value={form.tiktok} onChange={set('tiktok')} />
      </div>
      <div>
        <label className={LABEL_CLASS}>Facebook</label>
        <input className={INPUT_CLASS} placeholder="username or page slug" value={form.facebook} onChange={set('facebook')} />
      </div>
      <ImageUpload
          label="Photo"
          folder="luxgrimoire/authors"
          value={form.photoUrl}
          onChange={(id) => setForm((f) => ({ ...f, photoUrl: id }))}
          aspectRatio="1/1"
        />
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
  const createModal = useModalState()
  const [editAuthor, setEditAuthor] = useState<ApiAuthor | null>(null)
  const [deleteAuthor, setDeleteAuthor] = useState<ApiAuthor | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'authors', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '15' })
      if (search) params.set('search', search)
      return authFetch<PaginatedResponse<ApiAuthor>>(`/authors?${params}`)
    },
    placeholderData: keepPreviousData,
  })

  const authors = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      authFetch('/authors', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'authors'] })
      createModal.close()
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
    {
      key: 'name', label: 'Name',
      render: (row: ApiAuthor) => (
        <a href={`/authors/${row.slug}`} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 font-medium">
          {row.name}
        </a>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Authors</h1>
        <button
          onClick={() => createModal.open()}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Author
        </button>
      </div>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search authors…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full max-w-sm bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-400 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={authors}
            onEdit={(row) => setEditAuthor(row)}
            onDelete={(row) => setDeleteAuthor(row)}
          />
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

      <FormModal open={createModal.isOpen} title="Add Author" onClose={() => createModal.close()}>
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
