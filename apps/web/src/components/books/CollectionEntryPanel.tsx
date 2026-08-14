'use client'

import { useState, useEffect } from 'react'
import {
  ExternalLink, Pencil, Check, X, ChevronDown, ChevronUp,
  Clock, Tag, Package, Wallet, Plus, Trash2, Hash,
} from 'lucide-react'
import { authFetch } from '@/lib/authFetch'
import { createSaleGroup, updateSaleGroup } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import { CURRENCIES, SALE_PLATFORMS } from '@/components/sale/SaleFormFields'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isValidCalendarDate } from '@/lib/dateValidation'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { TagEditor } from '@/components/collection/TagEditor'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PurchaseFee {
  id: string
  name: string
  amount: string
  currency: string
  category: string
  date: string
  feeTemplateId: string | null
}

interface PurchaseDiscount {
  id: string
  name: string
  amount: string
  currency: string
}

interface PurchaseRefund {
  id: string
  amount: string
  currency: string
  date: string
  reason: string | null
}

interface FeeTemplate {
  id: string
  name: string
  category: string
  defaultAmount: string | null
  defaultCurrency: string | null
  isActive: boolean
}

interface PurchaseGroupBookEntry {
  id: string
  editionId: string | null
  basePrice: string | null
  edition: { book: { title: string } | null } | null
}

interface PurchaseGroup {
  id: string
  title: string | null
  totalAmount: string
  currency: string
  shippingAmount: string | null
  purchasedAt: string
  notes: string | null
  saleAnnouncementId: string | null
  fromSubscription: boolean
  isSecondHand: boolean
  sourcePlatform: string | null
  priceDistribution?: string
  fees: PurchaseFee[]
  discounts: PurchaseDiscount[]
  refunds: PurchaseRefund[]
  bookEntries?: PurchaseGroupBookEntry[]
  _count?: { bookEntries: number }
}

interface CollectionEntry {
  id: string
  readingStatus: string
  ownershipStatus: string
  addedAt: string
  acquiredAt: string | null
  trackingNumbers: Array<{ id: string; trackingNumber: string; label: string | null }>
  orderNumber: string | null
  salePrice: string | null
  saleCurrency: string | null
  saleDate: string | null
  saleVenue: string | null
  saleNotes: string | null
  signatureType: string | null
  subscriptionEntryId: string | null
  basePrice: string | null
  saleGroupId: string | null
  saleGroupTitle: string | null
  saleGroupEntryCount: number | null
  tags: string[]
  purchaseGroup: PurchaseGroup | null
  saleAnnouncementEditionId: string | null
  isOriginalPrint: boolean
  saleAnnouncementEdition: {
    id: string
    isReprint: boolean
    announcement: {
      id: string
      title: string
      generalSaleDate: string | null
      tiers?: { name: string; date: string }[]
    }
  } | null
}

interface HistoryEntry {
  id: string
  status: string
  changedAt: string
}

interface ReadingHistoryEntry {
  id: string
  startedAt: string | null
  finishedAt: string | null
  isDnf: boolean
  notes: string | null
  createdAt: string
}

interface SaleEditionOption {
  id: string
  isReprint: boolean
  announcement: {
    id: string
    title: string
    generalSaleDate: string | null
  }
}

