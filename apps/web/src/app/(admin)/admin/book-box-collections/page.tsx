'use client'

import { useState, useEffect } from 'react'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiBookBoxCollection, ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { Pagination } from '@/components/admin/Pagination'

const INPUT_CLASS =
  'w-full bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 focus:outline-none focus:border-brand-400'
const LABEL_CLASS = 'block text-sm text-navy-400 mb-1'

interface CollectionForm {
  companyId: string
  name: string
  isActive: boolean
}

const emptyForm: CollectionForm = {
  companyId: '',
  name: '',
  isActive: true,
}

function collectionToForm(c: ApiBookBoxCollection): CollectionForm {
  return {
    companyId: c.companyId,
    name: c.name,
    isActive: c.isActive,
  }
}

function formToPayload(form: CollectionForm, isNew: boolean) {
  return {
    ...(isNew ? { companyId: form.companyId } : {}),
    name: form.name || undefined,
    isActive: form.isActive,
  }
}

interface FormProps {
  initial: CollectionForm
  onSubmit: (form: CollectionForm) => void
  submitting: boolean
  submitLabel: string
  companies: ApiBookBoxCompany[]
  isNew: boolean
}

function CollectionForm({ initial, onSubmit, submitting, submitLabel, companies, isNew }: FormProps) {
  const [form, setForm] = useState<CollectionForm>(initial)
  useEffect(() => setForm(initial), [initial])
  const set = (field: keyof CollectionForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }} className="flex flex-col gap-4">
      {isNew && (
        <div>
          <label className={LABEL_CLASS}>Company *</label>
          <select className={INPUT_CLASS} value={form.companyId} onChange={set('companyId')} required>
            <option value="">Select company…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className={LABEL_CLASS}>Collection Name *</label>
        <input className={INPUT_CLASS} value={form.name} onChange={set('name')} required placeholder="e.g. Iron Editions" />
      </div>
      <label className="flex items-center gap-2 text-sm text-navy-300 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          className="accent-brand-400"
        />
        Active (visible on public pages)
      </label>
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

export default function AdminBookBoxCollectionsPage() {
  const queryClient = useQueryClient()
  const createModal = useModalState()
  const [editItem, setEditItem] = useState<ApiBookBoxCollection | null>(null)
  const [deleteItem, setDeleteItem] = useState<ApiBookBoxCollection | null>(null)
  const [companyFilter, setCompanyFilter] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15

  const { data: companiesData } = useQuery({
    queryKey: ['admin', 'companies-all'],
    queryFn: () => authFetch<PaginatedResponse<ApiBookBoxCompany>>('/companies?pageSize=100'),
  })
  const companies: ApiBookBoxCompany[] = companiesData?.data ?? []

  const buildParams = () => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (companyFilter) p.set('companyId', companyFilter)
    return p.toString()
  }

  useEffect(() => { setPage(1) }, [companyFilter])

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'book-box-collections', page, companyFilter],
    queryFn: () => authFetch<PaginatedResponse<ApiBookBoxCollection>>(`/book-box-collections?${buildParams()}`),
    placeholderData: keepPreviousData,
  })
  const collections = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      authFetch('/book-box-collections', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'book-box-collections'] }); createModal.close() },
  })

  const editMutation = useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: ReturnType<typeof formToPayload> }) =>
      authFetch(`/book-box-collections/${slug}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'book-box-collections'] }); setEditItem(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/book-box-collections/${slug}`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'book-box-collections'] }); setDeleteItem(null) },
  })

  const columns = [
    {
      key: 'name',
      label: 'Collection',
      render: (row: ApiBookBoxCollection) => (
        <div>
          <div className="text-navy-100 font-medium">{row.name}</div>
        </div>
      ),
    },
    {
      key: 'company',
      label: 'Company',
      render: (row: ApiBookBoxCollection) => (
        <span className="text-brand-400 text-sm">{row.company?.name ?? '—'}</span>
      ),
    },
    {
      key: 'editions',
      label: 'Editions',
      render: (row: ApiBookBoxCollection) => (
        <span className="text-navy-400 text-sm">{row._count?.editions ?? 0}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row: ApiBookBoxCollection) => row.isActive
        ? <span className="text-xs text-emerald-400">Active</span>
        : <span className="text-xs text-navy-500">Inactive</span>,
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-100">Book Box Collections</h1>
        <button
          onClick={() => createModal.open()}
          className="bg-brand-400 text-navy-950 font-semibold px-4 py-2 rounded-lg hover:bg-brand-300 transition-colors"
        >
          Add Collection
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-300 focus:outline-none focus:border-brand-400"
        >
          <option value="">All Companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {companyFilter && (
          <button onClick={() => setCompanyFilter('')} className="text-navy-400 hover:text-navy-200 text-sm px-3 py-2">
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-navy-400 py-8 text-center">Loading…</div>
      ) : collections.length === 0 ? (
        <div className="text-navy-500 py-8 text-center">No collections found.</div>
      ) : (
        <>
          <DataTable columns={columns} data={collections} onEdit={(row) => setEditItem(row)} onDelete={(row) => setDeleteItem(row)} />
          <Pagination page={page} totalPages={data?.totalPages ?? 1} onPageChange={setPage} total={data?.total} />
        </>
      )}

      <FormModal open={createModal.isOpen} title="Add Collection" onClose={() => createModal.close()}>
        <CollectionForm
          initial={emptyForm}
          submitLabel="Create Collection"
          submitting={createMutation.isPending}
          companies={companies}
          isNew
          onSubmit={(form) => createMutation.mutate(formToPayload(form, true))}
        />
      </FormModal>

      <FormModal open={editItem !== null} title="Edit Collection" onClose={() => setEditItem(null)}>
        {editItem && (
          <CollectionForm
            initial={collectionToForm(editItem)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            companies={companies}
            isNew={false}
            onSubmit={(form) => editMutation.mutate({ slug: editItem.slug, payload: formToPayload(form, false) })}
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteItem !== null}
        message={`Delete collection "${deleteItem?.name}"? This will unlink all editions from this collection.`}
        onConfirm={() => deleteItem && deleteMutation.mutate(deleteItem.slug)}
        onCancel={() => setDeleteItem(null)}
      />
    </div>
  )
}
