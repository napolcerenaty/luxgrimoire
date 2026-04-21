'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { authFetch } from '@/lib/authFetch'
import type { ApiSubscription, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'

interface SubFormData {
  companyId: string
  name: string
  description: string
  genre: string
  coverImage: string
  isDiscontinued: boolean
  endDate: string
}

const EMPTY_FORM: SubFormData = {
  companyId: '',
  name: '',
  description: '',
  genre: '',
  coverImage: '',
  isDiscontinued: false,
  endDate: '',
}

function subToForm(sub: ApiSubscription): SubFormData {
  return {
    companyId: sub.companyId,
    name: sub.name,
    description: sub.description ?? '',
    genre: sub.genre ?? '',
    coverImage: sub.coverImage ?? '',
    isDiscontinued: sub.isDiscontinued,
    endDate: sub.endDate ?? '',
  }
}

function formToPayload(form: SubFormData) {
  return {
    companyId: form.companyId,
    name: form.name,
    description: form.description || undefined,
    genre: form.genre || undefined,
    coverImage: form.coverImage || undefined,
    isDiscontinued: form.isDiscontinued,
    endDate: form.endDate || undefined,
  }
}

interface SubFormProps {
  initial: SubFormData
  onSubmit: (data: SubFormData) => void
  submitting: boolean
  submitLabel: string
}

function SubscriptionForm({ initial, onSubmit, submitting, submitLabel }: SubFormProps) {
  const [form, setForm] = useState<SubFormData>(initial)

  const set = (field: keyof SubFormData) => (
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
        <label className={LABEL_CLASS}>Company ID *</label>
        <input required className={INPUT_CLASS} value={form.companyId} onChange={set('companyId')} />
      </div>
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
          <label className={LABEL_CLASS}>Genre</label>
          <input className={INPUT_CLASS} value={form.genre} onChange={set('genre')} />
        </div>
        <div>
          <label className={LABEL_CLASS}>End Date</label>
          <input
            type="date"
            className={INPUT_CLASS}
            value={form.endDate}
            onChange={set('endDate')}
          />
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Cover Image (Cloudinary publicId)</label>
        <input className={INPUT_CLASS} value={form.coverImage} onChange={set('coverImage')} />
      </div>
      <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.isDiscontinued}
          onChange={(e) => setForm((f) => ({ ...f, isDiscontinued: e.target.checked }))}
          className="accent-amber-400 w-4 h-4"
        />
        Discontinued
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

export default function AdminSubscriptionsPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editSub, setEditSub] = useState<ApiSubscription | null>(null)
  const [deleteSub, setDeleteSub] = useState<ApiSubscription | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiSubscription>>('/subscriptions?page=1&pageSize=20'),
  })

  const subs = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      authFetch('/subscriptions', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
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
    }) =>
      authFetch(`/subscriptions/${slug}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      setEditSub(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/subscriptions/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      setDeleteSub(null)
    },
  })

  const columns = [
    { key: 'name', label: 'Name', render: (row: ApiSubscription) => row.name },
    {
      key: 'company',
      label: 'Company',
      render: (row: ApiSubscription) => row.company?.name ?? row.companyId,
    },
    {
      key: 'genre',
      label: 'Genre',
      render: (row: ApiSubscription) => row.genre ?? '—',
    },
    {
      key: 'status',
      label: 'Status',
      render: (row: ApiSubscription) =>
        row.isDiscontinued ? (
          <span className="text-red-400 text-xs font-medium">Discontinued</span>
        ) : (
          <span className="text-emerald-400 text-xs font-medium">Active</span>
        ),
    },
    {
      key: 'months',
      label: 'Months',
      render: (row: ApiSubscription) => row.months?.length ?? '—',
    },
    {
      key: 'manage',
      label: 'Manage',
      render: (row: ApiSubscription) => (
        <Link
          href={`/admin/subscriptions/${row.slug}/months`}
          className="text-amber-400 text-xs hover:underline"
        >
          View Months →
        </Link>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Subscriptions</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Subscription
        </button>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          data={subs}
          onEdit={(row) => setEditSub(row)}
          onDelete={(row) => setDeleteSub(row)}
        />
      )}

      <FormModal
        open={createOpen}
        title="Add Subscription"
        onClose={() => setCreateOpen(false)}
      >
        <SubscriptionForm
          initial={EMPTY_FORM}
          submitLabel="Create Subscription"
          submitting={createMutation.isPending}
          onSubmit={(form) => createMutation.mutate(formToPayload(form))}
        />
      </FormModal>

      <FormModal
        open={editSub !== null}
        title="Edit Subscription"
        onClose={() => setEditSub(null)}
      >
        {editSub && (
          <SubscriptionForm
            initial={subToForm(editSub)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={(form) =>
              editMutation.mutate({ slug: editSub.slug, payload: formToPayload(form) })
            }
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteSub !== null}
        message={`Delete subscription "${deleteSub?.name}"? This cannot be undone.`}
        onConfirm={() => deleteSub && deleteMutation.mutate(deleteSub.slug)}
        onCancel={() => setDeleteSub(null)}
      />
    </div>
  )
}