interface Props {
  editionId: string
  initialEntryId?: string | null
  saleEditions?: SaleEditionOption[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OWNERSHIP_STATUSES = ['PREORDER', 'SHIPPING', 'OWNED', 'BORROWED', 'LENDED', 'TO_SELL', 'SOLD', 'GIFTED_AWAY'] as const
const READING_STATUSES = ['UNREAD', 'READING', 'READ', 'DNF'] as const

const OWNERSHIP_LABEL: Record<string, string> = {
  OWNED: 'OWN',
  PREORDER: 'PREORDER',
  SHIPPING: 'SHIPPING',
  BORROWED: 'BORROWED',
  LENDED: 'LENDED',
  TO_SELL: 'TO SELL',
  SOLD: 'SOLD',
  GIFTED_AWAY: 'GIFTED AWAY',
}
const fmtOwnership = (s: string) => OWNERSHIP_LABEL[s] ?? s.replace(/_/g, ' ').toUpperCase()

const OWNERSHIP_COLORS: Record<string, string> = {
  OWNED: 'badge-owned',
  PREORDER: 'badge-preorder',
  SHIPPING: 'badge-shipping',
  BORROWED: 'badge-borrowed',
  LENDED: 'badge-lended',
  SOLD: 'badge-sold',
}

const READING_COLORS: Record<string, string> = {
  UNREAD: 'badge-unread',
  READING: 'badge-reading',
  READ: 'badge-read',
  DNF: 'badge-dnf',
}

const SIGNATURE_LABELS: Record<string, string> = {
  unsigned: 'Unsigned',
  signed: 'Signed',
  autopen: 'Autopen',
  digitally_signed: 'Digitally signed',
  signed_bookplate: 'Bookplate',
  stamped: 'Stamped',
}
const SIGNATURE_TYPES = ['unsigned', 'signed', 'autopen', 'digitally_signed', 'signed_bookplate', 'stamped'] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeInCollection(dateStr: string, endDateStr?: string | null): string {
  const from = new Date(dateStr)
  const end = endDateStr ? new Date(endDateStr) : new Date()
  const diffMs = end.getTime() - from.getTime()
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
  const years = Math.floor(diffDays / 365)
  const months = Math.floor((diffDays % 365) / 30)
  const days = diffDays % 30
  if (years > 0) return `${years} year${years !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''}`
  if (months > 0) return `${months} month${months !== 1 ? 's' : ''} ${days} day${days !== 1 ? 's' : ''}`
  return `${diffDays} day${diffDays !== 1 ? 's' : ''}`
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const INP_BASE = 'bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-navy-100 focus:outline-none focus:border-brand-400 text-sm'
const INP = INP_BASE + ' w-full'
const INP_FLEX = INP_BASE + ' flex-1 min-w-0'
/** Swaps the border color of an INP_* class string to flag an invalid field. */
const inpErr = (base: string, invalid: boolean) => invalid ? base.replace('border-navy-700', 'border-red-500/70') : base
const FEE_CATEGORIES = [
  { value: 'VAT', label: 'VAT' },
  { value: 'CUSTOMS', label: 'Customs' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'FORWARDING', label: 'Forwarding' },
  { value: 'PRICE_ADJUSTMENT', label: 'Price Adjustment' },
  { value: 'OTHER', label: 'Other' },
]
const SEC_HDR = 'text-xs uppercase tracking-widest font-semibold text-navy-500 mb-3'

function EditBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="ml-2 text-navy-500 hover:text-brand-400 transition-colors"
      title="Edit"
    >
      <Pencil size={13} />
    </button>
  )
}

function SaveCancelBtns({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="flex gap-2 mt-2">
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-400 text-xs hover:bg-brand-500/20 transition-colors disabled:opacity-50"
      >
        <Check size={12} /> Save
      </button>
      <button
        onClick={onCancel}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-navy-700 text-navy-400 text-xs hover:border-navy-500 transition-colors"
      >
        <X size={12} /> Cancel
      </button>
    </div>
  )
}

// ─── Add history entry form ───────────────────────────────────────────────────

function AddHistoryEntryForm({ onSave, onCancel, saving }: {
  onSave: (status: string, changedAt: string) => void
  onCancel: () => void
  saving: boolean
}) {
  const [status, setStatus] = useState('OWNED')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1">
      <select
        value={status}
        onChange={e => setStatus(e.target.value)}
        className="text-xs bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-navy-200 focus:outline-none focus:border-brand-400"
      >
        {(['PREORDER', 'SHIPPING', 'OWNED', 'BORROWED', 'LENDED', 'TO_SELL', 'SOLD', 'GIFTED_AWAY'] as const).map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className="text-xs bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-navy-200 focus:outline-none focus:border-brand-400"
      />
      <button
        onClick={() => onSave(status, date)}
        disabled={saving}
        className="text-xs text-brand-400 hover:text-brand-300 disabled:opacity-50"
      ><Check size={11} /></button>
      <button onClick={onCancel} className="text-xs text-navy-500 hover:text-navy-300"><X size={11} /></button>
    </div>
  )
}

// ─── Add reading history form ─────────────────────────────────────────────────

function AddReadingHistoryForm({ onSave, onCancel, saving }: {
  onSave: (dto: { startedAt: string; finishedAt: string; isDnf: boolean; notes: string }) => void
  onCancel: () => void
  saving: boolean
}) {
  const [startedAt, setStartedAt] = useState('')
  const [finishedAt, setFinishedAt] = useState('')
  const [isDnf, setIsDnf] = useState(false)
  const [notes, setNotes] = useState('')
  return (
    <div className="flex flex-col gap-2 mt-1 text-xs">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center">
        <label className="text-navy-500 shrink-0">Started</label>
        <input
          type="date"
          value={startedAt}
          onChange={e => setStartedAt(e.target.value)}
          className="bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-navy-200 focus:outline-none focus:border-brand-400 w-full"
        />
        <label className="text-navy-500 shrink-0">Finished</label>
        <input
          type="date"
          value={finishedAt}
          onChange={e => setFinishedAt(e.target.value)}
          className="bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-navy-200 focus:outline-none focus:border-brand-400 w-full"
        />
      </div>
      <label className="flex items-center gap-1.5 text-navy-400 cursor-pointer w-fit">
        <input type="checkbox" checked={isDnf} onChange={e => setIsDnf(e.target.checked)} className="accent-brand-400" />
        DNF
      </label>
      <input
        type="text"
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-navy-200 focus:outline-none focus:border-brand-400 w-full"
      />
      <div className="flex gap-2">
        <button onClick={() => onSave({ startedAt, finishedAt, isDnf, notes })} disabled={saving} className="text-brand-400 hover:text-brand-300 disabled:opacity-50"><Check size={11} /></button>
        <button onClick={onCancel} className="text-navy-500 hover:text-navy-300"><X size={11} /></button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CollectionEntryPanel({ editionId, initialEntryId, saleEditions = [] }: Props) {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const [allEntries, setAllEntries] = useState<CollectionEntry[]>([])
  const [selectedCopyIdx, setSelectedCopyIdx] = useState(0)
  const [entry, setEntry] = useState<CollectionEntry | null>(null)
  const [loading, setLoading] = useState(true)

  // Currency conversion
  const [rates, setRates] = useState<Record<string, number>>({})
  const userCurrency = user?.preferredCurrency

  // Print picker
  const [savingPrint, setSavingPrint] = useState(false)

  // Status dropdowns (inline, no save form)
  const [activeDropdown, setActiveDropdown] = useState<'ownership' | 'reading' | 'signature' | 'print' | null>(null)
  const [savingStatus, setSavingStatus] = useState(false)

  // Edit state — purchase group
  const [editingPurchase, setEditingPurchase] = useState(false)
  const [editTotalAmount, setEditTotalAmount] = useState('')
  const [editCurrency, setEditCurrency] = useState('')
  const [editShippingAmount, setEditShippingAmount] = useState('')
  const [editDiscounts, setEditDiscounts] = useState<{ id?: string; name: string; amount: string }[]>([])
  const [editPurchasedAt, setEditPurchasedAt] = useState('')
  const [editPurchaseNotes, setEditPurchaseNotes] = useState('')
  const [editEntryPrices, setEditEntryPrices] = useState<Record<string, string>>({})
  const [invalidPriceEntryIds, setInvalidPriceEntryIds] = useState<Set<string>>(new Set())
  const [savingPurchase, setSavingPurchase] = useState(false)

  // Error state
  const [saveError, setSaveError] = useState<string | null>(null)
  const [purchaseErrorField, setPurchaseErrorField] = useState<'date' | 'amount' | 'shipping' | null>(null)

  // Fee editing state (on purchase group)
  const [addingFee, setAddingFee] = useState(false)
  const [newFeeName, setNewFeeName] = useState('')
  const [newFeeAmount, setNewFeeAmount] = useState('')
  const [newFeeCurrency, setNewFeeCurrency] = useState('')
  const [newFeeDate, setNewFeeDate] = useState('')
  const [newFeeCategory, setNewFeeCategory] = useState('OTHER')
  const [newFeeTemplateId, setNewFeeTemplateId] = useState<string | null>(null)
  const [savingFee, setSavingFee] = useState(false)
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null)
  const [editFeeName, setEditFeeName] = useState('')
  const [editFeeAmount, setEditFeeAmount] = useState('')
  const [editFeeCurrency, setEditFeeCurrency] = useState('')
  const [editFeeDate, setEditFeeDate] = useState('')
  const [editFeeCategory, setEditFeeCategory] = useState('OTHER')
  const [editFeeTemplateId, setEditFeeTemplateId] = useState<string | null>(null)
  const [newFeeError, setNewFeeError] = useState<string | null>(null)
  const [newFeeErrorField, setNewFeeErrorField] = useState<'name' | 'amount' | 'date' | null>(null)
  const [editFeeError, setEditFeeError] = useState<string | null>(null)
  const [editFeeErrorField, setEditFeeErrorField] = useState<'name' | 'amount' | 'date' | null>(null)

  // Refund state
  const [addingRefund, setAddingRefund] = useState(false)
  const [newRefundAmount, setNewRefundAmount] = useState('')
  const [newRefundCurrency, setNewRefundCurrency] = useState('')
  const [newRefundReason, setNewRefundReason] = useState('')
  const [newRefundDate, setNewRefundDate] = useState('')
  const [savingRefund, setSavingRefund] = useState(false)
  const [refundError, setRefundError] = useState<string | null>(null)
  const [refundErrorField, setRefundErrorField] = useState<'amount' | 'date' | null>(null)

  // Fee templates
  const [feeTemplates, setFeeTemplates] = useState<FeeTemplate[]>([])

  // Edit state — sale
  const [editingSale, setEditingSale] = useState(false)
  const [editSalePrice, setEditSalePrice] = useState('')
  const [editSaleCurrency, setEditSaleCurrency] = useState('')
  const [editSaleDate, setEditSaleDate] = useState('')
  const [editSaleVenue, setEditSaleVenue] = useState('')
  const [editSaleVenueCustom, setEditSaleVenueCustom] = useState('')
  const [editSaleNotes, setEditSaleNotes] = useState('')
  const [savingSale, setSavingSale] = useState(false)

  // Edit state — tracking
  const [addingTracking, setAddingTracking] = useState(false)
  const [newTrackingNumber, setNewTrackingNumber] = useState('')
  const [newTrackingLabel, setNewTrackingLabel] = useState('')
  const [savingTracking, setSavingTracking] = useState(false)
  const [editingTrackingId, setEditingTrackingId] = useState<string | null>(null)
  const [editTrackingNumber, setEditTrackingNumber] = useState('')
  const [editTrackingLabel, setEditTrackingLabel] = useState('')
  const [savingEditTracking, setSavingEditTracking] = useState(false)

  // Edit state — order number
  const [editingOrderNumber, setEditingOrderNumber] = useState(false)
  const [editOrderNumber, setEditOrderNumber] = useState('')
  const [savingOrderNumber, setSavingOrderNumber] = useState(false)
  const [deletingOrderNumber, setDeletingOrderNumber] = useState(false)

  // Tags — all tags across the user's collection, for autocomplete suggestions
  const { data: allUserTags = [] } = useQuery({
    queryKey: ['collection-tags'],
    queryFn: () => authFetch<string[]>('/collection/tags'),
  })

  // History
  const { isOpen: showHistory, toggle: _toggleHistory } = useModalState()
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyEditId, setHistoryEditId] = useState<string | null>(null)
  const [historyEditStatus, setHistoryEditStatus] = useState('')
  const [historyEditDate, setHistoryEditDate] = useState('')
  const [historySaving, setHistorySaving] = useState(false)
  const { isOpen: historyAddOpen, open: openHistoryAdd, close: closeHistoryAdd } = useModalState()

  // Reading history
  const { isOpen: showReadingHistory, toggle: _toggleReadingHistory } = useModalState()
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryEntry[] | null>(null)
  const [loadingReadingHistory, setLoadingReadingHistory] = useState(false)
  const [readingHistoryEditId, setReadingHistoryEditId] = useState<string | null>(null)
  const [readingHistoryEditStartedAt, setReadingHistoryEditStartedAt] = useState('')
  const [readingHistoryEditFinishedAt, setReadingHistoryEditFinishedAt] = useState('')
  const [readingHistoryEditIsDnf, setReadingHistoryEditIsDnf] = useState(false)
  const [readingHistoryEditNotes, setReadingHistoryEditNotes] = useState('')
  const [readingHistorySaving, setReadingHistorySaving] = useState(false)
  const { isOpen: readingHistoryAddOpen, open: openReadingHistoryAdd, close: closeReadingHistoryAdd } = useModalState()

  // Reset cached history whenever entry ID changes (e.g. copy switcher)
  // If history panel is open, re-fetch immediately for the new copy
  useEffect(() => {
    setHistory(null)
    if (showHistory && entry?.id) {
      setLoadingHistory(true)
      authFetch<HistoryEntry[]>(`/collection/entry/${entry.id}/history`)
        .then(data => setHistory(data))
        .catch(() => setHistory([]))
        .finally(() => setLoadingHistory(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id])

  // Fetch entry once auth state is resolved
  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }

    authFetch<CollectionEntry[]>(`/collection/edition/${editionId}/entry`)
      .then((data) => {
        const entries = data ?? []
        setAllEntries(entries)
        const initialIdx = initialEntryId
          ? Math.max(0, entries.findIndex(e => e.id === initialEntryId))
          : 0
        setSelectedCopyIdx(initialIdx)
        setEntry(entries[initialIdx] ?? null)
      })
      .catch(() => setEntry(null))
      .finally(() => setLoading(false))

    authFetch<FeeTemplate[]>('/fees/templates?activeOnly=true')
      .then(t => setFeeTemplates(t ?? []))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionId, authLoading, user?.id])

  // Fetch exchange rates once we have entry + userCurrency
  // Keys are "${from}:${to}:${date}" for date-specific rates
  useEffect(() => {
    if (!entry || !userCurrency) return
    const pg = entry.purchaseGroup
    if (!pg) return

    const pgDate = pg.purchasedAt?.slice(0, 10) ?? ''
    const pgCurrency = pg.currency

    const tuples: Array<{ from: string; to: string; date: string }> = []

    if (pgCurrency !== userCurrency) {
      tuples.push({ from: pgCurrency, to: userCurrency, date: pgDate })
    }

    ;(pg.fees ?? []).forEach(f => {
      const d = f.date?.slice(0, 10) ?? pgDate
      if (f.currency !== userCurrency) tuples.push({ from: f.currency, to: userCurrency, date: d })
      if (f.currency !== pgCurrency) tuples.push({ from: f.currency, to: pgCurrency, date: d })
    })

    ;(pg.discounts ?? []).forEach(d => {
      const date = (d as any).date?.slice(0, 10) ?? pgDate
      if (d.currency !== userCurrency) tuples.push({ from: d.currency, to: userCurrency, date })
      if (d.currency !== pgCurrency) tuples.push({ from: d.currency, to: pgCurrency, date })
    })

    ;(pg.refunds ?? []).forEach(r => {
      const date = r.date?.slice(0, 10) ?? pgDate
      if (r.currency !== userCurrency) tuples.push({ from: r.currency, to: userCurrency, date })
      if (r.currency !== pgCurrency) tuples.push({ from: r.currency, to: pgCurrency, date })
    })

    const seen = new Set<string>()
    const unique = tuples.filter(t => {
      const key = `${t.from}:${t.to}:${t.date}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    if (!unique.length) return

    Promise.all(
      unique.map(({ from, to, date }) =>
        authFetch<{ rate: number }>(`/currency/rate?from=${from}&to=${to}${date ? `&date=${date}` : ''}`)
          .then(d => [`${from}:${to}:${date}`, d.rate] as [string, number])
          .catch(() => [`${from}:${to}:${date}`, null] as [string, null])
      )
    ).then(results => {
      const r: Record<string, number> = {}
      results.forEach(([k, v]) => { if (v !== null) r[k] = v })
      setRates(r)
    })
  }, [entry, userCurrency])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.editionId || detail.editionId === editionId) {
        authFetch<CollectionEntry[]>(`/collection/edition/${editionId}/entry`)
          .then(fresh => {
            if (fresh?.length) {
              setAllEntries(fresh)
              setEntry(prev => fresh.find(e => e.id === prev?.id) ?? fresh[0])
            }
          })
          .catch(() => {})
      }
    }
    window.addEventListener('collection:updated', handler)
    return () => window.removeEventListener('collection:updated', handler)
  }, [editionId])

  // While editing purchase costs for a multi-book group, once any book has a price the total
  // becomes a calculated, read-only sum — same all-or-nothing rule as Add to Collection.
  useEffect(() => {
    const bookEntries = entry?.purchaseGroup?.bookEntries ?? []
    if (bookEntries.length <= 1) return
    const anyFilled = bookEntries.some(be => (editEntryPrices[be.id] ?? '').trim() !== '')
    if (!anyFilled) return
    const sum = bookEntries.reduce((s, be) => {
      const raw = (editEntryPrices[be.id] ?? '').trim()
      return s + (raw === '' ? 0 : parseDecimalInput(raw))
    }, 0)
    setEditTotalAmount(sum.toFixed(2))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.purchaseGroup?.bookEntries, editEntryPrices])

  if (loading || !entry) return null

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function patchEntry(fields: Record<string, unknown>) {
    const updated = await authFetch<CollectionEntry>(`/collection/${entry!.id}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    })
    const freshAll = await authFetch<CollectionEntry[]>(`/collection/edition/${editionId}/entry`)
    const fresh = freshAll?.find(e => e.id === entry!.id) ?? freshAll?.[0]
    setAllEntries(freshAll ?? [])
    setEntry({ ...(fresh ?? updated), tags: fresh?.tags ?? entry!.tags })
    queryClient.invalidateQueries({ queryKey: ['collection'] })
  }

  async function refetchEntry() {
    const freshAll = await authFetch<CollectionEntry[]>(`/collection/edition/${editionId}/entry`)
    if (freshAll?.length) {
      setAllEntries(freshAll)
      setEntry(prev => {
        const same = freshAll.find(e => e.id === prev?.id)
        return same ?? freshAll[0]
      })
    }
  }

  // ── Status section ────────────────────────────────────────────────────────

  async function quickSaveStatus(field: 'ownershipStatus' | 'readingStatus' | 'signatureType', value: string) {
    setActiveDropdown(null)
    setSavingStatus(true)
    try {
      await patchEntry({ [field]: value === '' ? null : value })
      if (field === 'ownershipStatus' && history !== null) {
        await refreshHistory()
      }
    } finally {
      setSavingStatus(false)
    }
  }

  async function savePrint(saleAnnouncementEditionId: string | null, isOriginalPrint?: boolean) {
    setSavingPrint(true)
    try {
      await patchEntry({ saleAnnouncementEditionId: saleAnnouncementEditionId || null, ...(isOriginalPrint !== undefined ? { isOriginalPrint } : {}) })
    } finally {
      setSavingPrint(false)
    }
  }

  // ── Purchase group section ────────────────────────────────────────────────

  function openPurchaseEdit() {
    const pg = entry!.purchaseGroup
    if (pg) {
      setEditTotalAmount(String(pg.totalAmount))
      setEditCurrency(pg.currency)
      setEditShippingAmount(pg.shippingAmount ? String(pg.shippingAmount) : '')
      setEditDiscounts((pg.discounts ?? []).map(d => ({ id: d.id, name: d.name, amount: String(d.amount) })))
      setEditPurchasedAt(pg.purchasedAt ? pg.purchasedAt.slice(0, 10) : '')
      setEditPurchaseNotes(pg.notes ?? '')
      // Pre-fill from the real per-book allocation when this group already has one — otherwise
      // leave blank (equal split so far), same "all filled or none" rule as Add to Collection.
      const prices: Record<string, string> = {}
      for (const be of pg.bookEntries ?? []) {
        if (be.basePrice != null) prices[be.id] = String(be.basePrice)
      }
      setEditEntryPrices(prices)
      setInvalidPriceEntryIds(new Set())
    } else {
      setEditTotalAmount('')
      setEditCurrency('EUR')
      setEditShippingAmount('')
      setEditDiscounts([])
      setEditPurchasedAt('')
      setEditPurchaseNotes('')
      setEditEntryPrices({})
      setInvalidPriceEntryIds(new Set())
    }
    setSaveError(null)
    setPurchaseErrorField(null)
    setEditingPurchase(true)
  }

  async function savePurchase() {
    if (editPurchasedAt && !isValidCalendarDate(editPurchasedAt)) {
      setSaveError('Enter a valid purchase date.'); setPurchaseErrorField('date'); return
    }
    const totalAmt = parseFloat(editTotalAmount)
    if (editTotalAmount && (isNaN(totalAmt) || totalAmt < 0)) {
      setSaveError('Price must be 0 or greater.'); setPurchaseErrorField('amount'); return
    }
    if (editShippingAmount) {
      const shipAmt = parseFloat(editShippingAmount)
      if (isNaN(shipAmt) || shipAmt < 0) {
        setSaveError('Shipping must be 0 or greater.'); setPurchaseErrorField('shipping'); return
      }
    }
    // Per-book pricing is all-or-nothing: once any book has a price, every book in the group needs one.
    const pgBookEntriesForSave = entry!.purchaseGroup?.bookEntries ?? []
    const perBookModeForSave = pgBookEntriesForSave.length > 1 && pgBookEntriesForSave.some(be => (editEntryPrices[be.id] ?? '').trim() !== '')
    const nextInvalidPriceEntryIds = new Set<string>()
    if (perBookModeForSave) {
      for (const be of pgBookEntriesForSave) {
        const raw = (editEntryPrices[be.id] ?? '').trim()
        const n = parseFloat(raw.replace(',', '.'))
        if (raw === '' || isNaN(n) || n < 0) nextInvalidPriceEntryIds.add(be.id)
      }
    }
    setInvalidPriceEntryIds(nextInvalidPriceEntryIds)
    if (nextInvalidPriceEntryIds.size > 0) {
      setSaveError('Enter a price for every book below, or clear all of them to set one total price instead.')
      return
    }
    setPurchaseErrorField(null)
    setSavingPurchase(true)
    setSaveError(null)
    try {
      const pg = entry!.purchaseGroup
      const payload: Record<string, unknown> = {
        totalAmount: parseFloat(editTotalAmount) || 0,
        currency: editCurrency,
        purchasedAt: editPurchasedAt || new Date().toISOString(),
      }
      if (editShippingAmount) payload.shippingAmount = parseFloat(editShippingAmount)
      if (editPurchaseNotes) payload.notes = editPurchaseNotes
      if (pgBookEntriesForSave.length > 1) {
        if (perBookModeForSave) {
          payload.priceDistribution = 'CUSTOM'
          payload.entryPrices = Object.fromEntries(
            pgBookEntriesForSave.map(be => [be.id, parseDecimalInput(editEntryPrices[be.id])]),
          )
        } else {
          payload.priceDistribution = 'EQUAL'
        }
      }
      let groupId: string
      if (pg) {
        await authFetch(`/collection/bundles/${pg.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        groupId = pg.id
      } else {
        const created = await authFetch<{ id: string }>(`/collection/bundles/for-entry/${entry!.id}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        groupId = created.id
      }

      // Sync discounts: delete removed, patch existing, post new
      const existingIds = new Set((pg?.discounts ?? []).map(d => d.id))
      const keptIds = new Set(editDiscounts.filter(d => d.id).map(d => d.id!))

      // Delete discounts that were removed from the list
      for (const d of (pg?.discounts ?? [])) {
        if (!keptIds.has(d.id)) {
          await authFetch(`/fees/discounts/${d.id}`, { method: 'DELETE' })
        }
      }

      const purchasedAtIso = editPurchasedAt ? new Date(editPurchasedAt).toISOString() : new Date().toISOString()
      for (const d of editDiscounts) {
        const amt = parseFloat(d.amount)
        if (!amt || amt <= 0) continue
        if (d.id && existingIds.has(d.id)) {
          // Update existing
          await authFetch(`/fees/discounts/${d.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: d.name, amount: amt, currency: editCurrency, date: purchasedAtIso }),
          })
        } else {
          // Create new
          await authFetch(`/fees/discounts`, {
            method: 'POST',
            body: JSON.stringify({
              name: d.name,
              amount: amt,
              currency: editCurrency,
              date: purchasedAtIso,
              purchaseGroupId: groupId,
            }),
          })
        }
      }

      await refetchEntry()
      setEditingPurchase(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingPurchase(false)
    }
  }

  // ── Fee handlers (on purchase group) ─────────────────────────────────────

  function openAddFee() {
    setNewFeeName('')
    setNewFeeAmount('')
    setNewFeeCurrency(entry!.purchaseGroup?.currency ?? 'EUR')
    setNewFeeDate(new Date().toISOString().slice(0, 10))
    setNewFeeCategory('OTHER')
    setNewFeeTemplateId(null)
    setNewFeeError(null)
    setNewFeeErrorField(null)
    setAddingFee(true)
  }

  function clearNewFeeTemplate() {
    setNewFeeTemplateId(null)
    setNewFeeName('')
    setNewFeeCategory('OTHER')
  }

  async function saveNewFee() {
    if (!newFeeName.trim()) { setNewFeeError('Fee name is required.'); setNewFeeErrorField('name'); return }
    const amt = parseFloat(newFeeAmount)
    if (!newFeeAmount || isNaN(amt) || amt < 0) { setNewFeeError('Amount must be 0 or greater.'); setNewFeeErrorField('amount'); return }
    if (!isValidCalendarDate(newFeeDate)) { setNewFeeError('Enter a valid date.'); setNewFeeErrorField('date'); return }
    if (!entry!.purchaseGroup) return
    setNewFeeError(null)
    setNewFeeErrorField(null)
    setSavingFee(true)
    try {
      await authFetch(`/fees`, {
        method: 'POST',
        body: JSON.stringify({
          feeTemplateId: newFeeTemplateId ?? undefined,
          name: newFeeName,
          amount: amt,
          currency: newFeeCurrency,
          date: new Date(newFeeDate).toISOString(),
          category: newFeeCategory,
          purchaseGroupId: entry!.purchaseGroup.id,
        }),
      })
      await refetchEntry()
      setAddingFee(false)
    } finally {
      setSavingFee(false)
    }
  }

  async function deleteFee(feeId: string) {
    await authFetch(`/fees/${feeId}`, { method: 'DELETE' })
    await refetchEntry()
  }

  function openEditFee(fee: { id: string; name: string; amount: string; currency: string; date: string | null; category: string; feeTemplateId: string | null }) {
    setEditingFeeId(fee.id)
    setEditFeeName(fee.name)
    setEditFeeAmount(parseFloat(fee.amount).toFixed(2))
    setEditFeeCurrency(fee.currency)
    setEditFeeDate(fee.date ? fee.date.slice(0, 10) : new Date().toISOString().slice(0, 10))
    setEditFeeCategory(fee.category ?? 'OTHER')
    setEditFeeTemplateId(fee.feeTemplateId ?? null)
    setEditFeeError(null)
    setEditFeeErrorField(null)
  }

  async function saveEditFee() {
    if (!editingFeeId) return
    if (!editFeeName.trim()) { setEditFeeError('Fee name is required.'); setEditFeeErrorField('name'); return }
    const amt = parseFloat(editFeeAmount)
    if (!editFeeAmount || isNaN(amt) || amt < 0) { setEditFeeError('Amount must be 0 or greater.'); setEditFeeErrorField('amount'); return }
    if (!isValidCalendarDate(editFeeDate)) { setEditFeeError('Enter a valid date.'); setEditFeeErrorField('date'); return }
    setEditFeeError(null)
    setEditFeeErrorField(null)
    setSavingFee(true)
    try {
      await authFetch(`/fees/${editingFeeId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          amount: amt,
          currency: editFeeCurrency,
          date: new Date(editFeeDate).toISOString(),
          // Name/category are template-owned when this fee is linked to a template — only
          // amount/currency/date are ever editable for those (see FEE_CATEGORIES usage below).
          ...(editFeeTemplateId ? {} : { name: editFeeName, category: editFeeCategory }),
        }),
      })
      await refetchEntry()
      setEditingFeeId(null)
    } finally {
      setSavingFee(false)
    }
  }

  async function deleteDiscount(discountId: string) {
    await authFetch(`/fees/discounts/${discountId}`, { method: 'DELETE' })
    await refetchEntry()
  }

  async function saveNewRefund() {
    const amt = parseFloat(newRefundAmount)
    if (!newRefundAmount || isNaN(amt) || amt < 0) { setRefundError('Amount must be 0 or greater.'); setRefundErrorField('amount'); return }
    if (!isValidCalendarDate(newRefundDate)) { setRefundError('Enter a valid date.'); setRefundErrorField('date'); return }
    if (!entry!.purchaseGroup) return
    setRefundError(null)
    setRefundErrorField(null)
    setSavingRefund(true)
    try {
      await authFetch(`/fees/refunds`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amt,
          currency: newRefundCurrency,
          date: new Date(newRefundDate).toISOString(),
          reason: newRefundReason || null,
          purchaseGroupId: entry!.purchaseGroup.id,
        }),
      })
      await refetchEntry()
      setAddingRefund(false)
    } finally {
      setSavingRefund(false)
    }
  }

