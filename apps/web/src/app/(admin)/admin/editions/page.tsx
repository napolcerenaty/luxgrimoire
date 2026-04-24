'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import type { ApiBookEdition, ApiBookBoxCompany, ApiBookBoxCollection, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

import ImageUpload from '@/components/admin/ImageUpload'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'

interface EditionFormData {
  bookId: string
  bookBoxCompanyId: string
  collectionId: string
  publisher: string
  publishYear: string
  coverImage: string
  pageCount: string
  isbn: string
  language: string
}

interface EditionFormProps {
  initial: EditionFormData
  onSubmit: (data: EditionFormData) => void
  submitting: boolean
  submitLabel: string
  lockCompany?: boolean
}

function editionToForm(edition: ApiBookEdition): EditionFormData {
  return {
    bookId: edition.bookId,
    bookBoxCompanyId: (edition as ApiBookEdition & { bookBoxCompanyId?: string }).bookBoxCompanyId ?? '',
    collectionId: edition.collectionId ?? '',
    publisher: edition.publisher ?? '',
    publishYear: edition.publishYear != null ? String(edition.publishYear) : '',
    coverImage: edition.coverImage ?? '',
    pageCount: '',
    isbn: '',
    language: '',
  }
}

function formToPayload(form: EditionFormData) {
  return {
    bookId: form.bookId,
    bookBoxCompanyId: form.bookBoxCompanyId || undefined,
    collectionId: form.collectionId || undefined,
    publisher: form.publisher || undefined,
    publishYear: form.publishYear ? Number(form.publishYear) : undefined,
    coverImage: form.coverImage || undefined,
    pageCount: form.pageCount ? Number(form.pageCount) : undefined,
    isbn: form.isbn || undefined,
    language: form.language || undefined,
  }
}

