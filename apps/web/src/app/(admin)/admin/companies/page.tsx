'use client'

import { useState, useRef } from 'react'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { INPUT_CLASS, LABEL_CLASS } from '@/lib/adminFormStyles'
import { CURRENCIES } from '@/lib/currencies'
import { useAuth } from '@/components/AuthProvider'
import type { ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { cloudinaryUrl, uploadImage } from '@/lib/cloudinary'


// ── Manual Brand Color Editor ────────────────────────────────────────────────
function ManualColorEditor({
  slug,
  initial,
  onSaved,
}: {
  slug: string
  initial: string[]
  onSaved: () => void
}) {
  const [colors, setColors] = useState<string[]>(() => {
    const c = [...initial]
    while (c.length < 3) c.push('#c8b48c')
    return c.slice(0, 3)
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const setColor = (i: number, val: string) =>
    setColors((prev) => prev.map((c, idx) => (idx === i ? val : c)))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await authFetch(`/companies/${slug}/set-brand-colors`, {
        method: 'POST',
        body: JSON.stringify({ colors }),
      })
      onSaved()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const labels = ['Primary', 'Dark', 'Muted']

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-3 flex-wrap">
        {colors.map((c, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="text-[10px] text-stone-500 uppercase tracking-widest">{labels[i]}</span>
            <div className="flex items-center gap-1.5">
              {/* Native color picker */}
              <input
                type="color"
                value={c.startsWith('#') ? c : '#c8b48c'}
                onChange={(e) => setColor(i, e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-stone-600 bg-transparent p-0.5"
              />
              {/* Hex text input */}
              <input
                type="text"
                value={c}
                maxLength={7}
                onChange={(e) => setColor(i, e.target.value)}
                className="w-24 px-2 py-1.5 rounded-lg bg-stone-800 border border-stone-700 text-stone-200 text-xs font-mono focus:outline-none focus:border-amber-500"
                placeholder="#rrggbb"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="mb-0.5 px-3 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Colors'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}



const COUNTRIES = [
  'Australia','Austria','Belgium','Brazil','Canada','China','Croatia','Czech Republic',
  'Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Iceland','India',
  'Ireland','Israel','Italy','Japan','Latvia','Lithuania','Luxembourg','Malta','Mexico',
  'Netherlands','New Zealand','Norway','Poland','Portugal','Romania','Slovakia','Slovenia',
  'South Korea','Spain','Sweden','Switzerland','Turkey','Ukraine','United Kingdom',
  'United States','South Africa',
].sort()

interface CompanyFormData {
  name: string
  description: string
  country: string
  website: string
  logoUrl: string | null
  defaultCurrency: string
  instagram: string
  threads: string
  tiktok: string
  facebook: string
  x: string
  bluesky: string
  iossImplemented: boolean
  hasOfficialImagePermission: boolean
}

const EMPTY_FORM: CompanyFormData = {
  name: '', description: '', country: '', website: '',
  logoUrl: null, defaultCurrency: '',
  instagram: '', threads: '', tiktok: '', facebook: '', x: '', bluesky: '',
  iossImplemented: false,
  hasOfficialImagePermission: false,
}

function companyToForm(c: ApiBookBoxCompany): CompanyFormData {
  return {
    name: c.name,
    description: c.description ?? '',
    country: c.country ?? '',
    website: c.website ?? '',
    logoUrl: c.logoUrl ?? null,
    defaultCurrency: c.defaultCurrency ?? '',
    instagram: c.instagram ?? '',
    threads: c.threads ?? '',
    tiktok: c.tiktok ?? '',
    facebook: c.facebook ?? '',
    x: c.x ?? '',
    bluesky: c.bluesky ?? '',
    iossImplemented: c.iossImplemented ?? false,
    hasOfficialImagePermission: c.hasOfficialImagePermission ?? false,
  }
}

function nullIfEmpty(v: string | null | undefined): string | null | undefined {
  if (v === null) return null       // explicit clear
  if (v === '' || v === undefined) return null  // cleared by user
  return v
}

function formToPayload(form: CompanyFormData) {
  return {
    name: form.name,
    description: nullIfEmpty(form.description),
    country: nullIfEmpty(form.country),
    website: nullIfEmpty(form.website),
    logoUrl: form.logoUrl === null ? null : (form.logoUrl || undefined),
    defaultCurrency: nullIfEmpty(form.defaultCurrency),
    instagram: nullIfEmpty(form.instagram),
    threads: nullIfEmpty(form.threads),
    tiktok: nullIfEmpty(form.tiktok),
    facebook: nullIfEmpty(form.facebook),
    x: nullIfEmpty(form.x),
    bluesky: nullIfEmpty(form.bluesky),
    iossImplemented: form.iossImplemented,
    hasOfficialImagePermission: form.hasOfficialImagePermission,
  }
}

interface CompanyFormProps {
  initial: CompanyFormData
  onSubmit: (data: CompanyFormData) => void
  submitting: boolean
  submitLabel: string
}

function CompanyForm({ initial, onSubmit, submitting, submitLabel }: CompanyFormProps) {
  const [form, setForm] = useState<CompanyFormData>(initial)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    cloudinaryUrl(initial.logoUrl, 'w_120,h_120,c_fill')
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const set = (field: keyof CompanyFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const publicId = await uploadImage(file, 'luxgrimoire/book-boxes')
      setForm((f) => ({ ...f, logoUrl: publicId }))
      setPreviewUrl(cloudinaryUrl(publicId, 'w_120,h_120,c_fill'))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }} className="flex flex-col gap-4">
      {/* Name */}
      <div>
        <label className={LABEL_CLASS}>Name *</label>
        <input required className={INPUT_CLASS} value={form.name} onChange={set('name')} />
      </div>

      {/* Description */}
      <div>
        <label className={LABEL_CLASS}>Description</label>
        <textarea rows={3} className={INPUT_CLASS} value={form.description} onChange={set('description')} />
      </div>

      {/* Country + Currency */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLASS}>Country</label>
          <select className={INPUT_CLASS} value={form.country} onChange={set('country')}>
            <option value="">— Select country —</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>Default Currency</label>
          <input
            className={INPUT_CLASS}
            placeholder="EUR"
            list="currencies-list"
            value={form.defaultCurrency}
            onChange={set('defaultCurrency')}
          />
          <datalist id="currencies-list">
            {CURRENCIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
      </div>

      {/* Website */}
      <div>
        <label className={LABEL_CLASS}>Website</label>
        <input type="url" className={INPUT_CLASS} placeholder="https://..." value={form.website} onChange={set('website')} />
      </div>

      {/* Logo upload */}
      <div>
        <label className={LABEL_CLASS}>Logo</label>
        <div className="flex items-center gap-4">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Logo preview" className="w-16 h-16 rounded-lg object-cover border border-stone-700" />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 rounded-lg border border-stone-700 text-stone-300 hover:border-amber-500 hover:text-amber-400 text-sm transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : previewUrl ? 'Change image' : 'Upload image'}
              </button>
              {previewUrl && (
                <button
                  type="button"
                  onClick={() => { setForm((f) => ({ ...f, logoUrl: null })); setPreviewUrl(null) }}
                  className="px-3 py-2 rounded-lg border border-red-800 text-red-400 hover:border-red-500 hover:text-red-300 text-sm transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            {form.logoUrl && <p className="text-xs text-stone-500 mt-1 truncate">{form.logoUrl}</p>}
            {uploadError && <p className="text-xs text-red-400 mt-1">{uploadError}</p>}
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>

      {/* Social media */}
      <div>
        <p className="text-sm text-stone-400 font-semibold mb-2">Social Media</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { field: 'instagram', placeholder: 'https://instagram.com/...' },
            { field: 'threads',   placeholder: 'https://threads.net/...' },
            { field: 'tiktok',    placeholder: 'https://tiktok.com/...' },
            { field: 'facebook',  placeholder: 'https://facebook.com/...' },
            { field: 'x',        placeholder: 'https://x.com/...' },
            { field: 'bluesky',   placeholder: 'https://bsky.app/...' },
          ] as { field: keyof CompanyFormData; placeholder: string }[]).map(({ field, placeholder }) => (
            <div key={field}>
              <label className={LABEL_CLASS}>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
              <input className={INPUT_CLASS} placeholder={placeholder} value={form[field] as string} onChange={set(field)} />
            </div>
          ))}
        </div>
      </div>

      {/* IOSS */}
      <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.iossImplemented}
          onChange={(e) => setForm((f) => ({ ...f, iossImplemented: e.target.checked }))}
          className="accent-amber-400 w-4 h-4"
        />
        IOSS Implemented
      </label>

      {/* Official image permission */}
      <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.hasOfficialImagePermission}
          onChange={(e) => setForm((f) => ({ ...f, hasOfficialImagePermission: e.target.checked }))}
          className="accent-amber-400 w-4 h-4"
        />
        Permission to use brand images
      </label>

      <button
        type="submit"
        disabled={submitting || uploading}
        className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

export default function AdminCompaniesPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isManager = user?.role === 'COMPANY_MANAGER'
  const createModal = useModalState()
  const [editCompany, setEditCompany] = useState<ApiBookBoxCompany | null>(null)
  const [deleteCompany, setDeleteCompany] = useState<ApiBookBoxCompany | null>(null)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () => authFetch<PaginatedResponse<ApiBookBoxCompany> | ApiBookBoxCompany[]>('/companies?page=1&pageSize=50'),
  })

  const allCompanies = data ? (Array.isArray(data) ? data : data.data) : []
  const managedCompanies = isManager && user?.managedCompanyId
    ? allCompanies.filter((c) => c.id === user.managedCompanyId)
    : allCompanies

  const q = search.trim().toLowerCase()
  const companies = q
    ? managedCompanies.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.country ?? '').toLowerCase().includes(q),
      )
    : managedCompanies

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      authFetch('/companies', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] }); createModal.close() },
  })

  const editMutation = useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: ReturnType<typeof formToPayload> }) =>
      authFetch(`/companies/${slug}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] }); setEditCompany(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/companies/${slug}`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] }); setDeleteCompany(null) },
  })

  const columns = [
    {
      key: 'logo', label: '', render: (row: ApiBookBoxCompany) =>
        row.logoUrl
          ? <img src={cloudinaryUrl(row.logoUrl, 'w_40,h_40,c_fill') ?? ''} alt="" className="w-9 h-9 rounded object-cover" />
          : <div className="w-9 h-9 rounded bg-stone-800 flex items-center justify-center text-stone-500 text-sm font-serif">{row.name.charAt(0)}</div>,
    },
    { key: 'name', label: 'Name', render: (row: ApiBookBoxCompany) => <span className="font-semibold text-stone-200">{row.name}</span> },
    { key: 'country', label: 'Country', render: (row: ApiBookBoxCompany) => row.country ?? '—' },
    {
      key: 'website', label: 'Website', render: (row: ApiBookBoxCompany) =>
        row.website
          ? <a href={row.website} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline text-xs">{row.website.replace(/^https?:\/\//, '')}</a>
          : '—',
    },
    {
      key: 'social', label: 'Social', render: (row: ApiBookBoxCompany) => {
        const links = [row.instagram, row.tiktok, row.x, row.bluesky, row.threads, row.facebook].filter(Boolean)
        return <span className="text-stone-500 text-xs">{links.length ? `${links.length} link${links.length > 1 ? 's' : ''}` : '—'}</span>
      },
    },
    {
      key: 'brandColors', label: 'Colors', render: (row: ApiBookBoxCompany) => {
        const colors = row.brandColors ?? []
        if (!colors.length) return <span className="text-stone-600 text-xs">—</span>
        return (
          <div className="flex gap-1 items-center">
            {colors.map((c, i) => (
              <div key={i} title={c} className="w-4 h-4 rounded-full border border-stone-700 flex-shrink-0" style={{ backgroundColor: c }} />
            ))}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-stone-100">Book Boxes</h1>
        <div className="flex items-center gap-3 flex-1 max-w-sm">
          <input
            type="search"
            placeholder="Search by name or country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-400 text-sm"
          />
        </div>
        {!isManager && !createModal.isOpen && !editCompany && (
          <button
            onClick={() => createModal.open()}
            className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
          >
            + Add Book Box
          </button>
        )}
      </div>

      {/* Inline Create form */}
      {createModal.isOpen && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-100">Add Book Box</h2>
            <button onClick={() => createModal.close()} className="text-stone-400 hover:text-stone-200 text-sm transition-colors">✕ Cancel</button>
          </div>
          <CompanyForm
            initial={EMPTY_FORM}
            submitLabel="Create Book Box"
            submitting={createMutation.isPending}
            onSubmit={(form) => createMutation.mutate(formToPayload(form))}
          />
        </div>
      )}

      {/* Inline Edit form */}
      {editCompany && (
        <div className="bg-stone-900 border border-amber-500/30 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-100">Edit — {editCompany.name}</h2>
            <button onClick={() => setEditCompany(null)} className="text-stone-400 hover:text-stone-200 text-sm transition-colors">✕ Cancel</button>
          </div>

          {/* Brand colors */}
          <div className="py-2 border-b border-stone-800 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Brand Colors</p>

            {/* Color picker row */}
            <ManualColorEditor
              slug={editCompany.slug}
              initial={editCompany.brandColors ?? []}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] })}
            />
          </div>

          <CompanyForm
            key={editCompany.id}
            initial={companyToForm(editCompany)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={(form) => editMutation.mutate({ slug: editCompany.slug, payload: formToPayload(form) })}
          />
        </div>
      )}

      {/* Company table */}
      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : companies.length === 0 && q ? (
        <div className="text-stone-500 py-8 text-center">No companies match "{search}".</div>
      ) : (
        <DataTable
          columns={columns}
          data={companies}
          onEdit={(row) => { setEditCompany(row); createModal.close(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onDelete={isManager ? undefined : (row) => setDeleteCompany(row)}
        />
      )}

      <ConfirmDialog
        open={deleteCompany !== null}
        message={`Delete "${deleteCompany?.name}"? This cannot be undone.`}
        onConfirm={() => deleteCompany && deleteMutation.mutate(deleteCompany.slug)}
        onCancel={() => setDeleteCompany(null)}
      />
    </div>
  )
}

