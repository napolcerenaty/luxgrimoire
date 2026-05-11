'use client'

import { useState } from 'react'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiSponsoredSlot, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

import { parseDecimalInput } from '@/lib/parseDecimalInput'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'

const SLOT_TYPES = ['HOMEPAGE_FEATURED', 'COMPANY_PAGE_BANNER', 'NEWSLETTER_SLOT'] as const
type SlotType = (typeof SLOT_TYPES)[number]

const SLOT_TYPE_LABELS: Record<SlotType, string> = {
  HOMEPAGE_FEATURED: 'Homepage Featured',
  COMPANY_PAGE_BANNER: 'Company Page Banner',
  NEWSLETTER_SLOT: 'Newsletter Slot',
}

const SLOT_TYPE_COLORS: Record<SlotType, string> = {
  HOMEPAGE_FEATURED: 'bg-amber-400/10 text-amber-400 border-amber-400/30',
  COMPANY_PAGE_BANNER: 'bg-violet-400/10 text-violet-400 border-violet-400/30',
  NEWSLETTER_SLOT: 'bg-sky-400/10 text-sky-400 border-sky-400/30',
}

interface SlotFormData {
  companyId: string
  slotType: SlotType
  startDate: string
  endDate: string
  priceCharged: string
  notes: string
  isActive: boolean
}

const EMPTY_FORM: SlotFormData = {
  companyId: '',
  slotType: 'HOMEPAGE_FEATURED',
  startDate: '',
  endDate: '',
  priceCharged: '',
  notes: '',
  isActive: true,
}

function slotToForm(slot: ApiSponsoredSlot): SlotFormData {
  return {
    companyId: slot.companyId,
    slotType: slot.type as SlotType,
    startDate: slot.startsAt.slice(0, 10),
    endDate: slot.endsAt.slice(0, 10),
    priceCharged: String(slot.priceEur),
    notes: slot.notes ?? '',
    isActive: slot.isActive,
  }
}

function formToCreatePayload(form: SlotFormData) {
  return {
    companyId: form.companyId,
    slotType: form.slotType,
    startDate: form.startDate,
    endDate: form.endDate,
    priceCharged: form.priceCharged ? parseDecimalInput(form.priceCharged) : undefined,
    notes: form.notes || undefined,
  }
}

function formToUpdatePayload(form: SlotFormData) {
  return {
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    isActive: form.isActive,
    priceCharged: form.priceCharged ? parseDecimalInput(form.priceCharged) : undefined,
    notes: form.notes || undefined,
  }
}

interface SlotFormProps {
  initial: SlotFormData
  isEdit: boolean
  onSubmit: (data: SlotFormData) => void
  submitting: boolean
  submitLabel: string
}

