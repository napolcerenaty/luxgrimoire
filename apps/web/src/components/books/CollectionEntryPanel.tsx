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
  fees: PurchaseFee[]
  discounts: PurchaseDiscount[]
  refunds: PurchaseRefund[]
}

interface CollectionEntry {
  id: string
  readingStatus: string
  ownershipStatus: string
  allocatedPrice: string | null
  priceCurrency: string | null
  purchaseDate: string | null
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
  OWNED: 'bg-green-500/15 text-green-400 border border-green-500/20',
  PREORDER: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  SHIPPING: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  BORROWED: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
  LENDED: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
  SOLD: 'bg-red-500/15 text-red-400 border border-red-500/20',
}

const READING_COLORS: Record<string, string> = {
  UNREAD: 'bg-stone-700/50 text-stone-400 border border-stone-600/30',
  READING: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  READ: 'bg-green-500/15 text-green-400 border border-green-500/20',
  DNF: 'bg-red-500/15 text-red-400 border border-red-500/20',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeInCollection(dateStr: string): string {
  const from = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - from.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
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

const INP = 'bg-stone-800 border border-stone-700 rounded-lg px-3 py-1.5 text-stone-100 focus:outline-none focus:border-amber-400 text-sm w-full'
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

  // Edit state — statuses
  const [editingStatus, setEditingStatus] = useState(false)
  const [editOwnership, setEditOwnership] = useState('')
  const [editReading, setEditReading] = useState('')
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
  const [savingFee, setSavingFee] = useState(false)

  // Refund state
  const [addingRefund, setAddingRefund] = useState(false)
  const [newRefundAmount, setNewRefundAmount] = useState('')
  const [newRefundCurrency, setNewRefundCurrency] = useState('')
  const [newRefundReason, setNewRefundReason] = useState('')
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
  useEffect(() => {
    if (!entry || !userCurrency) return
    const pg = entry.purchaseGroup
    const allCurrencies = pg ? [
      pg.currency,
      ...(pg.fees ?? []).map(f => f.currency),
      ...(pg.discounts ?? []).map(d => d.currency),
      ...(pg.refunds ?? []).map(r => r.currency),
    ] : [entry.priceCurrency].filter(Boolean) as string[]

    const unique = [...new Set(allCurrencies.filter(c => c !== userCurrency))]
    if (!unique.length) return
    Promise.all(
      unique.map(from =>
        authFetch<{ rate: number }>(`/currency/rate?from=${from}&to=${userCurrency}`)
          .then(d => [from, d.rate] as [string, number])
          .catch(() => [from, null] as [string, null])
      )
    ).then(results => {
      const r: Record<string, number> = {}
      results.forEach(([c, v]) => { if (v !== null) r[c] = v })
      setRates(r)
    })
  }, [entry, userCurrency])

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

  function openStatusEdit() {
    setEditOwnership(entry!.ownershipStatus)
    setEditReading(entry!.readingStatus)
    setEditingStatus(true)
  }

  async function saveStatus() {
    setSavingStatus(true)
    try {
      await patchEntry({ ownershipStatus: editOwnership, readingStatus: editReading })
      setEditingStatus(false)
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
      setEditCurrency(entry!.priceCurrency ?? 'EUR')
      setEditShippingAmount('')
      setEditDiscounts([])
      setEditPurchasedAt(entry!.purchaseDate ? entry!.purchaseDate.slice(0, 10) : '')
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
    setNewFeeCurrency(entry!.purchaseGroup?.currency ?? entry!.priceCurrency ?? 'EUR')
    setAddingFee(true)
  }

  async function saveNewFee() {
    if (!newFeeName.trim() || !newFeeAmount || !entry!.purchaseGroup) return
    setSavingFee(true)
    try {
      await authFetch(`/fees`, {
        method: 'POST',
        body: JSON.stringify({
          name: newFeeName,
          amount: parseFloat(newFeeAmount),
          currency: newFeeCurrency,
          date: new Date().toISOString(),
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
    if (!newRefundAmount || !entry!.purchaseGroup) return
    setSavingRefund(true)
    try {
      await authFetch(`/fees/refunds`, {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(newRefundAmount),
          currency: newRefundCurrency,
          date: new Date().toISOString(),
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

  function addTagFromInput() {
    const newTags = editTagInput.split(',').map(t => t.trim()).filter(Boolean)
    setEditTagList(prev => [...new Set([...prev, ...newTags])])
    setEditTagInput('')
  }

  async function saveTags() {
    setSavingTags(true)
    try {
      const saved = await authFetch<string[]>(`/collection/edition/${editionId}/tags`, {
        method: 'PUT',
        body: JSON.stringify({ tags: editTagList }),
      })
      setEntry(prev => prev ? { ...prev, tags: saved } : prev)
      setEditingTags(false)
    } finally {
      setSavingTags(false)
    }
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

  const timeSrc = entry.purchaseDate ?? entry.purchaseGroup?.purchasedAt ?? entry.acquiredAt ?? entry.addedAt
  const pg = entry.purchaseGroup
  const isFromSubscription = !!entry.subscriptionEntryId

  // Cost calculations from purchase group
  const pgTotal = pg ? parseFloat(String(pg.totalAmount)) : null
  const pgShipping = pg?.shippingAmount ? parseFloat(String(pg.shippingAmount)) : null
  const pgFeesTotal = pg ? (pg.fees ?? []).reduce((acc, f) => acc + parseFloat(f.amount), 0) : 0
  const pgDiscountsTotal = pg ? (pg.discounts ?? []).reduce((acc, d) => acc + parseFloat(d.amount), 0) : 0
  const pgRefundsTotal = pg ? (pg.refunds ?? []).reduce((acc, r) => acc + parseFloat(r.amount), 0) : 0
  const grandTotal = pgTotal !== null
    ? pgTotal + (pgShipping ?? 0) + pgFeesTotal - pgDiscountsTotal - pgRefundsTotal
    : null
  const hasBreakdown = pgShipping !== null || pgFeesTotal > 0 || pgDiscountsTotal > 0 || pgRefundsTotal > 0

  // For P/L — use purchaseGroup.totalAmount as cost, or allocatedPrice fallback
  const costForPL = pgTotal ?? (entry.allocatedPrice ? parseFloat(entry.allocatedPrice) : null)
  const profit = entry.salePrice && costForPL !== null
    ? parseFloat(entry.salePrice) - costForPL
    : null
  const profitCurrency = entry.saleCurrency ?? pg?.currency ?? entry.priceCurrency

  // Currency conversion helper
  function converted(amount: number, fromCurrency: string | null): string | null {
    if (!fromCurrency || !userCurrency || fromCurrency === userCurrency) return null
    const rate = rates[fromCurrency]
    if (!rate) return null
    return `≈ ${(amount * rate).toFixed(2)} ${userCurrency}`
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const CARD = 'rounded-lg p-4 flex flex-col gap-3'
  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)' }

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Package size={15} className="text-amber-400" />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-bright)' }}>My Collection</h3>
        {isFromSubscription && (
          <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            From subscription
          </span>
        )}
      </div>

      {/* Row 1: Status + Time */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Status card */}
        <div className={CARD} style={cardStyle}>
          <p className={SEC_HDR}>Status</p>
          {editingStatus ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Ownership</label>
                  <select value={editOwnership} onChange={e => setEditOwnership(e.target.value)} className={INP}>
                    {OWNERSHIP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Reading</label>
                  <select value={editReading} onChange={e => setEditReading(e.target.value)} className={INP}>
                    {READING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <SaveCancelBtns onSave={saveStatus} onCancel={() => setEditingStatus(false)} saving={savingStatus} />
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${OWNERSHIP_COLORS[entry.ownershipStatus] ?? 'bg-stone-700 text-stone-300'}`}>
                {entry.ownershipStatus}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${READING_COLORS[entry.readingStatus] ?? 'bg-stone-700 text-stone-400'}`}>
                {entry.readingStatus}
              </span>
              <EditBtn onClick={openStatusEdit} />
            </div>
          )}
        </div>

        {/* Time in collection card */}
        <div className={CARD} style={cardStyle}>
          <p className={SEC_HDR}><span className="flex items-center gap-1.5"><Clock size={11} /> In collection</span></p>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>{timeInCollection(timeSrc)}</p>
            {(entry.purchaseDate ?? pg?.purchasedAt) && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>since {fmtDate(entry.purchaseDate ?? pg?.purchasedAt)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Purchase cost + Tracking */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Purchase cost card */}
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Wallet size={11} /> Purchase cost
            </p>
            {!editingPurchase && (
              <button onClick={openPurchaseEdit} className="text-xs text-amber-500 hover:text-amber-400 transition-colors">
                ✏️ {pg ? 'Edit costs' : 'Add costs'}
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
                  <input type="number" step="0.01" min="0" value={editTotalAmount} onChange={e => setEditTotalAmount(e.target.value)} placeholder="0.00" className={INP} />
                </div>
                <div className="w-24">
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Currency</label>
                  <select value={editCurrency} onChange={e => setEditCurrency(e.target.value)} className={INP}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Shipping</label>
                <input type="number" step="0.01" min="0" value={editShippingAmount} onChange={e => setEditShippingAmount(e.target.value)} placeholder="0.00" className={INP} />
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
                        className={INP + ' flex-1'}
                      />
                      <input
                        type="number" step="0.01" min="0"
                        value={d.amount}
                        onChange={e => setEditDiscounts(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                        placeholder="0.00"
                        className={INP + ' w-24'}
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
                      {converted(pgTotal!, pg.currency) && (
                        <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{converted(pgTotal!, pg.currency)}</span>
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
                        {converted(pgShipping, pg.currency) && (
                          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{converted(pgShipping, pg.currency)}</span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Fee rows */}
                  {(pg.fees ?? []).map(fee => {
                    const amt = parseFloat(fee.amount)
                    return (
                      <div key={fee.id} className="flex justify-between items-baseline gap-2">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fee.name}</span>
                        <span className="text-right flex items-baseline gap-1.5">
                          <span>
                            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{amt.toFixed(2)} {fee.currency}</span>
                            {converted(amt, fee.currency) && (
                              <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{converted(amt, fee.currency)}</span>
                            )}
                          </span>
                          <button onClick={() => deleteFee(fee.id)} className="text-stone-600 hover:text-red-400 transition-colors shrink-0">
                            <Trash2 size={11} />
                          </button>
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
                            {converted(amt, d.currency) && (
                              <span className="block text-xs text-green-500/60">{converted(amt, d.currency)?.replace('≈', '≈ −')}</span>
                            )}
                          </span>
                          <button onClick={() => deleteDiscount(d.id)} className="text-stone-600 hover:text-red-400 transition-colors shrink-0">
                            <Trash2 size={11} />
                          </button>
                        </span>
                      </div>
                    )
                  })}

                  {/* Add fee inline */}
                  {addingFee ? (
                    <div className="flex flex-col gap-1.5 pt-1">
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
                        <input value={newFeeName} onChange={e => setNewFeeName(e.target.value)} placeholder="Fee name" className={INP + ' flex-1'} />
                        <input type="number" step="0.01" min="0" value={newFeeAmount} onChange={e => setNewFeeAmount(e.target.value)} placeholder="0.00" className={INP + ' w-20'} />
                        <select value={newFeeCurrency} onChange={e => setNewFeeCurrency(e.target.value)} className={INP + ' w-20'}>
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
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

                  {/* Refund rows */}
                  {(pg.refunds ?? []).map(r => {
                    const amt = parseFloat(r.amount)
                    return (
                      <div key={r.id} className="flex justify-between items-baseline gap-2">
                        <span className="text-xs text-orange-400">↩ {r.reason ?? 'Refund'}</span>
                        <span className="text-right flex items-baseline gap-1.5">
                          <span>
                            <span className="text-xs text-orange-400">−{amt.toFixed(2)} {r.currency}</span>
                            {converted(amt, r.currency) && (
                              <span className="block text-xs text-orange-500/60">{converted(amt, r.currency)?.replace('≈', '≈ −')}</span>
                            )}
                          </span>
                          <button onClick={() => deleteRefund(r.id)} className="text-stone-600 hover:text-red-400 transition-colors shrink-0">
                            <Trash2 size={11} />
                          </button>
                        </span>
                      </div>
                    )
                  })}

                  {/* Add refund inline */}
                  {addingRefund ? (
                    <div className="flex flex-col gap-1.5 pt-1">
                      <div className="flex gap-1.5">
                        <input type="number" step="0.01" min="0" value={newRefundAmount} onChange={e => setNewRefundAmount(e.target.value)} placeholder="0.00" className={INP + ' w-20'} />
                        <select value={newRefundCurrency} onChange={e => setNewRefundCurrency(e.target.value)} className={INP + ' w-20'}>
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input value={newRefundReason} onChange={e => setNewRefundReason(e.target.value)} placeholder="Reason (optional)" className={INP + ' flex-1'} />
                      </div>
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
                    <button onClick={() => { setNewRefundAmount(''); setNewRefundCurrency(pg.currency); setNewRefundReason(''); setAddingRefund(true) }} className="flex items-center gap-1 text-xs pt-0.5 transition-colors" style={{ color: 'var(--text-muted)' }}>
                      <Plus size={11} /> Add refund
                    </button>
                  )}

                  {/* Grand total */}
                  {grandTotal !== null && hasBreakdown && (
                    <div className="flex justify-between items-baseline gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="font-medium" style={{ color: 'var(--text-bright)' }}>Total</span>
                      <span className="text-right">
                        <span className="font-semibold" style={{ color: 'var(--text-bright)' }}>
                          {grandTotal.toFixed(2)} {pg.currency}
                        </span>
                        {converted(grandTotal, pg.currency) && (
                          <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{converted(grandTotal, pg.currency)}</span>
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

        {/* Tracking card */}
        <div className={CARD} style={cardStyle}>
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
      </div>

      {/* Sale details — only when SOLD */}
      {entry.ownershipStatus === 'SOLD' && (
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Sale details</p>
            {!editingSale && (
              <button onClick={openSaleEdit} className="text-xs text-amber-500 hover:text-amber-400 transition-colors">
                ✏️ Edit
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

      {/* Tags */}
      <div className={CARD} style={cardStyle}>
        <p className={SEC_HDR}><span className="flex items-center gap-1.5"><Tag size={11} /> Tags</span></p>
        {editingTags ? (
          <div className="flex flex-col gap-2">
            {editTagList.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {editTagList.map(tag => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                    {tag}
                    <button onClick={() => setEditTagList(prev => prev.filter(t => t !== tag))} className="text-stone-500 hover:text-red-400 transition-colors">
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
              />
              <button onClick={addTagFromInput} className="px-3 py-1.5 rounded-lg text-xs shrink-0 transition-colors" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                Add
              </button>
            </div>
            <SaveCancelBtns onSave={saveTags} onCancel={() => setEditingTags(false)} saving={savingTags} />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            {entry.tags.length > 0 ? (
              entry.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No tags</span>
            )}
            <EditBtn onClick={openTagsEdit} />
          </div>
        )}
      </div>

      {/* Ownership history */}
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
  )
}

