'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'
import {
  adminGetSaleAnnouncements,
  adminCreateSaleAnnouncement,
  adminUpdateSaleAnnouncement,
  adminDeleteSaleAnnouncement,
  type SaleAnnouncementFormData,
} from '@/lib/api'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-sm text-stone-400 mb-1'

interface FormState {
  title: string
  companyId: string
  description: string
  generalSaleDate: string
  firstAccessDate: string
  earlyAccessDate: string
  saleTimezone: string
  basePrice: string
  currency: string
  imageUrl: string
  isPublished: boolean
  isBundle: boolean
  availableForPurchase: boolean
  editionIds: string
}

const EMPTY_FORM: FormState = {
  title: '',
  companyId: '',
  description: '',
  generalSaleDate: '',
  firstAccessDate: '',
  earlyAccessDate: '',
  saleTimezone: '',
  basePrice: '',
  currency: 'USD',
  imageUrl: '',
  isPublished: false,
  isBundle: false,
  availableForPurchase: false,
  editionIds: '',
}

function announcementToForm(a: ApiSaleAnnouncement): FormState {
  return {
    title: a.title,
    companyId: a.companyId ?? '',
    description: a.description ?? '',
    generalSaleDate: a.generalSaleDate ? a.generalSaleDate.slice(0, 10) : '',
    firstAccessDate: a.firstAccessDate ? a.firstAccessDate.slice(0, 10) : '',
    earlyAccessDate: a.earlyAccessDate ? a.earlyAccessDate.slice(0, 10) : '',
    saleTimezone: a.saleTimezone ?? '',
    basePrice: a.basePrice != null ? String(a.basePrice) : '',
    currency: a.currency ?? 'USD',
    imageUrl: a.imageUrl ?? '',
    isPublished: a.isPublished,
    isBundle: a.isBundle,
    availableForPurchase: a.availableForPurchase,
    editionIds: (a.editions ?? []).map(e => e.editionId).join(', '),
  }
}

function formToData(f: FormState): SaleAnnouncementFormData {
  const editionIds = f.editionIds
    ? f.editionIds.split(',').map(s => s.trim()).filter(Boolean)
    : []
  return {
    title: f.title,
    companyId: f.companyId || undefined,
    description: f.description || undefined,
    generalSaleDate: f.generalSaleDate || undefined,
    firstAccessDate: f.firstAccessDate || undefined,
    earlyAccessDate: f.earlyAccessDate || undefined,
    saleTimezone: f.saleTimezone || undefined,
    basePrice: f.basePrice ? Number(f.basePrice) : undefined,
    currency: f.currency || undefined,
    imageUrl: f.imageUrl || undefined,
    isPublished: f.isPublished,
    isBundle: f.isBundle,
    availableForPurchase: f.availableForPurchase,
    editionIds: editionIds.length > 0 ? editionIds : undefined,
  }
}

