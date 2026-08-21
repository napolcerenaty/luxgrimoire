'use client'

import { useState } from 'react'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { INPUT_CLASS, LABEL_CLASS } from '@/lib/adminFormStyles'
import type { ApiArtist, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { Pagination } from '@/components/admin/Pagination'

import ImageUpload from '@/components/admin/ImageUpload'
import { PersonPicker } from '@/components/admin/pickers/PersonPicker'


interface ArtistFormData {
  name: string
  bio: string
  specialty: string
  website: string
  instagram: string
  twitter: string
  facebook: string
  tiktok: string
  photoUrl: string
  isCollective: boolean
  studioId: string | null
  studioName: string | null
}

const EMPTY_FORM: ArtistFormData = {
  name: '',
  bio: '',
  specialty: '',
  website: '',
  instagram: '',
  twitter: '',
  facebook: '',
  tiktok: '',
  photoUrl: '',
  isCollective: false,
  studioId: null,
  studioName: null,
}

function artistToForm(artist: ApiArtist): ArtistFormData {
  return {
    name: artist.name,
    bio: artist.bio ?? '',
    specialty: artist.specialty ?? '',
    website: artist.website ?? '',
    instagram: artist.instagram ?? '',
    twitter: artist.twitter ?? '',
    facebook: artist.facebook ?? '',
    tiktok: artist.tiktok ?? '',
    photoUrl: artist.photoUrl ?? '',
    isCollective: artist.isCollective ?? false,
    studioId: artist.studioId ?? null,
    studioName: artist.studio?.name ?? null,
  }
}

function formToPayload(form: ArtistFormData) {
  return {
    name: form.name,
    bio: form.bio || undefined,
    specialty: form.specialty || undefined,
    website: form.website || undefined,
    instagram: form.instagram || undefined,
    twitter: form.twitter || undefined,
    facebook: form.facebook || undefined,
    tiktok: form.tiktok || undefined,
    photoUrl: form.photoUrl || undefined,
    isCollective: form.isCollective,
    studioId: form.studioId ?? '',
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
      <div className="flex items-center gap-2">
        <input
          id="artist-is-collective"
          type="checkbox"
          checked={form.isCollective}
          onChange={(e) => setForm((f) => ({ ...f, isCollective: e.target.checked }))}
          className="accent-brand-400"
        />
        <label htmlFor="artist-is-collective" className="text-sm text-navy-300">
          This is a studio/collective, not an individual person
        </label>
      </div>
      <div>
        <label className={LABEL_CLASS}>Studio / collective (optional)</label>
        {form.studioId && form.studioName ? (
          <div className="flex items-center gap-2 bg-navy-800 border border-navy-700 rounded-lg px-3 py-2">
            <span className="text-sm text-navy-200 flex-1">{form.studioName}</span>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, studioId: null, studioName: null }))}
              className="text-navy-500 hover:text-navy-300 text-sm"
            >
              ×
            </button>
          </div>
        ) : (
          <PersonPicker
            endpoint="artists"
            placeholder="Search or create the studio this artist publishes under…"
            onAdd={(entry) => setForm((f) => ({ ...f, studioId: entry.id ?? null, studioName: entry.name }))}
          />
        )}
        <p className="text-xs text-navy-500 mt-1">
          If this artist publishes under a shared studio/brand handle, link it here — the person&apos;s own name is kept as the primary credit.
        </p>
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
        <input className={INPUT_CLASS} value={form.specialty} onChange={set('specialty')} />
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
          folder="luxgrimoire/artists"
          value={form.photoUrl}
          onChange={(id) => setForm((f) => ({ ...f, photoUrl: id }))}
          aspectRatio="1/1"
        />
      <button
        type="submit"
        disabled={submitting}
        className="bg-brand-400 text-navy-950 font-semibold px-4 py-2 rounded-lg hover:bg-brand-300 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

export default function AdminArtistsPage() {
  const queryClient = useQueryClient()
  const createModal = useModalState()
  const [editArtist, setEditArtist] = useState<ApiArtist | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [deleteArtist, setDeleteArtist] = useState<ApiArtist | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'artists', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '15' })
      if (search) params.set('search', search)
      return authFetch<PaginatedResponse<ApiArtist>>(`/artists?${params}`)
    },
    placeholderData: keepPreviousData,
  })

  const artists = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      authFetch('/artists', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'artists'] })
      createModal.close()
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

  const handleEditArtist = async (artist: ApiArtist) => {
    setEditLoading(true)
    try {
      const full = await authFetch<ApiArtist>(`/artists/${artist.slug}`)
      setEditArtist(full)
    } finally {
      setEditLoading(false)
    }
  }

  const columns = [
    {
      key: 'name', label: 'Name',
      render: (row: ApiArtist) => (
        <div className="flex items-center gap-2">
          <a href={`/artists/${row.slug}`} target="_blank" rel="noreferrer" className="text-brand-400 hover:text-brand-300 font-medium">
            {row.name}
          </a>
          {row.isCollective && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-navy-800/90 text-navy-300 border border-navy-600">
              studio
            </span>
          )}
          {row.studio?.name && (
            <span className="text-xs text-navy-500">for {row.studio.name}</span>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-100">Artists</h1>
        <button
          onClick={() => createModal.open()}
          className="bg-brand-400 text-navy-950 font-semibold px-4 py-2 rounded-lg hover:bg-brand-300 transition-colors"
        >
          Add Artist
        </button>
      </div>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search artists…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full max-w-sm bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 placeholder-navy-500 focus:outline-none focus:border-brand-400"
        />
      </div>

      {isLoading ? (
        <div className="text-navy-400 py-8 text-center">Loading…</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={artists}
            onEdit={(row) => handleEditArtist(row)}
            onDelete={(row) => setDeleteArtist(row)}
          />
          <Pagination page={page} totalPages={data?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}

      <FormModal open={createModal.isOpen} title="Add Artist" onClose={() => createModal.close()}>
        <ArtistForm
          initial={EMPTY_FORM}
          submitLabel="Create Artist"
          submitting={createMutation.isPending}
          onSubmit={(form) => createMutation.mutate(formToPayload(form))}
        />
      </FormModal>

      <FormModal
        open={editArtist !== null || editLoading}
        title="Edit Artist"
        onClose={() => setEditArtist(null)}
      >
        {editLoading ? (
          <div className="text-navy-400 py-8 text-center">Loading…</div>
        ) : editArtist && (
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