function EditionForm({ initial, onSubmit, submitting, submitLabel, lockCompany }: EditionFormProps) {
  const [form, setForm] = useState<EditionFormData>(initial)

  useEffect(() => { setForm(initial) }, [initial])

  const set = (field: keyof EditionFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [field]: e.target.value }))

  // Fetch collections when company is selected
  const { data: collectionsData } = useQuery({
    queryKey: ['edition-form-collections', form.bookBoxCompanyId],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiBookBoxCollection>>(
        `/book-box-collections?companyId=${form.bookBoxCompanyId}&pageSize=100`,
      ),
    enabled: !!form.bookBoxCompanyId,
  })
  const collections = collectionsData?.data ?? []

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
      <div>
        <label className={LABEL_CLASS}>Book Box Company ID</label>
        <input
          className={INPUT_CLASS + (lockCompany ? ' opacity-60 cursor-not-allowed' : '')}
          value={form.bookBoxCompanyId}
          onChange={set('bookBoxCompanyId')}
          readOnly={lockCompany}
          placeholder={lockCompany ? 'Auto-set to your company' : 'Optional'}
        />
      </div>
      {form.bookBoxCompanyId && (
        <div>
          <label className={LABEL_CLASS}>Collection (optional)</label>
          <select className={INPUT_CLASS} value={form.collectionId} onChange={set('collectionId')}>
            <option value="">— None (standalone exclusive) —</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
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
      <ImageUpload
          label="Cover Image"
          folder="luxgrimoire/editions"
          value={form.coverImage}
          onChange={(id) => setForm((f) => ({ ...f, coverImage: id }))}
          aspectRatio="2/3"
        />
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
  const { user } = useAuth()
  const isManager = user?.role === 'COMPANY_MANAGER'
  const managedCompanyId = (user as (typeof user & { managedCompanyId?: string }) | null)?.managedCompanyId ?? ''

  const [createOpen, setCreateOpen] = useState(false)
  const [editEdition, setEditEdition] = useState<ApiBookEdition | null>(null)
  const [deleteEdition, setDeleteEdition] = useState<ApiBookEdition | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [unverifiedOnly, setUnverifiedOnly] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const buildParams = () => {
    const p = new URLSearchParams({ page: '1', pageSize: '50' })
    if (debouncedSearch) p.set('search', debouncedSearch)
    if (unverifiedOnly) p.set('needsVerification', 'true')
    if (isManager && managedCompanyId) {
      p.set('companyId', managedCompanyId)
    } else if (companyFilter) {
      p.set('companyId', companyFilter)
    }
    return p.toString()
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'editions', debouncedSearch, companyFilter, managedCompanyId, unverifiedOnly],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiBookEdition>>(
        `/editions?${buildParams()}`,
      ),
  })

  const editions = data?.data ?? []

  // Companies for filter dropdown (admins/moderators only)
  const { data: companiesData } = useQuery({
    queryKey: ['admin', 'companies-list'],
    queryFn: () => authFetch<PaginatedResponse<ApiBookBoxCompany> | ApiBookBoxCompany[]>('/companies?pageSize=100'),
    enabled: !isManager,
  })
  const companies = companiesData
    ? Array.isArray(companiesData) ? companiesData : companiesData.data
    : []

  const emptyForm: EditionFormData = {
    bookId: '',
    bookBoxCompanyId: managedCompanyId,
    collectionId: '',
    publisher: '',
    publishYear: '',
    coverImage: '',
    pageCount: '',
    isbn: '',
    language: '',
  }

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
      setDeleteError(null)
    },
    onError: (err: Error) => {
      setDeleteError(err.message ?? 'Cannot delete this edition')
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/editions/${slug}/verify`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'editions'] }),
  })

  const canVerify = user?.role === 'ADMIN' || user?.role === 'MODERATOR'

  const columns = [
    {
      key: 'book',
      label: 'Book',
      render: (row: ApiBookEdition) => (
        <div>
          <div className="text-stone-100 font-medium">{row.book?.title ?? '—'}</div>
          {row.book?.seriesName && (
            <div className="text-stone-500 text-xs">
              {row.book.seriesName}{row.book.volumeNumber != null ? ` #${row.book.volumeNumber}` : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'authors',
      label: 'Author(s)',
      render: (row: ApiBookEdition) => {
        const authors = row.book?.authors
        if (!authors?.length) return <span className="text-stone-500">—</span>
        return <span className="text-stone-300 text-sm">{authors.map((a) => a.name).join(', ')}</span>
      },
    },
    {
      key: 'publisher',
      label: 'Publisher / Edition',
      render: (row: ApiBookEdition) => (
        <div>
          <div className="text-stone-300 text-sm">{row.publisher ?? '—'}</div>
          {row.publishYear && <div className="text-stone-500 text-xs">{row.publishYear}</div>}
        </div>
      ),
    },
    {
      key: 'company',
      label: 'Book Box',
      render: (row: ApiBookEdition) => row.bookBoxCompany?.name
        ? <span className="text-amber-400 text-sm">{row.bookBoxCompany.name}</span>
        : <span className="text-stone-500">—</span>,
    },
    {
      key: 'verified',
      label: 'Status',
      render: (row: ApiBookEdition) => row.verifiedAt ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">✓ Verified</span>
      ) : (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">⚠ Unverified</span>
          {canVerify && (
            <button
              onClick={(e) => { e.stopPropagation(); verifyMutation.mutate(row.slug) }}
              disabled={verifyMutation.isPending}
              className="text-xs px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-400 hover:bg-emerald-800/60 border border-emerald-700/40 transition-colors disabled:opacity-50"
            >
              Verify
            </button>
          )}
        </div>
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

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="search"
          placeholder="Search by book, author, publisher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 w-72"
        />
        {!isManager && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-300 focus:outline-none focus:border-amber-400"
          >
            <option value="">All Book Boxes</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {(search || companyFilter || unverifiedOnly) && (
          <button
            onClick={() => { setSearch(''); setCompanyFilter(''); setUnverifiedOnly(false) }}
            className="text-stone-400 hover:text-stone-200 text-sm px-3 py-2"
          >
            Clear
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-stone-400 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={unverifiedOnly}
            onChange={(e) => setUnverifiedOnly(e.target.checked)}
            className="accent-amber-400"
          />
          Unverified only
        </label>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : editions.length === 0 ? (
        <div className="text-stone-500 py-8 text-center">No editions found{search || companyFilter ? ' matching your filters' : ''}.</div>
      ) : (
        <DataTable
          columns={columns}
          data={editions}
          onEdit={(row) => setEditEdition(row)}
          onDelete={(row) => { setDeleteError(null); setDeleteEdition(row); }}
        />
      )}

      <FormModal open={createOpen} title="Add Edition" onClose={() => setCreateOpen(false)}>
        <EditionForm
          initial={emptyForm}
          submitLabel="Create Edition"
          submitting={createMutation.isPending}
          onSubmit={(form) => createMutation.mutate(formToPayload(form))}
          lockCompany={isManager}
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
            lockCompany={isManager}
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteEdition !== null}
        message={deleteError ?? `Delete edition "${deleteEdition?.publisher ?? deleteEdition?.slug}"?${isManager ? ' You can only delete editions not in any user\'s collection.' : ' This cannot be undone.'}`}
        onConfirm={() => !deleteError && deleteEdition && deleteMutation.mutate(deleteEdition.slug)}
        onCancel={() => { setDeleteEdition(null); setDeleteError(null); }}
      />
    </div>
  )
}