  async function deleteRefund(refundId: string) {
    await authFetch(`/fees/refunds/${refundId}`, { method: 'DELETE' })
    await refetchEntry()
  }

  // ── Sale section ──────────────────────────────────────────────────────────

  function openSaleEdit() {
    setEditSalePrice(entry!.salePrice ?? '')
    setEditSaleCurrency(entry!.saleCurrency ?? '')
    setEditSaleDate(entry!.saleDate ?? '')
    const raw = entry!.saleVenue ?? ''
    const matched = SALE_PLATFORMS.find(
      p => p.value === raw.toLowerCase() || p.label.toLowerCase() === raw.toLowerCase()
    )
    if (matched) {
      setEditSaleVenue(matched.value)
      setEditSaleVenueCustom('')
    } else if (raw) {
      setEditSaleVenue('other')
      setEditSaleVenueCustom(raw)
    } else {
      setEditSaleVenue('')
      setEditSaleVenueCustom('')
    }
    setEditSaleNotes(entry!.saleNotes ?? '')
    setEditingSale(true)
  }

  async function saveSale() {
    const venueToSave = editSaleVenue === 'other'
      ? (editSaleVenueCustom || null)
      : editSaleVenue
        ? (SALE_PLATFORMS.find(p => p.value === editSaleVenue)?.label ?? editSaleVenue)
        : null
    setSavingSale(true)
    try {
      const entryId = entry!.id
      const alreadyHasSaleGroup = !!entry!.saleGroupId
      if (alreadyHasSaleGroup) {
        // Update the existing SaleGroup — this also syncs back to UserBookEntry on the backend
        await updateSaleGroup(entry!.saleGroupId!, {
          totalAmount: editSalePrice ? parseFloat(editSalePrice) : undefined,
          currency: editSaleCurrency || undefined,
          soldAt: editSaleDate || undefined,
          platform: venueToSave ?? undefined,
          notes: editSaleNotes || undefined,
        })
        queryClient.invalidateQueries({ queryKey: ['sale-groups'] })
        queryClient.invalidateQueries({ queryKey: ['collection'] })
        queryClient.invalidateQueries({ queryKey: ['stats-sales'] })
        queryClient.invalidateQueries({ queryKey: ['stats-collection'] })
        queryClient.invalidateQueries({ queryKey: ['stats-pl'] })
        await refetchEntry()
      } else {
        await patchEntry({
          salePrice: editSalePrice || null,
          saleCurrency: editSaleCurrency || null,
          saleDate: editSaleDate || null,
          saleVenue: venueToSave,
          saleNotes: editSaleNotes || null,
        })
        // Auto-create a Recorded Sale if price + date are set
        if (editSalePrice && editSaleDate) {
          await createSaleGroup({
            totalAmount: parseFloat(editSalePrice),
            currency: editSaleCurrency || 'USD',
            platform: venueToSave || '',
            soldAt: editSaleDate,
            notes: editSaleNotes || undefined,
            priceDistribution: 'EQUAL',
            entryIds: [entryId],
          })
          queryClient.invalidateQueries({ queryKey: ['sale-groups'] })
          queryClient.invalidateQueries({ queryKey: ['collection'] })
          queryClient.invalidateQueries({ queryKey: ['stats-sales'] })
          queryClient.invalidateQueries({ queryKey: ['stats-collection'] })
          queryClient.invalidateQueries({ queryKey: ['stats-pl'] })
        }
      }
      setEditingSale(false)
    } finally {
      setSavingSale(false)
    }
  }

