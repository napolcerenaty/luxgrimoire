'use client'

import { useState, useEffect } from 'react'
import {
  ExternalLink, Pencil, Check, X, ChevronDown, ChevronUp,
  Clock, Tag, Package, Wallet, Plus, Trash2,
} from 'lucide-react'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PurchaseFee {
  id: string
  name: string
  amount: string
  currency: string
  category: string
  date: string
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
  fees: PurchaseFee[]
  discounts: PurchaseDiscount[]
  refunds: PurchaseRefund[]
}

interface CollectionEntry {
  id: string
  readingStatus: string
  ownershipStatus: string
  addedAt: string
  acquiredAt: string | null
  trackingNumber: string | null
  salePrice: string | null
  saleCurrency: string | null
  saleDate: string | null
  saleVenue: string | null
  saleNotes: string | null
  signatureType: string | null
  subscriptionEntryId: string | null
  tags: string[]
  purchaseGroup: PurchaseGroup | null
}

interface HistoryEntry {
  id: string
  status: string
  changedAt: string
}

interface Props {
  editionId: string
  editionName?: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OWNERSHIP_STATUSES = ['OWNED', 'PREORDER', 'SHIPPING', 'BORROWED', 'LENDED', 'SOLD'] as const
const READING_STATUSES = ['UNREAD', 'READING', 'READ', 'DNF'] as const
const CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF']

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
  digitally_signed: 'Digitally signed',
  signed_bookplate: 'Bookplate',
}
const SIGNATURE_TYPES = ['unsigned', 'signed', 'digitally_signed', 'signed_bookplate'] as const

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

const INP_BASE = 'bg-stone-800 border border-stone-700 rounded-lg px-3 py-1.5 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const INP = INP_BASE + ' w-full'
const INP_FLEX = INP_BASE + ' flex-1 min-w-0'
const SEC_HDR = 'text-xs uppercase tracking-widest font-semibold text-stone-500 mb-3'

function EditBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="ml-2 text-stone-500 hover:text-amber-400 transition-colors"
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
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs hover:bg-amber-500/20 transition-colors disabled:opacity-50"
      >
        <Check size={12} /> Save
      </button>
      <button
        onClick={onCancel}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-700 text-stone-400 text-xs hover:border-stone-500 transition-colors"
      >
        <X size={12} /> Cancel
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CollectionEntryPanel({ editionId }: Props) {
  const { user } = useAuth()
  const [entry, setEntry] = useState<CollectionEntry | null>(null)
  const [loading, setLoading] = useState(true)

  // Currency conversion
  const [rates, setRates] = useState<Record<string, number>>({})
  const userCurrency = user?.preferredCurrency

  // Status dropdowns (inline, no save form)
  const [activeDropdown, setActiveDropdown] = useState<'ownership' | 'reading' | 'signature' | null>(null)
  const [savingStatus, setSavingStatus] = useState(false)

  // Edit state — purchase group
  const [editingPurchase, setEditingPurchase] = useState(false)
  const [editTotalAmount, setEditTotalAmount] = useState('')
  const [editCurrency, setEditCurrency] = useState('')
  const [editShippingAmount, setEditShippingAmount] = useState('')
  const [editDiscounts, setEditDiscounts] = useState<{ id?: string; name: string; amount: string }[]>([])
  const [editPurchasedAt, setEditPurchasedAt] = useState('')
  const [editPurchaseNotes, setEditPurchaseNotes] = useState('')
  const [savingPurchase, setSavingPurchase] = useState(false)

  // Error state
  const [saveError, setSaveError] = useState<string | null>(null)

  // Fee editing state (on purchase group)
  const [addingFee, setAddingFee] = useState(false)
  const [newFeeName, setNewFeeName] = useState('')
  const [newFeeAmount, setNewFeeAmount] = useState('')
  const [newFeeCurrency, setNewFeeCurrency] = useState('')
  const [newFeeDate, setNewFeeDate] = useState('')
  const [savingFee, setSavingFee] = useState(false)

  // Refund state
  const [addingRefund, setAddingRefund] = useState(false)
  const [newRefundAmount, setNewRefundAmount] = useState('')
  const [newRefundCurrency, setNewRefundCurrency] = useState('')
  const [newRefundReason, setNewRefundReason] = useState('')
  const [newRefundDate, setNewRefundDate] = useState('')
  const [savingRefund, setSavingRefund] = useState(false)

  // Fee templates
  const [feeTemplates, setFeeTemplates] = useState<FeeTemplate[]>([])

  // Edit state — sale
  const [editingSale, setEditingSale] = useState(false)
  const [editSalePrice, setEditSalePrice] = useState('')
  const [editSaleCurrency, setEditSaleCurrency] = useState('')
  const [editSaleDate, setEditSaleDate] = useState('')
  const [editSaleVenue, setEditSaleVenue] = useState('')
  const [editSaleNotes, setEditSaleNotes] = useState('')
  const [savingSale, setSavingSale] = useState(false)

  // Edit state — tracking
  const [editingTracking, setEditingTracking] = useState(false)
  const [editTracking, setEditTracking] = useState('')
  const [savingTracking, setSavingTracking] = useState(false)

  // Edit state — tags
  const [editingTags, setEditingTags] = useState(false)
  const [editTagInput, setEditTagInput] = useState('')
  const [editTagList, setEditTagList] = useState<string[]>([])
  const [savingTags, setSavingTags] = useState(false)

  // History
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Reset cached history whenever entry ID changes (e.g. re-render for different edition)
  useEffect(() => { setHistory(null) }, [entry?.id])

  // Fetch entry on mount (only if token exists)
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
    if (!token) { setLoading(false); return }

    authFetch<CollectionEntry | null>(`/collection/edition/${editionId}/entry`)
      .then((data) => setEntry(data))
      .catch(() => setEntry(null))
      .finally(() => setLoading(false))

    authFetch<FeeTemplate[]>('/fees/templates?activeOnly=true')
      .then(t => setFeeTemplates(t ?? []))
      .catch(() => {})
  }, [editionId])

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
        authFetch<CollectionEntry | null>(`/collection/edition/${editionId}/entry`)
          .then(fresh => { if (fresh) { setEntry(fresh); setLoading(false) } })
          .catch(() => {})
      }
    }
    window.addEventListener('collection:updated', handler)
    return () => window.removeEventListener('collection:updated', handler)
  }, [editionId])

  if (loading || !entry) return null

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function patchEntry(fields: Record<string, unknown>) {
    const updated = await authFetch<CollectionEntry>(`/collection/${entry!.id}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    })
    const fresh = await authFetch<CollectionEntry | null>(`/collection/edition/${editionId}/entry`)
    setEntry({ ...(fresh ?? updated), tags: fresh?.tags ?? entry!.tags })
  }

  async function refetchEntry() {
    const fresh = await authFetch<CollectionEntry | null>(`/collection/edition/${editionId}/entry`)
    if (fresh) setEntry(fresh)
  }

  // ── Status section ────────────────────────────────────────────────────────

  async function quickSaveStatus(field: 'ownershipStatus' | 'readingStatus' | 'signatureType', value: string) {
    setActiveDropdown(null)
    setSavingStatus(true)
    try {
      await patchEntry({ [field]: value === '' ? null : value })
    } finally {
      setSavingStatus(false)
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
    } else {
      setEditTotalAmount('')
      setEditCurrency('EUR')
      setEditShippingAmount('')
      setEditDiscounts([])
      setEditPurchasedAt('')
      setEditPurchaseNotes('')
    }
    setEditingPurchase(true)
  }

  async function savePurchase() {
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
        if (!amt || amt <= 0 || !d.name.trim()) continue
        if (d.id && existingIds.has(d.id)) {
          // Update existing
          await authFetch(`/fees/discounts/${d.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ amount: amt, currency: editCurrency, date: purchasedAtIso }),
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
    setAddingFee(true)
  }

  async function saveNewFee() {
    if (!newFeeName.trim() || !newFeeAmount || !newFeeDate || !entry!.purchaseGroup) return
    setSavingFee(true)
    try {
      await authFetch(`/fees`, {
        method: 'POST',
        body: JSON.stringify({
          name: newFeeName,
          amount: parseFloat(newFeeAmount),
          currency: newFeeCurrency,
          date: new Date(newFeeDate).toISOString(),
          category: 'OTHER',
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

  async function deleteDiscount(discountId: string) {
    await authFetch(`/fees/discounts/${discountId}`, { method: 'DELETE' })
    await refetchEntry()
  }

  async function saveNewRefund() {
    if (!newRefundAmount || !newRefundDate || !entry!.purchaseGroup) return
    setSavingRefund(true)
    try {
      await authFetch(`/fees/refunds`, {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(newRefundAmount),
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
    setEditSaleVenue(entry!.saleVenue ?? '')
    setEditSaleNotes(entry!.saleNotes ?? '')
    setEditingSale(true)
  }

  async function saveSale() {
    setSavingSale(true)
    try {
      await patchEntry({
        salePrice: editSalePrice || null,
        saleCurrency: editSaleCurrency || null,
        saleDate: editSaleDate || null,
        saleVenue: editSaleVenue || null,
        saleNotes: editSaleNotes || null,
      })
      setEditingSale(false)
    } finally {
      setSavingSale(false)
    }
  }

  // ── Tracking section ──────────────────────────────────────────────────────

  function openTrackingEdit() {
    setEditTracking(entry!.trackingNumber ?? '')
    setEditingTracking(true)
  }

  async function saveTracking() {
    setSavingTracking(true)
    try {
      await patchEntry({ trackingNumber: editTracking || null })
      setEditingTracking(false)
    } finally {
      setSavingTracking(false)
    }
  }

  // ── Tags section ──────────────────────────────────────────────────────────

  function openTagsEdit() {
    setEditTagList([...entry!.tags])
    setEditTagInput('')
    setEditingTags(true)
  }

  async function saveTagsList(tags: string[]) {
    setSavingTags(true)
    try {
      const saved = await authFetch<string[]>(`/collection/edition/${editionId}/tags`, {
        method: 'PUT',
        body: JSON.stringify({ tags }),
      })
      setEntry(prev => prev ? { ...prev, tags: saved } : prev)
      setEditTagList(saved)
    } finally {
      setSavingTags(false)
    }
  }

  async function addTagFromInput() {
    const newTags = editTagInput.split(',').map(t => t.trim()).filter(Boolean)
    if (!newTags.length) return
    const merged = [...new Set([...editTagList, ...newTags])]
    setEditTagList(merged)
    setEditTagInput('')
    await saveTagsList(merged)
  }

  async function removeTag(tag: string) {
    const updated = editTagList.filter(t => t !== tag)
    setEditTagList(updated)
    await saveTagsList(updated)
  }

  // ── History section ───────────────────────────────────────────────────────

  async function toggleHistory() {
    if (!showHistory && !history) {
      setLoadingHistory(true)
      try {
        const data = await authFetch<HistoryEntry[]>(`/collection/entry/${entry!.id}/history`)
        setHistory(data)
      } finally {
        setLoadingHistory(false)
      }
    }
    setShowHistory(prev => !prev)
  }

  // ── Computed values ───────────────────────────────────────────────────────

  const timeSrc = entry.purchaseGroup?.purchasedAt ?? entry.acquiredAt ?? entry.addedAt
  const pg = entry.purchaseGroup
  const isFromSubscription = !!entry.subscriptionEntryId

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

  // For P/L — use grandTotal (base + shipping + fees - discounts - refunds), converted to sale currency
  const saleCur = entry.saleCurrency ?? pg?.currency ?? null
  const pgCur = pg?.currency ?? null
  let costForPL: number | null = null
  if (grandTotal !== null && pgCur) {
    if (!saleCur || saleCur === pgCur) {
      costForPL = grandTotal
    } else {
      // convert grandTotal from purchase currency to sale currency using purchase date
      const rateKey = `${pgCur}:${saleCur}:${pgDate}`
      const rate = rates[rateKey]
      costForPL = rate ? grandTotal * rate : null
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

      {/* Status section (full-width, replaces old header + row1 grid) */}
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
              {entry.ownershipStatus}
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
                    {s}
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
              className="badge-signed px-2 py-0.5 rounded-full text-xs flex items-center gap-1 transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {SIGNATURE_LABELS[entry.signatureType ?? 'unsigned'] ?? 'Unsigned'}
              <ChevronDown size={10} />
            </button>
            {activeDropdown === 'signature' && (
              <div className="absolute top-full left-0 mt-1 z-10 rounded-lg shadow-xl border flex flex-col py-1 min-w-[150px]" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
                <button
                  onClick={() => quickSaveStatus('signatureType', '')}
                  className={`text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${!entry.signatureType ? 'font-semibold' : ''}`}
                  style={{ color: !entry.signatureType ? 'var(--text-bright)' : 'var(--text-dim)' }}
                >
                  Unsigned
                </button>
                {SIGNATURE_TYPES.filter(s => s !== 'unsigned').map(s => (
                  <button
                    key={s}
                    onClick={() => quickSaveStatus('signatureType', s)}
                    className={`text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${s === entry.signatureType ? 'font-semibold' : ''}`}
                    style={{ color: s === entry.signatureType ? 'var(--text-bright)' : 'var(--text-dim)' }}
                  >
                    {SIGNATURE_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Purchase cost + (Tracking + Tags + Ownership history stacked) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">

        {/* Left column: Purchase cost + Sale details */}
        <div className="flex flex-col gap-3">

        {/* Purchase cost card */}
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Wallet size={11} /> Purchase cost
            </p>
            {!editingPurchase && (
              <button onClick={openPurchaseEdit} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                <Pencil size={11} /> {pg ? 'Edit costs' : 'Add costs'}
              </button>
            )}
          </div>

          {editingPurchase ? (
            <div className="flex flex-col gap-2">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Purchase date</label>
                <input type="date" value={editPurchasedAt} onChange={e => setEditPurchasedAt(e.target.value)} className={INP} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Price</label>
                  <input type="number" step="0.01" min="0" value={editTotalAmount} onChange={e => setEditTotalAmount(e.target.value)} placeholder="0.00" className={INP_FLEX + ' w-20'} />
                </div>
                <div className="flex-1">
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Shipping</label>
                  <input type="number" step="0.01" min="0" value={editShippingAmount} onChange={e => setEditShippingAmount(e.target.value)} placeholder="0.00" className={INP_FLEX + ' w-20'} />
                </div>
                <div className="w-24 shrink-0">
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Currency</label>
                  <select value={editCurrency} onChange={e => setEditCurrency(e.target.value)} className={INP}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

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
                        className="text-stone-600 hover:text-red-400 transition-colors shrink-0"
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
                      <div key={fee.id} className="flex items-center gap-1.5 text-xs">
                        <span className="flex-1 truncate" style={{ color: 'var(--text-dim)' }}>{fee.name}</span>
                        <span style={{ color: 'var(--text-dim)' }}>{parseFloat(fee.amount).toFixed(2)} {fee.currency}</span>
                        <span className="text-stone-500">{fee.date ? fee.date.slice(0, 10) : ''}</span>
                        <button onClick={() => deleteFee(fee.id)} className="text-stone-600 hover:text-red-400 transition-colors shrink-0">
                          <Trash2 size={11} />
                        </button>
                      </div>
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
                                  setNewFeeName(t.name)
                                  if (t.defaultAmount) setNewFeeAmount(String(t.defaultAmount))
                                  if (t.defaultCurrency) setNewFeeCurrency(t.defaultCurrency)
                                }}
                                className="px-2 py-0.5 rounded text-xs border border-stone-600 text-stone-400 hover:border-amber-500/40 hover:text-amber-400 transition-colors"
                              >
                                {t.name}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-1.5">
                          <input value={newFeeName} onChange={e => setNewFeeName(e.target.value)} placeholder="Fee name" className={INP_FLEX} />
                          <input type="number" step="0.01" min="0" value={newFeeAmount} onChange={e => setNewFeeAmount(e.target.value)} placeholder="0.00" className={INP_BASE + ' w-20'} />
                          <select value={newFeeCurrency} onChange={e => setNewFeeCurrency(e.target.value)} className={INP_BASE + ' w-20'}>
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <input type="date" value={newFeeDate} onChange={e => setNewFeeDate(e.target.value)} className={INP} />
                        <div className="flex gap-1.5">
                          <button onClick={saveNewFee} disabled={savingFee} className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50">
                            <Check size={11} /> Add
                          </button>
                          <button onClick={() => setAddingFee(false)} className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-stone-700 text-stone-400 hover:border-stone-500 transition-colors">
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
                        <span className="text-stone-500">{r.date ? r.date.slice(0, 10) : ''}</span>
                        <button onClick={() => deleteRefund(r.id)} className="text-stone-600 hover:text-red-400 transition-colors shrink-0">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                    {addingRefund ? (
                      <div className="flex flex-col gap-1.5 pt-0.5">
                        <div className="flex gap-1.5">
                          <input type="number" step="0.01" min="0" value={newRefundAmount} onChange={e => setNewRefundAmount(e.target.value)} placeholder="0.00" className={INP_BASE + ' w-20'} />
                          <select value={newRefundCurrency} onChange={e => setNewRefundCurrency(e.target.value)} className={INP_BASE + ' w-20'}>
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input value={newRefundReason} onChange={e => setNewRefundReason(e.target.value)} placeholder="Reason (optional)" className={INP + ' flex-1'} />
                        </div>
                        <input type="date" value={newRefundDate} onChange={e => setNewRefundDate(e.target.value)} className={INP} />
                        <div className="flex gap-1.5">
                          <button onClick={saveNewRefund} disabled={savingRefund} className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-50">
                            <Check size={11} /> Add
                          </button>
                          <button onClick={() => setAddingRefund(false)} className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-stone-700 text-stone-400 hover:border-stone-500 transition-colors">
                            <X size={11} /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setNewRefundAmount(''); setNewRefundCurrency(pg.currency); setNewRefundReason(''); setNewRefundDate(new Date().toISOString().slice(0, 10)); setAddingRefund(true) }} className="flex items-center gap-1 text-xs pt-0.5 transition-colors" style={{ color: 'var(--text-muted)' }}>
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
                          {fee.date && <span className="ml-1 text-stone-600">{fee.date.slice(0, 10)}</span>}
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
                          <button onClick={() => deleteDiscount(d.id)} className="text-stone-600 hover:text-red-400 transition-colors shrink-0">
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
                {!editingSale && (
                  <button onClick={openSaleEdit} className="flex items-center gap-1 text-xs transition-colors" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-bright)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                    <Pencil size={11} /> Edit
                  </button>
                )}
              </div>
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
                  <input value={editSaleVenue} onChange={e => setEditSaleVenue(e.target.value)} placeholder="e.g. eBay" className={INP} />
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

        {/* Right column: Tracking (compact) + Tags stacked */}
        <div className="flex flex-col gap-3">

        {/* Tracking card — compact */}
        <div className="rounded-xl border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <p className={SEC_HDR}><span className="flex items-center gap-1.5"><Package size={11} /> Tracking</span></p>
          {editingTracking ? (
            <div className="flex flex-col gap-2">
              <input value={editTracking} onChange={e => setEditTracking(e.target.value)} placeholder="Tracking number…" className={INP} />
              <SaveCancelBtns onSave={saveTracking} onCancel={() => setEditingTracking(false)} saving={savingTracking} />
            </div>
          ) : entry.trackingNumber ? (
            <div className="flex items-center gap-1.5">
              <a
                href={`https://parcelsapp.com/en/tracking/${entry.trackingNumber}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                onClick={() => authFetch(`/collection/${entry!.id}/tracking-click`, { method: 'POST' }).catch(() => {})}
              >
                {entry.trackingNumber}
                <ExternalLink size={11} />
              </a>
              <EditBtn onClick={openTrackingEdit} />
            </div>
          ) : (
            <button onClick={openTrackingEdit} className="text-sm hover:text-amber-400 transition-colors flex items-center gap-1 text-left" style={{ color: 'var(--text-muted)' }}>
              + Add tracking number
            </button>
          )}
        </div>

          {/* Tags — below Tracking */}
          <div className="rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
          <Tag size={10} /> Tags
        </span>
        {editingTags ? (
          <div className="flex flex-col gap-2 w-full mt-1">
            {editTagList.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {editTagList.map(tag => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                    {tag}
                    <button onClick={() => removeTag(tag)} className="text-stone-500 hover:text-red-400 transition-colors">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={editTagInput}
                onChange={e => setEditTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTagFromInput() } }}
                placeholder="Add tags (Enter or comma)…"
                className={INP}
                disabled={savingTags}
              />
            </div>
            <div className="flex justify-end">
              <button onClick={() => setEditingTags(false)} className="text-xs px-3 py-1 rounded-lg transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 flex-wrap">
              {entry.tags.length > 0 ? (
                entry.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>no tags</span>
              )}
            </div>
            <EditBtn onClick={openTagsEdit} />
          </>
        )}
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
              <div className="pt-1">
                {loadingHistory ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
                ) : !history || history.length === 0 ? (
                  <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No history recorded</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {history.map((h) => (
                      <div key={h.id} className="flex items-center gap-2.5 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-500 shrink-0" />
                        <span className={`px-2 py-0.5 rounded-full font-medium ${OWNERSHIP_COLORS[h.status] ?? 'bg-stone-700 text-stone-300'}`}>
                          {h.status}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>{fmtDate(h.changedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

    </div>
  )
}