function SaleAnnouncementForm({ initial, onSubmit, submitting, submitLabel }: {
  initial: FormState
  onSubmit: (data: FormState) => void
  submitting: boolean
  submitLabel: string
}) {
  const [form, setForm] = useState<FormState>(initial)
  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))
  const setCheck = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.checked }))

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="flex flex-col gap-4">
      <div>
        <label className={LBL}>Title *</label>
        <input required className={INP} value={form.title} onChange={set('title')} />
      </div>

      <div>
        <label className={LBL}>Description</label>
        <textarea rows={3} className={INP} value={form.description} onChange={set('description')} />
      </div>

      <div>
        <label className={LBL}>Company ID</label>
        <input className={INP} value={form.companyId} onChange={set('companyId')} placeholder="UUID of company" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>General Sale Date</label>
          <input type="date" className={INP} value={form.generalSaleDate} onChange={set('generalSaleDate')} />
        </div>
        <div>
          <label className={LBL}>First Access Date</label>
          <input type="date" className={INP} value={form.firstAccessDate} onChange={set('firstAccessDate')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Early Access Date</label>
          <input type="date" className={INP} value={form.earlyAccessDate} onChange={set('earlyAccessDate')} />
        </div>
        <div>
          <label className={LBL}>Timezone</label>
          <input className={INP} value={form.saleTimezone} onChange={set('saleTimezone')} placeholder="e.g. America/New_York" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Base Price</label>
          <input type="number" step="0.01" min="0" className={INP} value={form.basePrice} onChange={set('basePrice')} />
        </div>
        <div>
          <label className={LBL}>Currency</label>
          <input className={INP} value={form.currency} onChange={set('currency')} placeholder="USD" />
        </div>
      </div>

      <div>
        <label className={LBL}>Image URL</label>
        <input className={INP} value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://..." />
      </div>

      <div>
        <label className={LBL}>Edition IDs (comma-separated)</label>
        <input className={INP} value={form.editionIds} onChange={set('editionIds')} placeholder="uuid1, uuid2, ..." />
        <p className="text-xs text-stone-500 mt-1">Comma-separated edition UUIDs to associate with this sale</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
          <input type="checkbox" checked={form.isPublished} onChange={setCheck('isPublished')} className="accent-amber-400" />
          Published
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
          <input type="checkbox" checked={form.isBundle} onChange={setCheck('isBundle')} className="accent-amber-400" />
          Is Bundle
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
          <input type="checkbox" checked={form.availableForPurchase} onChange={setCheck('availableForPurchase')} className="accent-amber-400" />
          Available for Purchase
        </label>
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

export default function AdminSaleAnnouncementsPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editItem, setEditItem] = useState<ApiSaleAnnouncement | null>(null)
  const [deleteItem, setDeleteItem] = useState<ApiSaleAnnouncement | null>(null)

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['admin', 'sale-announcements'],
    queryFn: adminGetSaleAnnouncements,
  })

  const createMutation = useMutation({
    mutationFn: (form: FormState) => adminCreateSaleAnnouncement(formToData(form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] })
      setCreateOpen(false)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: FormState }) =>
      adminUpdateSaleAnnouncement(id, formToData(form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] })
      setEditItem(null)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminDeleteSaleAnnouncement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] })
      setDeleteItem(null)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const columns = [
    { key: 'title', label: 'Title', render: (row: ApiSaleAnnouncement) => row.title },
    {
      key: 'company', label: 'Company',
      render: (row: ApiSaleAnnouncement) => row.companyId ?? '—',
    },
    {
      key: 'generalSaleDate', label: 'Sale Date',
      render: (row: ApiSaleAnnouncement) =>
        row.generalSaleDate ? new Date(row.generalSaleDate).toLocaleDateString() : '—',
    },
    {
      key: 'isPublished', label: 'Published',
      render: (row: ApiSaleAnnouncement) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.isPublished ? 'bg-green-900/40 text-green-400' : 'bg-stone-700 text-stone-400'}`}>
          {row.isPublished ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'isBundle', label: 'Bundle',
      render: (row: ApiSaleAnnouncement) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.isBundle ? 'bg-amber-900/40 text-amber-400' : 'bg-stone-700 text-stone-400'}`}>
          {row.isBundle ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'availableForPurchase', label: 'For Purchase',
      render: (row: ApiSaleAnnouncement) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.availableForPurchase ? 'bg-blue-900/40 text-blue-400' : 'bg-stone-700 text-stone-400'}`}>
          {row.availableForPurchase ? 'Yes' : 'No'}
        </span>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Sale Announcements</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Sale
        </button>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          data={announcements}
          onEdit={row => setEditItem(row)}
          onDelete={row => setDeleteItem(row)}
        />
      )}

      <FormModal open={createOpen} title="Add Sale Announcement" onClose={() => setCreateOpen(false)}>
        <SaleAnnouncementForm
          initial={EMPTY_FORM}
          submitLabel="Create"
          submitting={createMutation.isPending}
          onSubmit={form => createMutation.mutate(form)}
        />
      </FormModal>

      <FormModal open={editItem !== null} title="Edit Sale Announcement" onClose={() => setEditItem(null)}>
        {editItem && (
          <SaleAnnouncementForm
            initial={announcementToForm(editItem)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={form => editMutation.mutate({ id: editItem.id, form })}
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteItem !== null}
        message={`Delete "${deleteItem?.title}"? This cannot be undone.`}
        onConfirm={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
        onCancel={() => setDeleteItem(null)}
      />
    </div>
  )
}
