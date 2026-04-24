'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiArtist, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

import ImageUpload from '@/components/admin/ImageUpload'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'

interface ArtistFormData {
  name: string
  bio: string
  nationality: string
  website: string
  photoUrl: string
}

const EMPTY_FORM: ArtistFormData = {
  name: '',
  bio: '',
  nationality: '',
  website: '',
  photoUrl: '',
}

function artistToForm(artist: ApiArtist): ArtistFormData {
  return {
    name: artist.name,
    bio: artist.bio ?? '',
    nationality: '',
    website: '',
    photoUrl: artist.photoUrl ?? '',
  }
}

function formToPayload(form: ArtistFormData) {
  return {
    name: form.name,
    bio: form.bio || undefined,
    nationality: form.nationality || undefined,
    website: form.website || undefined,
    photoUrl: form.photoUrl || undefined,
  }
}

interface ArtistFormProps {
  initial: ArtistFormData
  onSubmit: (data: ArtistFormData) => void
  submitting: boolean
  submitLabel: string
}

function ArtistForm({ initial, onSubmit, submitting, submitLabel }: ArtistFormProps) {
  const [form, setForm] = useState<ArtistFormData>(initial)

  const set = (field: keyof ArtistFormData) => (
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
      <ImageUpload
          label="Photo"
          folder="luxgrimoire/artists"
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

export default function AdminArtistsPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editArtist, setEditArtist] = useState<ApiArtist | null>(null)
  const [deleteArtist, setDeleteArtist] = useState<ApiArtist | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'artists'],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiArtist> | ApiArtist[]>('/artists?page=1&pageSize=20'),
  })

  const artists = data
    ? Array.isArray(data)
      ? data
      : data.data
    : []

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      authFetch('/artists', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'artists'] })
      setCreateOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: ReturnType<typeof formToPayload> }) =>
      authFetch(`/artists/${slug}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'artists'] })
      setEditArtist(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/artists/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'artists'] })
      setDeleteArtist(null)
    },
  })

  const columns = [
    { key: 'name', label: 'Name', render: (row: ApiArtist) => row.name },
    {
      key: 'bio',
      label: 'Bio',
      render: (row: ApiArtist) =>
        row.bio ? `${row.bio.slice(0, 60)}${row.bio.length > 60 ? '…' : ''}` : '—',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Artists</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Artist
        </button>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          data={artists}
          onEdit={(row) => setEditArtist(row)}
          onDelete={(row) => setDeleteArtist(row)}
        />
      )}

      <FormModal open={createOpen} title="Add Artist" onClose={() => setCreateOpen(false)}>
        <ArtistForm
          initial={EMPTY_FORM}
          submitLabel="Create Artist"
          submitting={createMutation.isPending}
          onSubmit={(form) => createMutation.mutate(formToPayload(form))}
        />
      </FormModal>

      <FormModal
        open={editArtist !== null}
        title="Edit Artist"
        onClose={() => setEditArtist(null)}
      >
        {editArtist && (
          <ArtistForm
            initial={artistToForm(editArtist)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={(form) =>
              editMutation.mutate({ slug: editArtist.slug, payload: formToPayload(form) })
            }
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteArtist !== null}
        message={`Delete artist "${deleteArtist?.name}"? This cannot be undone.`}
        onConfirm={() => deleteArtist && deleteMutation.mutate(deleteArtist.slug)}
        onCancel={() => setDeleteArtist(null)}
      />
    </div>
  )
}