  // ── Order number section ──────────────────────────────────────────────────

  function openOrderNumberEdit() {
    setEditOrderNumber(entry!.orderNumber ?? '')
    setEditingOrderNumber(true)
  }

  async function saveOrderNumber() {
    setSavingOrderNumber(true)
    try {
      await patchEntry({ orderNumber: editOrderNumber || null })
      setEditingOrderNumber(false)
    } finally {
      setSavingOrderNumber(false)
    }
  }

  async function deleteOrderNumber() {
    setDeletingOrderNumber(true)
    try {
      await patchEntry({ orderNumber: null })
    } finally {
      setDeletingOrderNumber(false)
    }
  }

  // ── Tags section ──────────────────────────────────────────────────────────

  function handleTagsSaved(_entryId: string, tags: string[]) {
    setEntry(prev => prev ? { ...prev, tags } : prev)
    void queryClient.invalidateQueries({ queryKey: ['collection-tags'] })
  }

  // ── History section ───────────────────────────────────────────────────────

  async function toggleHistory() {
    if (!showHistory) {
      setLoadingHistory(true)
      try {
        const data = await authFetch<HistoryEntry[]>(`/collection/entry/${entry!.id}/history`)
        setHistory(data)
      } finally {
        setLoadingHistory(false)
      }
    }
    _toggleHistory()
  }

  async function refreshHistory() {
    const data = await authFetch<HistoryEntry[]>(`/collection/entry/${entry!.id}/history`)
    setHistory(data)
  }