function SlotForm({ initial, isEdit, onSubmit, submitting, submitLabel }: SlotFormProps) {
  const [form, setForm] = useState<SlotFormData>(initial)

  const set =
    (field: keyof SlotFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
      className="flex flex-col gap-4"
    >
      {!isEdit && (
        <div>
          <label className={LABEL_CLASS}>Company ID *</label>
          <input required className={INPUT_CLASS} value={form.companyId} onChange={set('companyId')} placeholder="cuid..." />
        </div>
      )}
      <div>
        <label className={LABEL_CLASS}>Slot Type *</label>
        <select required className={INPUT_CLASS} value={form.slotType} onChange={set('slotType')} disabled={isEdit}>
          {SLOT_TYPES.map((t) => (
            <option key={t} value={t}>{SLOT_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLASS}>Start Date *</label>
          <input required type="date" className={INPUT_CLASS} value={form.startDate} onChange={set('startDate')} />
        </div>
        <div>
          <label className={LABEL_CLASS}>End Date *</label>
          <input required type="date" className={INPUT_CLASS} value={form.endDate} onChange={set('endDate')} />
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Price (€)</label>
        <input type="number" min="0" step="0.01" className={INPUT_CLASS} value={form.priceCharged} onChange={set('priceCharged')} placeholder="0.00" />
      </div>
      <div>
        <label className={LABEL_CLASS}>Notes</label>
        <textarea rows={3} className={INPUT_CLASS} value={form.notes} onChange={set('notes')} />
      </div>
      <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          className="accent-amber-400 w-4 h-4"
        />
        Active
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

interface RevenueStats {
  totalRevenue: number
  activeSlots: number
  slotsByType: Record<string, number>
}

export default function AdminSponsoredSlotsPage() {
  const queryClient = useQueryClient()
  const createModal = useModalState()
  const [editSlot, setEditSlot] = useState<ApiSponsoredSlot | null>(null)
  const [deleteSlot, setDeleteSlot] = useState<ApiSponsoredSlot | null>(null)

  const { data: slotsData, isLoading } = useQuery({
    queryKey: ['admin', 'sponsored-slots'],
    queryFn: () => authFetch<PaginatedResponse<ApiSponsoredSlot>>('/sponsored?page=1&pageSize=100'),
  })

  const { data: stats } = useQuery({
    queryKey: ['admin', 'sponsored-stats'],
    queryFn: () => authFetch<RevenueStats>('/sponsored/stats'),
  })

  const slots = slotsData?.data ?? []

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToCreatePayload>) =>
      authFetch('/sponsored', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sponsored-slots'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'sponsored-stats'] })
      createModal.close()
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReturnType<typeof formToUpdatePayload> }) =>
      authFetch(`/sponsored/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sponsored-slots'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'sponsored-stats'] })
      setEditSlot(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/sponsored/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sponsored-slots'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'sponsored-stats'] })
      setDeleteSlot(null)
    },
  })

  const columns = [
    {
      key: 'company',
      label: 'Company',
      render: (row: ApiSponsoredSlot) => (
        <span className="font-medium text-stone-100">{row.company?.name ?? row.companyId}</span>
      ),
    },
    {
      key: 'type',
      label: 'Slot Type',
      render: (row: ApiSponsoredSlot) => (
        <span
          className={`text-xs border px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
            SLOT_TYPE_COLORS[row.type as SlotType] ?? ''
          }`}
        >
          {SLOT_TYPE_LABELS[row.type as SlotType] ?? row.type}
        </span>
      ),
    },
    {
      key: 'dates',
      label: 'Dates',
      render: (row: ApiSponsoredSlot) => (
        <span className="text-stone-400 text-xs">
          {row.startsAt.slice(0, 10)} → {row.endsAt.slice(0, 10)}
        </span>
      ),
    },
    {
      key: 'priceEur',
      label: 'Price',
      render: (row: ApiSponsoredSlot) => (
        <span className="text-amber-400 font-mono text-sm">
          €{row.priceEur.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'isActive',
      label: 'Status',
      render: (row: ApiSponsoredSlot) =>
        row.isActive ? (
          <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-400/20 px-2 py-0.5 rounded-full">
            Active
          </span>
        ) : (
          <span className="text-xs bg-stone-800 text-stone-500 border border-stone-700 px-2 py-0.5 rounded-full">
            Inactive
          </span>
        ),
    },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Sponsored Slots</h1>
        <button
          onClick={() => createModal.open()}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Sponsored Slot
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
            <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Total Revenue</p>
            <p className="text-2xl font-serif font-bold text-amber-400">
              €{stats.totalRevenue.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
            <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Active Slots</p>
            <p className="text-2xl font-serif font-bold text-emerald-400">{stats.activeSlots}</p>
          </div>
          {SLOT_TYPES.map((type) => (
            <div key={type} className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">
                {SLOT_TYPE_LABELS[type]}
              </p>
              <p className="text-2xl font-serif font-bold text-stone-100">
                {stats.slotsByType[type] ?? 0}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Revenue summary card */}
      {stats && (
        <div className="bg-gradient-to-r from-amber-900/20 via-stone-900 to-stone-900 border border-amber-700/30 rounded-2xl px-6 py-4 mb-6 flex items-center gap-3">
          <span className="text-amber-400 text-xl">✦</span>
          <p className="text-stone-300 text-sm">
            Total charged:{' '}
            <span className="text-amber-400 font-semibold font-mono text-base">
              €{stats.totalRevenue.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </p>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          data={slots}
          onEdit={(row) => setEditSlot(row)}
          onDelete={(row) => setDeleteSlot(row)}
        />
      )}

      {/* Create modal */}
      <FormModal open={createModal.isOpen} title="Add Sponsored Slot" onClose={() => createModal.close()}>
        <SlotForm
          initial={EMPTY_FORM}
          isEdit={false}
          submitLabel="Create Slot"
          submitting={createMutation.isPending}
          onSubmit={(form) => createMutation.mutate(formToCreatePayload(form))}
        />
      </FormModal>

      {/* Edit modal */}
      <FormModal open={editSlot !== null} title="Edit Sponsored Slot" onClose={() => setEditSlot(null)}>
        {editSlot && (
          <SlotForm
            initial={slotToForm(editSlot)}
            isEdit={true}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={(form) => editMutation.mutate({ id: editSlot.id, payload: formToUpdatePayload(form) })}
          />
        )}
      </FormModal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteSlot !== null}
        message={`Delete the ${deleteSlot?.type ? SLOT_TYPE_LABELS[deleteSlot.type as SlotType] : 'sponsored'} slot for "${deleteSlot?.company?.name}"? This cannot be undone.`}
        onConfirm={() => deleteSlot && deleteMutation.mutate(deleteSlot.id)}
        onCancel={() => setDeleteSlot(null)}
      />
    </div>
  )
}

