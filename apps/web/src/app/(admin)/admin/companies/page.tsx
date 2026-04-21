'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'

interface CompanyFormData {
  name: string
  description: string
  country: string
  website: string
  logoUrl: string
  iossImplemented: boolean
}

const EMPTY_FORM: CompanyFormData = {
  name: '',
  description: '',
  country: '',
  website: '',
  logoUrl: '',
  iossImplemented: false,
}

function companyToForm(company: ApiBookBoxCompany): CompanyFormData {
  return {
    name: company.name,
    description: company.description ?? '',
    country: company.country ?? '',
    website: company.website ?? '',
    logoUrl: company.logoUrl ?? '',
    iossImplemented: false,
  }
}

function formToPayload(form: CompanyFormData) {
  return {
    name: form.name,
    description: form.description || undefined,
    country: form.country || undefined,
    website: form.website || undefined,
    logoUrl: form.logoUrl || undefined,
    iossImplemented: form.iossImplemented,
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

  const set = (field: keyof CompanyFormData) => (
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
          <label className={LABEL_CLASS}>Country</label>
          <input className={INPUT_CLASS} value={form.country} onChange={set('country')} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Website</label>
          <input className={INPUT_CLASS} value={form.website} onChange={set('website')} />
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Logo Image (Cloudinary publicId)</label>
        <input className={INPUT_CLASS} value={form.logoUrl} onChange={set('logoUrl')} />
      </div>
      <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.iossImplemented}
          onChange={(e) => setForm((f) => ({ ...f, iossImplemented: e.target.checked }))}
          className="accent-amber-400 w-4 h-4"
        />
        IOSS Implemented
      </label>
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

export default function AdminCompaniesPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editCompany, setEditCompany] = useState<ApiBookBoxCompany | null>(null)
  const [deleteCompany, setDeleteCompany] = useState<ApiBookBoxCompany | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiBookBoxCompany> | ApiBookBoxCompany[]>(
        '/companies?page=1&pageSize=20',
      ),
  })

  const companies = data
    ? Array.isArray(data)
      ? data
      : data.data
    : []

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      authFetch('/companies', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] })
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
    }) => authFetch(`/companies/${slug}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] })
      setEditCompany(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/companies/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] })
      setDeleteCompany(null)
    },
  })

  const columns = [
    { key: 'name', label: 'Name', render: (row: ApiBookBoxCompany) => row.name },
    {
      key: 'country',
      label: 'Country',
      render: (row: ApiBookBoxCompany) => row.country ?? '—',
    },
    {
      key: 'website',
      label: 'Website',
      render: (row: ApiBookBoxCompany) => {
        if (!row.website) return '—'
        const truncated =
          row.website.length > 30 ? `${row.website.slice(0, 30)}…` : row.website
        return (
          <a
            href={row.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:underline"
          >
            {truncated}
          </a>
        )
      },
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Companies</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Company
        </button>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          data={companies}
          onEdit={(row) => setEditCompany(row)}
          onDelete={(row) => setDeleteCompany(row)}
        />
      )}

      <FormModal open={createOpen} title="Add Company" onClose={() => setCreateOpen(false)}>
        <CompanyForm
          initial={EMPTY_FORM}
          submitLabel="Create Company"
          submitting={createMutation.isPending}
          onSubmit={(form) => createMutation.mutate(formToPayload(form))}
        />
      </FormModal>

      <FormModal
        open={editCompany !== null}
        title="Edit Company"
        onClose={() => setEditCompany(null)}
      >
        {editCompany && (
          <CompanyForm
            initial={companyToForm(editCompany)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={(form) =>
              editMutation.mutate({ slug: editCompany.slug, payload: formToPayload(form) })
            }
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteCompany !== null}
        message={`Delete company "${deleteCompany?.name}"? This cannot be undone.`}
        onConfirm={() => deleteCompany && deleteMutation.mutate(deleteCompany.slug)}
        onCancel={() => setDeleteCompany(null)}
      />
    </div>
  )
}