  async function saveHistoryEdit(id: string) {
    setHistorySaving(true)
    try {
      await authFetch(`/collection/entry/${entry!.id}/history/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: historyEditStatus, changedAt: new Date(historyEditDate).toISOString() }),
      })
      setHistoryEditId(null)
      await refreshHistory()
    } finally {
      setHistorySaving(false)
    }
  }

  async function deleteHistoryEntry(id: string) {
    await authFetch(`/collection/entry/${entry!.id}/history/${id}`, { method: 'DELETE' })
    await refreshHistory()
  }

  async function addHistoryEntry(status: string, changedAt: string) {
    setHistorySaving(true)
    try {
      await authFetch(`/collection/entry/${entry!.id}/history`, {
        method: 'POST',
        body: JSON.stringify({ status, changedAt: new Date(changedAt).toISOString() }),
      })
      closeHistoryAdd()
      await refreshHistory()
    } finally {
      setHistorySaving(false)
    }
  }

  // ── Reading history section ───────────────────────────────────────────────

  async function toggleReadingHistory() {
    if (!showReadingHistory) {
      setLoadingReadingHistory(true)
      try {
        const data = await authFetch<ReadingHistoryEntry[]>(`/collection/entry/${entry!.id}/reading-history`)
        setReadingHistory(data)
      } finally {
        setLoadingReadingHistory(false)
      }
    }
    _toggleReadingHistory()
  }

  async function refreshReadingHistory() {
    const data = await authFetch<ReadingHistoryEntry[]>(`/collection/entry/${entry!.id}/reading-history`)
    setReadingHistory(data)
  }

  async function saveReadingHistoryEdit(id: string) {
    setReadingHistorySaving(true)
    try {
      await authFetch(`/collection/entry/${entry!.id}/reading-history/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          startedAt: readingHistoryEditStartedAt || null,
          finishedAt: readingHistoryEditFinishedAt || null,
          isDnf: readingHistoryEditIsDnf,
          notes: readingHistoryEditNotes || null,
        }),
      })
      setReadingHistoryEditId(null)
      await refreshReadingHistory()
    } finally {
      setReadingHistorySaving(false)
    }
  }

  async function deleteReadingHistoryEntry(id: string) {
    await authFetch(`/collection/entry/${entry!.id}/reading-history/${id}`, { method: 'DELETE' })
    await refreshReadingHistory()
  }

  async function addReadingHistoryEntry(dto: { startedAt: string; finishedAt: string; isDnf: boolean; notes: string }) {
    setReadingHistorySaving(true)
    try {
      await authFetch(`/collection/entry/${entry!.id}/reading-history`, {
        method: 'POST',
        body: JSON.stringify({
          startedAt: dto.startedAt || undefined,
          finishedAt: dto.finishedAt || undefined,
          isDnf: dto.isDnf,
          notes: dto.notes || undefined,
        }),
      })
      closeReadingHistoryAdd()
      await refreshReadingHistory()
    } finally {
      setReadingHistorySaving(false)
    }
  }

  // ── Computed values ───────────────────────────────────────────────────────

  const timeSrc = entry.purchaseGroup?.purchasedAt ?? entry.acquiredAt ?? entry.addedAt
  const pg = entry.purchaseGroup
  const isFromSubscription = !!entry.subscriptionEntryId

  // Per-book price editing (only meaningful for a multi-book purchase group) — same
  // all-or-nothing rule as Add to Collection: fill in any book price and every book needs one,
  // with the total below calculated automatically from them.
  const pgBookEntries = pg?.bookEntries ?? []
  const perBookPriceMode = pgBookEntries.length > 1 && pgBookEntries.some(be => (editEntryPrices[be.id] ?? '').trim() !== '')
  const editEntryPriceSum = pgBookEntries.reduce((sum, be) => {
    const raw = (editEntryPrices[be.id] ?? '').trim()
    return sum + (raw === '' ? 0 : parseDecimalInput(raw))
  }, 0)

  // Cost calculations from purchase group
  const pgTotal = pg ? parseFloat(String(pg.totalAmount)) : null
  const pgShipping = pg?.shippingAmount ? parseFloat(String(pg.shippingAmount)) : null
  const pgDate = pg?.purchasedAt?.slice(0, 10) ?? ''

  function toPgCurrency(amount: number, fromCurrency: string, date: string): number {
    if (!pg || fromCurrency === pg.currency) return amount
    const rate = rates[`${fromCurrency}:${pg.currency}:${date}`]
    return rate ? amount * rate : amount
  }

  const pgFeesTotal = pg ? (pg.fees ?? []).reduce((acc, f) => {
    const d = f.date?.slice(0, 10) ?? pgDate
    return acc + toPgCurrency(parseFloat(f.amount), f.currency, d)
  }, 0) : 0
  const pgDiscountsTotal = pg ? (pg.discounts ?? []).reduce((acc, d) => {
    const date = (d as any).date?.slice(0, 10) ?? pgDate
    return acc + toPgCurrency(parseFloat(d.amount), d.currency, date)
  }, 0) : 0
  const pgRefundsTotal = pg ? (pg.refunds ?? []).reduce((acc, r) => {
    const d = r.date?.slice(0, 10) ?? pgDate
    return acc + toPgCurrency(parseFloat(r.amount), r.currency, d)
  }, 0) : 0
  const grandTotal = pgTotal !== null
    ? pgTotal + (pgShipping ?? 0) + pgFeesTotal - pgDiscountsTotal - pgRefundsTotal
    : null
  const hasBreakdown = pgShipping !== null || pgFeesTotal > 0 || pgDiscountsTotal > 0 || pgRefundsTotal > 0

  // For P/L — use grandTotal per book (divide by set size), converted to sale currency
  const saleCur = entry.saleCurrency ?? pg?.currency ?? null
  const pgCur = pg?.currency ?? null
  const pgBookCount = pg?._count?.bookEntries ?? 1
  const costPerBook = grandTotal !== null ? grandTotal / Math.max(pgBookCount, 1) : null
  let costForPL: number | null = null
  if (costPerBook !== null && pgCur) {
    if (!saleCur || saleCur === pgCur) {
      costForPL = costPerBook
    } else {
      // convert costPerBook from purchase currency to sale currency using purchase date
      const rateKey = `${pgCur}:${saleCur}:${pgDate}`
      const rate = rates[rateKey]
      costForPL = rate ? costPerBook * rate : null
    }
  }
  const profit = entry.salePrice && costForPL !== null
    ? parseFloat(entry.salePrice) - costForPL
    : null
  const profitCurrency = saleCur

  // Currency conversion helper — converts to userCurrency (preferred display currency)
  function converted(amount: number, fromCurrency: string | null, date?: string): string | null {
    if (!fromCurrency || !userCurrency || fromCurrency === userCurrency) return null
    const dateKey = date?.slice(0, 10) ?? ''
    const rate = rates[`${fromCurrency}:${userCurrency}:${dateKey}`]
    if (!rate) return null
    return `≈ ${(amount * rate).toFixed(2)} ${userCurrency}`
  }

  // Converts to purchase currency (pg.currency) — shown for fees/discounts in a different currency
  function convertedToPg(amount: number, fromCurrency: string | null, date?: string): string | null {
    const pgCur = pg?.currency
    if (!fromCurrency || !pgCur || fromCurrency === pgCur) return null
    const dateKey = date?.slice(0, 10) ?? ''
    const rate = rates[`${fromCurrency}:${pgCur}:${dateKey}`]
    if (!rate) return null
    return `≈ ${(amount * rate).toFixed(2)} ${pgCur}`
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const CARD = 'rounded-lg p-4 flex flex-col gap-3'
  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)' }

  return (
    <div className="space-y-3">

      {/* Copy switcher — shown when user has multiple copies of the same edition */}
      {allEntries.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-navy-500 mr-1">Copy:</span>
          {allEntries.map((e, i) => (
            <button
              key={e.id}
              onClick={() => { setSelectedCopyIdx(i); setEntry(allEntries[i]) }}
              className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                i === selectedCopyIdx
                  ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                  : 'border-navy-700 text-navy-400 hover:border-navy-500'
              }`}
            >
              #{i + 1}
            </button>
          ))}
        </div>
      )}

      {/* 2-column layout: left=costs, right=status+tracking+tags+history */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">

        {/* Left column: Purchase cost + Sale details */}
        <div className="flex flex-col gap-3">

        {/* Purchase cost card */}
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Wallet size={11} /> Purchase cost
            </p>
            <div className="flex items-center gap-2">
              {pg?.isSecondHand && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center gap-1">
                  🔄 2nd hand{pg.sourcePlatform ? ` · ${pg.sourcePlatform}` : ''}
                </span>
              )}
              {!editingPurchase && (
                <button onClick={openPurchaseEdit} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  <Pencil size={11} /> {pg ? 'Edit costs' : 'Add costs'}
                </button>
              )}
            </div>
          </div>

          {editingPurchase ? (
            <div className="flex flex-col gap-2">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Purchase date</label>
                <input type="date" value={editPurchasedAt} onChange={e => { setEditPurchasedAt(e.target.value); if (purchaseErrorField === 'date') { setSaveError(null); setPurchaseErrorField(null) } }} className={inpErr(INP, purchaseErrorField === 'date')} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Price</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={editTotalAmount}
                    disabled={perBookPriceMode}
                    onChange={e => { setEditTotalAmount(e.target.value); if (purchaseErrorField === 'amount') { setSaveError(null); setPurchaseErrorField(null) } }}
                    placeholder="0.00"
                    className={inpErr(INP_FLEX, purchaseErrorField === 'amount') + ' w-20' + (perBookPriceMode ? ' opacity-60 cursor-not-allowed' : '')}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Shipping</label>
                  <input type="number" step="0.01" min="0" value={editShippingAmount} onChange={e => { setEditShippingAmount(e.target.value); if (purchaseErrorField === 'shipping') { setSaveError(null); setPurchaseErrorField(null) } }} placeholder="0.00" className={inpErr(INP_FLEX, purchaseErrorField === 'shipping') + ' w-20'} />
                </div>
                <div className="w-24 shrink-0">
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Currency</label>
                  <select value={editCurrency} onChange={e => setEditCurrency(e.target.value)} className={INP}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Per-book price — only for a multi-book purchase group. Same all-or-nothing
                  rule as Add to Collection: fill in any book and every book needs a price. */}
              {pgBookEntries.length > 1 && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Per-book price</label>
                  <div className="flex flex-col gap-1.5">
                    {pgBookEntries.map(be => (
                      <div key={be.id} className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 truncate text-xs" style={{ color: 'var(--text-dim)' }}>
                          {be.edition?.book?.title ?? 'Book'}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={editEntryPrices[be.id] ?? ''}
                          onChange={e => {
                            setEditEntryPrices(prev => ({ ...prev, [be.id]: e.target.value }))
                            if (invalidPriceEntryIds.has(be.id)) {
                              setInvalidPriceEntryIds(prev => { const next = new Set(prev); next.delete(be.id); return next })
                              setSaveError(null)
                            }
                          }}
                          className={inpErr(INP_BASE, invalidPriceEntryIds.has(be.id)) + ' w-20 text-right shrink-0'}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    {perBookPriceMode
                      ? `Pricing books individually — fill in all ${pgBookEntries.length}, price above is calculated automatically.`
                      : 'Leave every book price blank to split the total price evenly — or price each book individually here instead.'}
                  </p>
                </div>
              )}

              {/* Discounts list */}
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Discounts</label>
                <div className="flex flex-col gap-1.5">
                  {editDiscounts.map((d, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <input
                        value={d.name}
                        onChange={e => setEditDiscounts(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        placeholder="Name (e.g. promo code)"
                        className={INP_FLEX}
                      />
                      <input
                        type="number" step="0.01" min="0"
                        value={d.amount}
                        onChange={e => setEditDiscounts(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                        placeholder="0.00"
                        className={INP_BASE + ' w-24'}
                      />
                      <button
                        type="button"
                        onClick={() => setEditDiscounts(prev => prev.filter((_, j) => j !== i))}
                        className="text-navy-600 hover:text-red-400 transition-colors shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditDiscounts(prev => [...prev, { name: '', amount: '' }])}
                    className="flex items-center gap-1 text-xs pt-0.5 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Plus size={11} /> Add discount
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Notes</label>
                <input value={editPurchaseNotes} onChange={e => setEditPurchaseNotes(e.target.value)} placeholder="Any notes…" className={INP} />
              </div>

              {/* Fees management in edit mode */}
              {pg && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Fees</label>
                  <div className="flex flex-col gap-1.5">
                    {(pg.fees ?? []).map(fee => (
                      editingFeeId === fee.id ? (
                        <div key={fee.id} className="flex flex-col gap-1.5 pt-0.5">
                          {editFeeTemplateId ? (
                            <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-navy-700" style={{ color: 'var(--text-dim)' }}>
                              <span className="flex-1 truncate">{editFeeName}</span>
                              <span className="text-navy-500">{FEE_CATEGORIES.find(c => c.value === editFeeCategory)?.label ?? editFeeCategory}</span>
                            </div>
                          ) : (
                            <div className="flex gap-1.5">
                              <input value={editFeeName} onChange={e => { setEditFeeName(e.target.value); if (editFeeErrorField === 'name') { setEditFeeError(null); setEditFeeErrorField(null) } }} placeholder="Fee name" className={inpErr(INP_FLEX, editFeeErrorField === 'name')} />
                              <select value={editFeeCategory} onChange={e => setEditFeeCategory(e.target.value)} className={INP_BASE + ' w-28'}>
                                {FEE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            <input type="number" step="0.01" min="0" value={editFeeAmount} onChange={e => { setEditFeeAmount(e.target.value); if (editFeeErrorField === 'amount') { setEditFeeError(null); setEditFeeErrorField(null) } }} placeholder="0.00" className={inpErr(INP_BASE, editFeeErrorField === 'amount') + ' w-20'} style={{ MozAppearance: 'textfield' } as React.CSSProperties} />
                            <select value={editFeeCurrency} onChange={e => setEditFeeCurrency(e.target.value)} className={INP_BASE + ' w-20'}>
                              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <input type="date" value={editFeeDate} onChange={e => { setEditFeeDate(e.target.value); if (editFeeErrorField === 'date') { setEditFeeError(null); setEditFeeErrorField(null) } }} className={inpErr(INP, editFeeErrorField === 'date')} />
                          {editFeeError && <p className="text-xs text-red-400">{editFeeError}</p>}
                          <div className="flex gap-1.5">
                            <button onClick={saveEditFee} disabled={savingFee} className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 transition-colors disabled:opacity-50">
                              <Check size={11} /> Save
                            </button>
                            <button onClick={() => { setEditingFeeId(null); setEditFeeError(null); setEditFeeErrorField(null) }} className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-navy-700 text-navy-400 hover:border-navy-500 transition-colors">
                              <X size={11} /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div key={fee.id} className="flex items-center gap-1.5 text-xs">
                          <span className="flex-1 truncate" style={{ color: 'var(--text-dim)' }}>{fee.name}</span>
                          <span className="text-navy-500">{FEE_CATEGORIES.find(c => c.value === fee.category)?.label ?? fee.category}</span>
                          <span style={{ color: 'var(--text-dim)' }}>{parseFloat(fee.amount).toFixed(2)} {fee.currency}</span>
                          <span className="text-navy-500">{fee.date ? fee.date.slice(0, 10) : ''}</span>
                          <button onClick={() => openEditFee(fee)} className="text-navy-600 hover:text-brand-400 transition-colors shrink-0">
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => deleteFee(fee.id)} className="text-navy-600 hover:text-red-400 transition-colors shrink-0">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )
                    ))}
                    {addingFee ? (
                      <div className="flex flex-col gap-1.5 pt-0.5">
                        {feeTemplates.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {feeTemplates.map(t => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  setNewFeeTemplateId(t.id)
                                  setNewFeeName(t.name)
                                  if (t.defaultAmount) setNewFeeAmount(String(t.defaultAmount))
                                  if (t.defaultCurrency) setNewFeeCurrency(t.defaultCurrency)
                                  if (t.category) setNewFeeCategory(t.category)
                                }}
                                className={`px-2 py-0.5 rounded text-xs border transition-colors ${newFeeTemplateId === t.id ? 'border-brand-500/60 text-brand-400' : 'border-navy-600 text-navy-400 hover:border-brand-500/40 hover:text-brand-400'}`}
                              >
                                {t.name}
                              </button>
                            ))}
                          </div>
                        )}
                        {newFeeTemplateId ? (
                          <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-navy-700" style={{ color: 'var(--text-dim)' }}>
                            <span className="flex-1 truncate">{newFeeName}</span>
                            <span className="text-navy-500">{FEE_CATEGORIES.find(c => c.value === newFeeCategory)?.label ?? newFeeCategory}</span>
                            <button type="button" onClick={clearNewFeeTemplate} className="text-navy-500 hover:text-red-400 transition-colors shrink-0">
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1.5">
                            <input value={newFeeName} onChange={e => { setNewFeeName(e.target.value); if (newFeeErrorField === 'name') { setNewFeeError(null); setNewFeeErrorField(null) } }} placeholder="Fee name" className={inpErr(INP_FLEX, newFeeErrorField === 'name')} />
                            <select value={newFeeCategory} onChange={e => setNewFeeCategory(e.target.value)} className={INP_BASE + ' w-28'}>
                              {FEE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          </div>
                        )}
                        <div className="flex gap-1.5">
                          <input type="number" step="0.01" min="0" value={newFeeAmount} onChange={e => { setNewFeeAmount(e.target.value); if (newFeeErrorField === 'amount') { setNewFeeError(null); setNewFeeErrorField(null) } }} placeholder="0.00" className={inpErr(INP_BASE, newFeeErrorField === 'amount') + ' w-20'} />
                          <select value={newFeeCurrency} onChange={e => setNewFeeCurrency(e.target.value)} className={INP_BASE + ' w-20'}>
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <input type="date" value={newFeeDate} onChange={e => { setNewFeeDate(e.target.value); if (newFeeErrorField === 'date') { setNewFeeError(null); setNewFeeErrorField(null) } }} className={inpErr(INP, newFeeErrorField === 'date')} />
                        {newFeeError && <p className="text-xs text-red-400">{newFeeError}</p>}
                        <div className="flex gap-1.5">
                          <button onClick={saveNewFee} disabled={savingFee} className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 transition-colors disabled:opacity-50">
                            <Check size={11} /> Add
                          </button>
                          <button onClick={() => { setAddingFee(false); setNewFeeError(null); setNewFeeErrorField(null) }} className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-navy-700 text-navy-400 hover:border-navy-500 transition-colors">
                            <X size={11} /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={openAddFee} className="flex items-center gap-1 text-xs pt-0.5 transition-colors" style={{ color: 'var(--text-muted)' }}>
                        <Plus size={11} /> Add fee
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Refunds management in edit mode */}
              {pg && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Refunds</label>
                  <div className="flex flex-col gap-1.5">
                    {(pg.refunds ?? []).map(r => (
                      <div key={r.id} className="flex items-center gap-1.5 text-xs">
                        <span className="flex-1 truncate text-orange-400">{r.reason ?? 'Refund'}</span>
                        <span className="text-orange-400">{parseFloat(r.amount).toFixed(2)} {r.currency}</span>
                        <span className="text-navy-500">{r.date ? r.date.slice(0, 10) : ''}</span>
                        <button onClick={() => deleteRefund(r.id)} className="text-navy-600 hover:text-red-400 transition-colors shrink-0">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                    {addingRefund ? (
                      <div className="flex flex-col gap-1.5 pt-0.5">
                        <div className="flex gap-1.5">
                          <input type="number" step="0.01" min="0" value={newRefundAmount} onChange={e => { setNewRefundAmount(e.target.value); if (refundErrorField === 'amount') { setRefundError(null); setRefundErrorField(null) } }} placeholder="0.00" className={inpErr(INP_BASE, refundErrorField === 'amount') + ' w-20'} />
                          <select value={newRefundCurrency} onChange={e => setNewRefundCurrency(e.target.value)} className={INP_BASE + ' w-20'}>
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input value={newRefundReason} onChange={e => setNewRefundReason(e.target.value)} placeholder="Reason (optional)" className={INP + ' flex-1'} />
                        </div>
                        <input type="date" value={newRefundDate} onChange={e => { setNewRefundDate(e.target.value); if (refundErrorField === 'date') { setRefundError(null); setRefundErrorField(null) } }} className={inpErr(INP, refundErrorField === 'date')} />
                        {refundError && <p className="text-xs text-red-400">{refundError}</p>}
                        <div className="flex gap-1.5">
                          <button onClick={saveNewRefund} disabled={savingRefund} className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-50">
                            <Check size={11} /> Add
                          </button>
                          <button onClick={() => { setAddingRefund(false); setRefundError(null); setRefundErrorField(null) }} className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-navy-700 text-navy-400 hover:border-navy-500 transition-colors">
                            <X size={11} /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setNewRefundAmount(''); setNewRefundCurrency(pg.currency); setNewRefundReason(''); setNewRefundDate(new Date().toISOString().slice(0, 10)); setRefundError(null); setRefundErrorField(null); setAddingRefund(true) }} className="flex items-center gap-1 text-xs pt-0.5 transition-colors" style={{ color: 'var(--text-muted)' }}>
                        <Plus size={11} /> Add refund
                      </button>
                    )}
                  </div>
                </div>
              )}

              <SaveCancelBtns onSave={savePurchase} onCancel={() => setEditingPurchase(false)} saving={savingPurchase} />
              {saveError && <p className="text-xs text-red-400">{saveError}</p>}
            </div>
          ) : (
            <div className="space-y-1.5 text-sm">
              {pg ? (
                <>
                  {/* Price row */}
                  <div className="flex justify-between items-baseline gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>Price</span>
                    <span className="text-right">
                      <span className="font-medium" style={{ color: 'var(--text-bright)' }}>
                        {pgTotal!.toFixed(2)} {pg.currency}
                      </span>
                      {converted(pgTotal!, pg.currency, pg.purchasedAt) && (
                        <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{converted(pgTotal!, pg.currency, pg.purchasedAt)}</span>
                      )}
                    </span>
                  </div>

                  {/* Shipping row */}
                  {pgShipping !== null && (
                    <div className="flex justify-between items-baseline gap-2">
                      <span style={{ color: 'var(--text-muted)' }}>Shipping</span>
                      <span className="text-right">
                        <span className="font-medium" style={{ color: 'var(--text-bright)' }}>
                          {pgShipping.toFixed(2)} {pg.currency}
                        </span>
                        {converted(pgShipping, pg.currency, pg.purchasedAt) && (
                          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{converted(pgShipping, pg.currency, pg.purchasedAt)}</span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Fee rows */}
                  {(pg.fees ?? []).map(fee => {
                    const amt = parseFloat(fee.amount)
                    return (
                      <div key={fee.id} className="flex justify-between items-baseline gap-2">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {fee.name}
                          {fee.date && <span className="ml-1 text-navy-600">{fee.date.slice(0, 10)}</span>}
                        </span>
                        <span className="text-right">
                          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{amt.toFixed(2)} {fee.currency}</span>
                          {convertedToPg(amt, fee.currency, fee.date) && (
                            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{convertedToPg(amt, fee.currency, fee.date)}</span>
                          )}
                          {converted(amt, fee.currency, fee.date) && (
                            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{converted(amt, fee.currency, fee.date)}</span>
                          )}
                        </span>
                      </div>
                    )
                  })}

                  {/* Discount rows */}
                  {(pg.discounts ?? []).map(d => {
                    const amt = parseFloat(d.amount)
                    return (
                      <div key={d.id} className="flex justify-between items-baseline gap-2">
                        <span className="text-xs text-green-400">− {d.name}</span>
                        <span className="text-right flex items-baseline gap-1.5">
                          <span>
                            <span className="text-xs text-green-400">−{amt.toFixed(2)} {d.currency}</span>
                            {convertedToPg(amt, d.currency, (d as any).date ?? pg.purchasedAt) && (
                              <span className="block text-xs text-green-500/60">{convertedToPg(amt, d.currency, (d as any).date ?? pg.purchasedAt)?.replace('≈', '≈ −')}</span>
                            )}
                            {converted(amt, d.currency, (d as any).date ?? pg.purchasedAt) && (
                              <span className="block text-xs text-green-500/60">{converted(amt, d.currency, (d as any).date ?? pg.purchasedAt)?.replace('≈', '≈ −')}</span>
                            )}
                          </span>
                          <button onClick={() => deleteDiscount(d.id)} className="text-navy-600 hover:text-red-400 transition-colors shrink-0">
                            <Trash2 size={11} />
                          </button>
                        </span>
                      </div>
                    )
                  })}

                  {/* Refund rows */}
                  {(pg.refunds ?? []).map(r => {
                    const amt = parseFloat(r.amount)
                    return (
                      <div key={r.id} className="flex justify-between items-baseline gap-2">
                        <span className="text-xs text-orange-400">
                          ↩ {r.reason ?? 'Refund'}
                          {r.date && <span className="ml-1 text-orange-500/50">{r.date.slice(0, 10)}</span>}
                        </span>
                        <span className="text-right">
                          <span className="text-xs text-orange-400">−{amt.toFixed(2)} {r.currency}</span>
                          {convertedToPg(amt, r.currency, r.date) && (
                            <span className="block text-xs text-orange-500/60">{convertedToPg(amt, r.currency, r.date)?.replace('≈', '≈ −')}</span>
                          )}
                          {converted(amt, r.currency, r.date) && (
                            <span className="block text-xs text-orange-500/60">{converted(amt, r.currency, r.date)?.replace('≈', '≈ −')}</span>
                          )}
                        </span>
                      </div>
                    )
                  })}

                  {/* Grand total */}
                  {grandTotal !== null && hasBreakdown && (
                    <div className="flex justify-between items-baseline gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="font-medium" style={{ color: 'var(--text-bright)' }}>Total</span>
                      <span className="text-right">
                        <span className="font-semibold" style={{ color: 'var(--text-bright)' }}>
                          {grandTotal.toFixed(2)} {pg.currency}
                        </span>
                        {converted(grandTotal, pg.currency, pg.purchasedAt) && (
                          <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{converted(grandTotal, pg.currency, pg.purchasedAt)}</span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Per-book price for bundles — real base price allocation when set (falls
                      back to an equal split), plus this book's equal share of shipping/fees
                      (those are still split evenly across the set, by design). */}
                  {(() => {
                    const bookCount = pg._count?.bookEntries ?? 1
                    if (bookCount <= 1) return null
                    const equalExtrasShare = ((pgShipping ?? 0) + pgFeesTotal - pgDiscountsTotal - pgRefundsTotal) / bookCount
                    const base = entry.basePrice != null ? parseFloat(entry.basePrice) : (pgTotal ?? 0) / bookCount
                    const perBook = base + equalExtrasShare
                    return (
                      <div className="flex justify-between items-baseline gap-2 pt-1.5" style={{ borderTop: '1px solid var(--border)' }}>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Per book <span className="opacity-60">({bookCount} in set)</span>
                        </span>
                        <span className="text-right">
                          <span className="text-xs font-semibold text-brand-400">
                            {perBook.toFixed(2)} {pg.currency}
                          </span>
                          {converted(perBook, pg.currency, pg.purchasedAt) && (
                            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{converted(perBook, pg.currency, pg.purchasedAt)}</span>
                          )}
                        </span>
                      </div>
                    )
                  })()}

                  {/* Purchase date */}
                  <p className="text-xs pt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Purchased {fmtDate(pg.purchasedAt)}
                  </p>
                </>
              ) : (
                <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                  {isFromSubscription ? 'Costs managed via subscription' : 'No costs recorded'}
                </p>
              )}
            </div>
          )}
        </div>

          {/* Sale details — shown in left column when SOLD */}
          {entry.ownershipStatus === 'SOLD' && (
            <div className="rounded-xl border p-4 mt-0" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Sale details</p>
                {!editingSale && !(entry.saleGroupEntryCount && entry.saleGroupEntryCount > 1) && (
                  <button onClick={openSaleEdit} className="flex items-center gap-1 text-xs transition-colors" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-bright)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                    <Pencil size={11} /> Edit
                  </button>
                )}
              </div>
              {entry.saleGroupEntryCount && entry.saleGroupEntryCount > 1 && (
                <div className="flex items-center gap-1.5 mb-3 text-xs px-2 py-1.5 rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                  <Package size={11} />
                  <span>Part of a set{entry.saleGroupTitle ? `: ${entry.saleGroupTitle}` : ''}</span>
                </div>
              )}
              {editingSale ? (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Sale price</label>
                      <input type="number" step="0.01" min="0" value={editSalePrice} onChange={e => setEditSalePrice(e.target.value)} placeholder="0.00" className={INP} />
                    </div>
                    <div className="w-24">
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Currency</label>
                    <select value={editSaleCurrency} onChange={e => setEditSaleCurrency(e.target.value)} className={INP}>
                      <option value="">—</option>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Sale date</label>
                  <input type="date" value={editSaleDate} onChange={e => setEditSaleDate(e.target.value)} className={INP} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Venue / platform</label>
                  <select value={editSaleVenue} onChange={e => setEditSaleVenue(e.target.value)} className={INP}>
                    <option value="">— Select platform —</option>
                    {SALE_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  {editSaleVenue === 'other' && (
                    <input value={editSaleVenueCustom} onChange={e => setEditSaleVenueCustom(e.target.value)} placeholder="Platform name…" className={`${INP} mt-1.5`} />
                  )}
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Notes</label>
                  <input value={editSaleNotes} onChange={e => setEditSaleNotes(e.target.value)} placeholder="Any notes…" className={INP} />
                </div>
                <SaveCancelBtns onSave={saveSale} onCancel={() => setEditingSale(false)} saving={savingSale} />
              </div>
            ) : (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between items-baseline gap-2">
                  <span style={{ color: 'var(--text-muted)' }}>Sale price</span>
                  <span className="text-right">
                    {entry.salePrice ? (
                      <span className="font-medium" style={{ color: 'var(--text-bright)' }}>
                        {parseFloat(entry.salePrice).toFixed(2)} {entry.saleCurrency ?? ''}
                      </span>
                    ) : (
                      <span className="italic text-xs" style={{ color: 'var(--text-muted)' }}>Not set</span>
                    )}
                  </span>
                </div>
                {entry.saleDate && (
                  <div className="flex justify-between items-baseline gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>Date</span>
                    <span className="font-medium" style={{ color: 'var(--text-bright)' }}>{fmtDate(entry.saleDate)}</span>
                  </div>
                )}
                {entry.saleVenue && (
                  <div className="flex justify-between items-baseline gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>Venue</span>
                    <span className="font-medium" style={{ color: 'var(--text-bright)' }}>{entry.saleVenue}</span>
                  </div>
                )}
                {entry.saleNotes && (
                  <div className="flex justify-between items-baseline gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>Notes</span>
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{entry.saleNotes}</span>
                  </div>
                )}
                {profit !== null && (
                  <div className="flex justify-between items-baseline gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-medium" style={{ color: 'var(--text-bright)' }}>P / L</span>
                    <span className={`font-semibold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {profit >= 0 ? '+' : ''}{profit.toFixed(2)} {profitCurrency ?? ''}
                    </span>
                  </div>
                )}
              </div>
            )}
            </div>
          )}
        </div>

        {/* Right column: Status + Tracking + Tags + Ownership history */}
        <div className="flex flex-col gap-3">

        {/* Status card — collection meta + status badges */}
        <div className={CARD} style={cardStyle}>
          {/* Collection meta line */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <Clock size={10} className="inline mr-1 -mt-px" />
              In your collection · <span style={{ color: 'var(--text-dim)' }}>{timeInCollection(timeSrc, entry.ownershipStatus === 'SOLD' ? (entry.saleDate ?? null) : null)}</span>
              {(pg?.purchasedAt) && (
                <span className="ml-1" style={{ color: 'var(--text-muted)' }}>
                  (from {fmtDate(pg.purchasedAt)})
                </span>
              )}
            </span>
            {isFromSubscription && (
              <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                From subscription
              </span>
            )}
          </div>

          {/* Status badges — each is an inline dropdown */}
          {activeDropdown && (
            <div className="fixed inset-0 z-[5]" onClick={() => setActiveDropdown(null)} />
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Ownership dropdown */}
            <div className="relative">
              <button
                onClick={() => setActiveDropdown(prev => prev === 'ownership' ? null : 'ownership')}
                disabled={savingStatus}
                className={`${OWNERSHIP_COLORS[entry.ownershipStatus] ?? 'badge-owned'} px-2.5 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 transition-opacity hover:opacity-80 disabled:opacity-50`}
              >
                {fmtOwnership(entry.ownershipStatus)}
                <ChevronDown size={10} />
              </button>
              {activeDropdown === 'ownership' && (
                <div className="absolute top-full left-0 mt-1 z-10 rounded-lg shadow-xl border flex flex-col py-1 min-w-[130px]" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
                  {OWNERSHIP_STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => quickSaveStatus('ownershipStatus', s)}
                      className={`text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${s === entry.ownershipStatus ? 'font-semibold' : ''}`}
                      style={{ color: s === entry.ownershipStatus ? 'var(--text-bright)' : 'var(--text-dim)' }}
                    >
                      {fmtOwnership(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reading dropdown */}
            <div className="relative">
              <button
                onClick={() => setActiveDropdown(prev => prev === 'reading' ? null : 'reading')}
                disabled={savingStatus}
                className={`${READING_COLORS[entry.readingStatus] ?? 'badge-unread'} px-2 py-0.5 rounded-full text-xs flex items-center gap-1 transition-opacity hover:opacity-80 disabled:opacity-50`}
              >
                {entry.readingStatus}
                <ChevronDown size={10} />
              </button>
              {activeDropdown === 'reading' && (
                <div className="absolute top-full left-0 mt-1 z-10 rounded-lg shadow-xl border flex flex-col py-1 min-w-[110px]" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
                  {READING_STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => quickSaveStatus('readingStatus', s)}
                      className={`text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${s === entry.readingStatus ? 'font-semibold' : ''}`}
                      style={{ color: s === entry.readingStatus ? 'var(--text-bright)' : 'var(--text-dim)' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Signature dropdown — always shown (unsigned when null) */}
            <div className="relative">
              <button
                onClick={() => setActiveDropdown(prev => prev === 'signature' ? null : 'signature')}
                disabled={savingStatus}
                className="badge-signed px-2 py-0.5 rounded-full text-xs uppercase flex items-center gap-1 transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {SIGNATURE_LABELS[entry.signatureType ?? 'unsigned'] ?? 'Unsigned'}
                <ChevronDown size={10} />
              </button>
              {activeDropdown === 'signature' && (
                <div className="absolute top-full left-0 mt-1 z-10 rounded-lg shadow-xl border flex flex-col py-1 min-w-[150px]" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
                  <button
                    onClick={() => quickSaveStatus('signatureType', '')}
                    className={`text-left px-3 py-1.5 text-xs uppercase hover:bg-white/5 transition-colors ${!entry.signatureType ? 'font-semibold' : ''}`}
                    style={{ color: !entry.signatureType ? 'var(--text-bright)' : 'var(--text-dim)' }}
                  >
                    Unsigned
                  </button>
                  {SIGNATURE_TYPES.filter(s => s !== 'unsigned').map(s => (
                    <button
                      key={s}
                      onClick={() => quickSaveStatus('signatureType', s)}
                      className={`text-left px-3 py-1.5 text-xs uppercase hover:bg-white/5 transition-colors ${s === entry.signatureType ? 'font-semibold' : ''}`}
                      style={{ color: s === entry.signatureType ? 'var(--text-bright)' : 'var(--text-dim)' }}
                    >
                      {SIGNATURE_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Print pill — shown only when reprints exist for this edition */}
          {saleEditions.some(se => se.isReprint) && (() => {
            const currentPrintLabel = (entry.isOriginalPrint && !entry.saleAnnouncementEditionId) || (entry.saleAnnouncementEdition && !entry.saleAnnouncementEdition.isReprint)
              ? '📗 Original print'
              : entry.saleAnnouncementEdition
                ? (() => {
                    const saDate = entry.saleAnnouncementEdition.announcement.tiers?.[0]?.date ?? entry.saleAnnouncementEdition.announcement.generalSaleDate
                    const sa = saDate ? new Date(saDate) : null
                    const dateStr = sa ? sa.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : null
                    return dateStr ? `🔁 Reprint · ${dateStr}` : `🔁 Reprint — ${entry.saleAnnouncementEdition.announcement.title}`
                  })()
                : '❓ Unknown print'
            return (
              <div className="relative mt-1">
                <button
                  onClick={() => setActiveDropdown(prev => prev === 'print' ? null : 'print')}
                  disabled={savingPrint}
                  className="badge-signed px-2 py-0.5 rounded-full text-xs flex items-center gap-1 transition-opacity hover:opacity-80 disabled:opacity-50 max-w-[280px] truncate"
                >
                  <span className="truncate">{currentPrintLabel}</span>
                  <ChevronDown size={10} className="shrink-0" />
                </button>
                {activeDropdown === 'print' && (
                  <div className="absolute top-full left-0 mt-1 z-10 rounded-lg shadow-xl border flex flex-col py-1 min-w-[200px] max-w-[320px]" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
                    <button
                      onClick={() => { savePrint(null, false); setActiveDropdown(null) }}
                      className={`text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors truncate ${!entry.saleAnnouncementEditionId && !entry.isOriginalPrint ? 'font-semibold' : ''}`}
                      style={{ color: !entry.saleAnnouncementEditionId && !entry.isOriginalPrint ? 'var(--text-bright)' : 'var(--text-dim)' }}
                    >
                      ❓ Unknown print
                    </button>
                    <button
                      onClick={() => { savePrint(null, true); setActiveDropdown(null) }}
                      className={`text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors truncate ${entry.isOriginalPrint && !entry.saleAnnouncementEditionId ? 'font-semibold' : ''}`}
                      style={{ color: entry.isOriginalPrint && !entry.saleAnnouncementEditionId ? 'var(--text-bright)' : 'var(--text-dim)' }}
                    >
                      📗 Original print
                    </button>
                    {saleEditions.filter(se => se.isReprint).map(se => {
                      const saDate = se.announcement.generalSaleDate
                      const sa = saDate ? new Date(saDate) : null
                      const dateStr = sa ? sa.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : null
                      const isActive = entry.saleAnnouncementEditionId === se.id
                      return (
                        <button
                          key={se.id}
                          onClick={() => { savePrint(se.id); setActiveDropdown(null) }}
                          className={`text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors truncate ${isActive ? 'font-semibold' : ''}`}
                          style={{ color: isActive ? 'var(--text-bright)' : 'var(--text-dim)' }}
                        >
                          🔁 {dateStr ? `${dateStr} — ${se.announcement.title}` : `Reprint — ${se.announcement.title}`}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Tracking card — multi */}
        <div className="rounded-xl border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <p className={SEC_HDR}><span className="flex items-center gap-1.5"><Package size={11} /> Tracking</span></p>
          <div className="flex flex-col gap-2">
            {entry.trackingNumbers.map((tn) => (
              <div key={tn.id} className="flex flex-col gap-1">
                {editingTrackingId === tn.id ? (
                  <div className="flex flex-col gap-1.5">
                    <input
                      value={editTrackingNumber}
                      onChange={e => setEditTrackingNumber(e.target.value)}
                      placeholder="Tracking number…"
                      className={INP}
                      autoFocus
                    />
                    <input
                      value={editTrackingLabel}
                      onChange={e => setEditTrackingLabel(e.target.value)}
                      placeholder="Label (optional)"
                      className={INP}
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={async () => {
                          if (!editTrackingNumber.trim()) return
                          setSavingEditTracking(true)
                          try {
                            await authFetch(`/collection/${entry.id}/tracking/${tn.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ trackingNumber: editTrackingNumber.trim(), label: editTrackingLabel.trim() || null }),
                            })
                            await refetchEntry()
                            setEditingTrackingId(null)
                          } finally {
                            setSavingEditTracking(false)
                          }
                        }}
                        disabled={savingEditTracking || !editTrackingNumber.trim()}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-navy-950 font-semibold transition-colors"
                      >
                        {savingEditTracking ? '…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingTrackingId(null)}
                        className="text-xs py-1.5 px-3 rounded-lg border border-navy-700 text-navy-400 hover:text-navy-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      {tn.label && <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{tn.label}</p>}
                      <a
                        href={`https://parcelsapp.com/en/tracking/${encodeURIComponent(tn.trackingNumber)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm hover:text-brand-400 transition-colors flex items-center gap-1 break-all"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {tn.trackingNumber}
                        <ExternalLink size={11} className="shrink-0" />
                      </a>
                    </div>
                    <EditBtn
                      onClick={() => {
                        setEditingTrackingId(tn.id)
                        setEditTrackingNumber(tn.trackingNumber)
                        setEditTrackingLabel(tn.label ?? '')
                      }}
                    />
                    <button
                      onClick={async () => {
                        await authFetch(`/collection/${entry.id}/tracking/${tn.id}`, { method: 'DELETE' })
                        await refetchEntry()
                      }}
                      className="p-1 text-navy-500 hover:text-red-400 transition-colors shrink-0"
                      title="Remove"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {addingTracking ? (
              <div className="flex flex-col gap-1.5 mt-1">
                <input
                  value={newTrackingNumber}
                  onChange={e => setNewTrackingNumber(e.target.value)}
                  placeholder="Tracking number…"
                  className={INP}
                  autoFocus
                />
                <input
                  value={newTrackingLabel}
                  onChange={e => setNewTrackingLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className={INP}
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={async () => {
                      if (!newTrackingNumber.trim()) return
                      setSavingTracking(true)
                      try {
                        await authFetch(`/collection/${entry.id}/tracking`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ trackingNumber: newTrackingNumber.trim(), label: newTrackingLabel.trim() || undefined }),
                        })
                        await refetchEntry()
                        setNewTrackingNumber('')
                        setNewTrackingLabel('')
                        setAddingTracking(false)
                      } finally {
                        setSavingTracking(false)
                      }
                    }}
                    disabled={savingTracking || !newTrackingNumber.trim()}
                    className="flex-1 text-xs py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-navy-950 font-semibold transition-colors"
                  >
                    {savingTracking ? '…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setAddingTracking(false); setNewTrackingNumber(''); setNewTrackingLabel('') }}
                    className="text-xs py-1.5 px-3 rounded-lg border border-navy-700 text-navy-400 hover:text-navy-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingTracking(true)} className="text-sm hover:text-brand-400 transition-colors flex items-center gap-1 text-left mt-1" style={{ color: 'var(--text-muted)' }}>
                + Add tracking number
              </button>
            )}
          </div>
        </div>

        {/* Order Number card */}
        <div className="rounded-xl border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <p className={SEC_HDR}><span className="flex items-center gap-1.5"><Hash size={11} /> Order Number</span></p>
          {editingOrderNumber ? (
            <div className="flex flex-col gap-2">
              <input value={editOrderNumber} onChange={e => setEditOrderNumber(e.target.value)} placeholder="Order number…" className={INP} />
              <SaveCancelBtns onSave={saveOrderNumber} onCancel={() => setEditingOrderNumber(false)} saving={savingOrderNumber} />
            </div>
          ) : entry.orderNumber ? (
            <div className="flex items-center gap-1.5">
              <span className="flex-1 min-w-0 text-sm text-navy-200">{entry.orderNumber}</span>
              <EditBtn onClick={openOrderNumberEdit} />
              <button
                onClick={deleteOrderNumber}
                disabled={deletingOrderNumber}
                className="p-1 text-navy-500 hover:text-red-400 transition-colors disabled:opacity-40 shrink-0"
                title="Remove order number"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ) : (
            <button onClick={openOrderNumberEdit} className="text-sm hover:text-brand-400 transition-colors flex items-center gap-1 text-left" style={{ color: 'var(--text-muted)' }}>
              + Add order number
            </button>
          )}
        </div>

          {/* Tags — below Tracking */}
          <div className="rounded-xl border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <p className={SEC_HDR}><span className="flex items-center gap-1.5"><Tag size={11} /> Tags</span></p>
            <TagEditor
              entryId={entry.id}
              tags={entry.tags}
              allTags={allUserTags}
              onSaved={handleTagsSaved}
            />
          </div>

          {/* Ownership history — always directly under tags */}
          <div className={CARD} style={cardStyle}>
            <button
              onClick={toggleHistory}
              className="flex items-center gap-1.5 text-xs transition-colors w-full text-left"
              style={{ color: 'var(--text-muted)' }}
            >
              {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showHistory ? 'Hide' : 'Show'} ownership history
            </button>
            {showHistory && (
              <div className="pt-1 space-y-1">
                {loadingHistory ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
                ) : !history || history.length === 0 ? (
                  <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No history recorded</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {history.map((h) =>
                      historyEditId === h.id ? (
                        <div key={h.id} className="flex items-center gap-1.5 flex-wrap">
                          <select
                            value={historyEditStatus}
                            onChange={e => setHistoryEditStatus(e.target.value)}
                            className="text-xs bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-navy-200 focus:outline-none focus:border-brand-400"
                          >
                            {OWNERSHIP_STATUSES.map(s => <option key={s} value={s}>{fmtOwnership(s)}</option>)}
                          </select>
                          <input
                            type="date"
                            value={historyEditDate}
                            onChange={e => setHistoryEditDate(e.target.value)}
                            className="text-xs bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-navy-200 focus:outline-none focus:border-brand-400"
                          />
                          <button
                            onClick={() => saveHistoryEdit(h.id)}
                            disabled={historySaving}
                            className="text-xs text-brand-400 hover:text-brand-300 disabled:opacity-50"
                          ><Check size={11} /></button>
                          <button onClick={() => setHistoryEditId(null)} className="text-xs text-navy-500 hover:text-navy-300"><X size={11} /></button>
                        </div>
                      ) : (
                        <div key={h.id} className="group flex items-center gap-2 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-navy-500 shrink-0" />
                          <span className={`px-2 py-0.5 rounded-full font-medium ${OWNERSHIP_COLORS[h.status] ?? 'bg-navy-700 text-navy-300'}`}>
                            {fmtOwnership(h.status)}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>{fmtDate(h.changedAt)}</span>
                          <span className="ml-auto flex items-center gap-2">
                            <button
                              onClick={() => { setHistoryEditId(h.id); setHistoryEditStatus(h.status); setHistoryEditDate(h.changedAt.slice(0, 10)) }}
                              className="text-navy-500 hover:text-brand-400 transition-colors p-1.5 -m-1.5"
                            ><Pencil size={12} /></button>
                            <button
                              onClick={() => deleteHistoryEntry(h.id)}
                              className="text-navy-500 hover:text-red-400 transition-colors p-1.5 -m-1.5"
                            ><Trash2 size={12} /></button>
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Add entry */}
                {historyAddOpen ? (
                  <AddHistoryEntryForm
                    onSave={addHistoryEntry}
                    onCancel={() => closeHistoryAdd()}
                    saving={historySaving}
                  />
                ) : (
                  <button
                    onClick={() => openHistoryAdd()}
                    className="flex items-center gap-1 text-xs mt-1 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Plus size={10} /> Add entry
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Reading history */}
          <div className={CARD} style={cardStyle}>
            <button
              onClick={toggleReadingHistory}
              className="flex items-center gap-1.5 text-xs transition-colors w-full text-left"
              style={{ color: 'var(--text-muted)' }}
            >
              {showReadingHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showReadingHistory ? 'Hide' : 'Show'} reading history
            </button>
            {showReadingHistory && (
              <div className="pt-1 space-y-1">
                {loadingReadingHistory ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
                ) : !readingHistory || readingHistory.length === 0 ? (
                  <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No reading records</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {readingHistory.map((rh) =>
                      readingHistoryEditId === rh.id ? (
                        <div key={rh.id} className="flex flex-col gap-1.5 text-xs">
                          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center">
                            <label className="text-navy-500 shrink-0">Started</label>
                            <input
                              type="date"
                              value={readingHistoryEditStartedAt}
                              onChange={e => setReadingHistoryEditStartedAt(e.target.value)}
                              className="bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-navy-200 focus:outline-none focus:border-brand-400 text-xs w-full"
                            />
                            <label className="text-navy-500 shrink-0">Finished</label>
                            <input
                              type="date"
                              value={readingHistoryEditFinishedAt}
                              onChange={e => setReadingHistoryEditFinishedAt(e.target.value)}
                              className="bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-navy-200 focus:outline-none focus:border-brand-400 text-xs w-full"
                            />
                          </div>
                          <label className="flex items-center gap-1.5 text-navy-400 cursor-pointer w-fit">
                            <input
                              type="checkbox"
                              checked={readingHistoryEditIsDnf}
                              onChange={e => setReadingHistoryEditIsDnf(e.target.checked)}
                              className="accent-brand-400"
                            />
                            DNF
                          </label>
                          <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={readingHistoryEditNotes}
                            onChange={e => setReadingHistoryEditNotes(e.target.value)}
                            className="bg-navy-800 border border-navy-700 rounded px-1.5 py-0.5 text-navy-200 focus:outline-none focus:border-brand-400 text-xs w-full"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => saveReadingHistoryEdit(rh.id)} disabled={readingHistorySaving} className="text-brand-400 hover:text-brand-300 disabled:opacity-50"><Check size={11} /></button>
                            <button onClick={() => setReadingHistoryEditId(null)} className="text-navy-500 hover:text-navy-300"><X size={11} /></button>
                          </div>
                        </div>
                      ) : (
                        <div key={rh.id} className="group flex flex-col gap-0.5 text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-navy-500 shrink-0" />
                            {rh.isDnf && (
                              <span className="px-2 py-0.5 rounded-full font-medium badge-dnf">DNF</span>
                            )}
                            {!rh.isDnf && rh.finishedAt && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-900/60 text-emerald-400">READ</span>
                            )}
                            {!rh.isDnf && !rh.finishedAt && rh.startedAt && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-900/60 text-sky-400">READING</span>
                            )}
                            {rh.startedAt && (
                              <span style={{ color: 'var(--text-dim)' }}>Started {fmtDate(rh.startedAt)}</span>
                            )}
                            {rh.finishedAt && (
                              <span style={{ color: 'var(--text-dim)' }}>→ {fmtDate(rh.finishedAt)}</span>
                            )}
                            {!rh.startedAt && !rh.finishedAt && (
                              <span style={{ color: 'var(--text-muted)' }}>No dates recorded</span>
                            )}
                            <span className="ml-auto flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setReadingHistoryEditId(rh.id)
                                  setReadingHistoryEditStartedAt(rh.startedAt?.slice(0, 10) ?? '')
                                  setReadingHistoryEditFinishedAt(rh.finishedAt?.slice(0, 10) ?? '')
                                  setReadingHistoryEditIsDnf(rh.isDnf)
                                  setReadingHistoryEditNotes(rh.notes ?? '')
                                }}
                                className="text-navy-500 hover:text-brand-400 transition-colors p-1.5 -m-1.5"
                              ><Pencil size={12} /></button>
                              <button onClick={() => deleteReadingHistoryEntry(rh.id)} className="text-navy-500 hover:text-red-400 transition-colors p-1.5 -m-1.5"><Trash2 size={12} /></button>
                            </span>
                          </div>
                          {rh.notes && (
                            <p className="pl-5 text-xs italic" style={{ color: 'var(--text-muted)' }}>{rh.notes}</p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Add reading record */}
                {readingHistoryAddOpen ? (
                  <AddReadingHistoryForm
                    onSave={addReadingHistoryEntry}
                    onCancel={closeReadingHistoryAdd}
                    saving={readingHistorySaving}
                  />
                ) : (
                  <button
                    onClick={openReadingHistoryAdd}
                    className="flex items-center gap-1 text-xs mt-1 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Plus size={10} /> Add record
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

    </div>
  )
}
