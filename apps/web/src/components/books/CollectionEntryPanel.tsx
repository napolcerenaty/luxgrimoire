'use client'

import { useState, useEffect } from 'react'
import {
  ExternalLink, Pencil, Check, X, ChevronDown, ChevronUp,
  Clock, Tag, Package, Wallet,
} from 'lucide-react'
import { authFetch } from '@/lib/authFetch'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  tags: string[]
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

function SectionDivider() {
  return <div className="border-t border-stone-700/50 my-4" />
}

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
  const [entry, setEntry] = useState<CollectionEntry | null>(null)
  const [loading, setLoading] = useState(true)

  // Edit state
  const [editingStatus, setEditingStatus] = useState(false)
  const [editOwnership, setEditOwnership] = useState('')
  const [editReading, setEditReading] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)

  const [editingPurchase, setEditingPurchase] = useState(false)
  const [editAllocatedPrice, setEditAllocatedPrice] = useState('')
  const [editPriceCurrency, setEditPriceCurrency] = useState('')
  const [editPurchaseDate, setEditPurchaseDate] = useState('')
  const [savingPurchase, setSavingPurchase] = useState(false)

  const [editingSale, setEditingSale] = useState(false)
  const [editSalePrice, setEditSalePrice] = useState('')
  const [editSaleCurrency, setEditSaleCurrency] = useState('')
  const [editSaleDate, setEditSaleDate] = useState('')
  const [editSaleVenue, setEditSaleVenue] = useState('')
  const [editSaleNotes, setEditSaleNotes] = useState('')
  const [savingSale, setSavingSale] = useState(false)

  const [editingTracking, setEditingTracking] = useState(false)
  const [editTracking, setEditTracking] = useState('')
  const [savingTracking, setSavingTracking] = useState(false)

  const [editingTags, setEditingTags] = useState(false)
  const [editTagInput, setEditTagInput] = useState('')
  const [editTagList, setEditTagList] = useState<string[]>([])
  const [savingTags, setSavingTags] = useState(false)

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
  }, [editionId])

  if (loading || !entry) return null

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function patch(fields: Record<string, unknown>) {
    const updated = await authFetch<CollectionEntry>(`/collection/${entry!.id}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    })
    // Re-fetch to get fresh data including tags
    const fresh = await authFetch<CollectionEntry | null>(`/collection/edition/${editionId}/entry`)
    setEntry({ ...(fresh ?? updated), tags: fresh?.tags ?? entry!.tags })
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
      await patch({ ownershipStatus: editOwnership, readingStatus: editReading })
      setEditingStatus(false)
    } finally {
      setSavingStatus(false)
    }
  }

  // ── Purchase section ──────────────────────────────────────────────────────

  function openPurchaseEdit() {
    setEditAllocatedPrice(entry!.allocatedPrice ?? '')
    setEditPriceCurrency(entry!.priceCurrency ?? '')
    setEditPurchaseDate(entry!.purchaseDate ? entry!.purchaseDate.slice(0, 10) : '')
    setEditingPurchase(true)
  }

  async function savePurchase() {
    setSavingPurchase(true)
    try {
      await patch({
        allocatedPrice: editAllocatedPrice || null,
        priceCurrency: editPriceCurrency || null,
        purchaseDate: editPurchaseDate || null,
      })
      setEditingPurchase(false)
    } finally {
      setSavingPurchase(false)
    }
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
      await patch({
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
      await patch({ trackingNumber: editTracking || null })
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

  const timeSrc = entry.purchaseDate ?? entry.acquiredAt ?? entry.addedAt
  const profit =
    entry.salePrice && entry.allocatedPrice
      ? parseFloat(entry.salePrice) - parseFloat(entry.allocatedPrice)
      : null
  const profitCurrency = entry.saleCurrency ?? entry.priceCurrency

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)' }}
    >
      <h3 className="text-sm font-semibold text-stone-200 mb-4 flex items-center gap-2">
        <Package size={15} className="text-amber-400" />
        My Collection
      </h3>

      {/* ── Statuses ─────────────────────────────────────────────────────── */}
      <div>
        <p className={SEC_HDR}>Status</p>
        {editingStatus ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[130px]">
                <label className="block text-xs text-stone-500 mb-1">Ownership</label>
                <select
                  value={editOwnership}
                  onChange={e => setEditOwnership(e.target.value)}
                  className={INP}
                >
                  {OWNERSHIP_STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[130px]">
                <label className="block text-xs text-stone-500 mb-1">Reading</label>
                <select
                  value={editReading}
                  onChange={e => setEditReading(e.target.value)}
                  className={INP}
                >
                  {READING_STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
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

      {/* ── Time in collection ────────────────────────────────────────────── */}
      <SectionDivider />
      <div>
        <p className={SEC_HDR}>Time in collection</p>
        <p className="flex items-center gap-1.5 text-sm text-stone-300">
          <Clock size={13} className="text-stone-500 shrink-0" />
          {timeInCollection(timeSrc)}
          {entry.purchaseDate && (
            <span className="text-stone-500 text-xs">· since {fmtDate(entry.purchaseDate)}</span>
          )}
        </p>
      </div>

      {/* ── Purchase cost ──────────────────────────────────────────────────── */}
      <SectionDivider />
      <div>
        <p className={SEC_HDR}>
          <span className="flex items-center gap-1.5"><Wallet size={11} /> Purchase cost</span>
        </p>
        {editingPurchase ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-stone-500 mb-1">Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editAllocatedPrice}
                  onChange={e => setEditAllocatedPrice(e.target.value)}
                  placeholder="0.00"
                  className={INP}
                />
              </div>
              <div className="w-24">
                <label className="block text-xs text-stone-500 mb-1">Currency</label>
                <select value={editPriceCurrency} onChange={e => setEditPriceCurrency(e.target.value)} className={INP}>
                  <option value="">—</option>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Purchase date</label>
              <input type="date" value={editPurchaseDate} onChange={e => setEditPurchaseDate(e.target.value)} className={INP} />
            </div>
            <SaveCancelBtns onSave={savePurchase} onCancel={() => setEditingPurchase(false)} saving={savingPurchase} />
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-wrap text-sm text-stone-300">
            {entry.allocatedPrice ? (
              <span className="font-medium">
                {parseFloat(entry.allocatedPrice).toFixed(2)} {entry.priceCurrency ?? ''}
              </span>
            ) : (
              <span className="text-stone-500 italic">Not set</span>
            )}
            {entry.purchaseDate && (
              <span className="text-stone-500 text-xs">· {fmtDate(entry.purchaseDate)}</span>
            )}
            <EditBtn onClick={openPurchaseEdit} />
          </div>
        )}
      </div>

      {/* ── Sale info (SOLD only) ──────────────────────────────────────────── */}
      {entry.ownershipStatus === 'SOLD' && (
        <>
          <SectionDivider />
          <div>
            <p className={SEC_HDR}>Sale details</p>
            {editingSale ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-stone-500 mb-1">Sale price</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editSalePrice}
                      onChange={e => setEditSalePrice(e.target.value)}
                      placeholder="0.00"
                      className={INP}
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs text-stone-500 mb-1">Currency</label>
                    <select value={editSaleCurrency} onChange={e => setEditSaleCurrency(e.target.value)} className={INP}>
                      <option value="">—</option>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Sale date</label>
                  <input type="date" value={editSaleDate} onChange={e => setEditSaleDate(e.target.value)} className={INP} />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Venue / platform</label>
                  <input value={editSaleVenue} onChange={e => setEditSaleVenue(e.target.value)} placeholder="e.g. eBay" className={INP} />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Notes</label>
                  <input value={editSaleNotes} onChange={e => setEditSaleNotes(e.target.value)} placeholder="Any notes…" className={INP} />
                </div>
                <SaveCancelBtns onSave={saveSale} onCancel={() => setEditingSale(false)} saving={savingSale} />
              </div>
            ) : (
              <div className="text-sm text-stone-300 space-y-1">
                {entry.salePrice ? (
                  <p>
                    <span className="text-stone-500 mr-2">Price</span>
                    {parseFloat(entry.salePrice).toFixed(2)} {entry.saleCurrency ?? ''}
                  </p>
                ) : (
                  <p className="text-stone-500 italic">No sale price recorded</p>
                )}
                {entry.saleDate && <p><span className="text-stone-500 mr-2">Date</span>{fmtDate(entry.saleDate)}</p>}
                {entry.saleVenue && <p><span className="text-stone-500 mr-2">Venue</span>{entry.saleVenue}</p>}
                {entry.saleNotes && <p><span className="text-stone-500 mr-2">Notes</span>{entry.saleNotes}</p>}
                {profit !== null && (
                  <p className="pt-1">
                    <span className="text-stone-500 mr-2">P/L</span>
                    <span className={profit >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                      {profit >= 0 ? '+' : ''}{profit.toFixed(2)} {profitCurrency ?? ''}
                    </span>
                  </p>
                )}
                <EditBtn onClick={openSaleEdit} />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Tracking number ───────────────────────────────────────────────── */}
      <SectionDivider />
      <div>
        <p className={SEC_HDR}>Tracking</p>
        {editingTracking ? (
          <div className="flex flex-col gap-2">
            <input
              value={editTracking}
              onChange={e => setEditTracking(e.target.value)}
              placeholder="Tracking number…"
              className={INP}
            />
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
          <button
            onClick={openTrackingEdit}
            className="text-sm text-stone-500 hover:text-amber-400 transition-colors flex items-center gap-1"
          >
            <span>+ Add tracking number</span>
          </button>
        )}
      </div>

      {/* ── Tags ──────────────────────────────────────────────────────────── */}
      <SectionDivider />
      <div>
        <p className={SEC_HDR}>
          <span className="flex items-center gap-1.5"><Tag size={11} /> Tags</span>
        </p>
        {editingTags ? (
          <div className="flex flex-col gap-2">
            {/* Existing chips */}
            {editTagList.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {editTagList.map(tag => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-800 text-stone-300 text-xs border border-stone-700"
                  >
                    {tag}
                    <button
                      onClick={() => setEditTagList(prev => prev.filter(t => t !== tag))}
                      className="text-stone-500 hover:text-red-400 transition-colors"
                    >
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
                placeholder="Add tags (comma separated)…"
                className={INP}
              />
              <button
                onClick={addTagFromInput}
                className="px-3 py-1.5 rounded-lg bg-stone-700 text-stone-300 text-xs hover:bg-stone-600 transition-colors shrink-0"
              >
                Add
              </button>
            </div>
            <SaveCancelBtns onSave={saveTags} onCancel={() => setEditingTags(false)} saving={savingTags} />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            {entry.tags.length > 0 ? (
              entry.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-full bg-stone-800 text-stone-300 text-xs border border-stone-700">
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-stone-500 text-xs italic">No tags</span>
            )}
            <EditBtn onClick={openTagsEdit} />
          </div>
        )}
      </div>

      {/* ── Ownership history ─────────────────────────────────────────────── */}
      <SectionDivider />
      <div>
        <button
          onClick={toggleHistory}
          className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-300 transition-colors"
        >
          {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {showHistory ? 'Hide' : 'Show'} ownership history
        </button>

        {showHistory && (
          <div className="mt-3">
            {loadingHistory ? (
              <p className="text-xs text-stone-500">Loading…</p>
            ) : !history || history.length === 0 ? (
              <p className="text-xs text-stone-500 italic">No history recorded</p>
            ) : (
              <div className="flex flex-col gap-2">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center gap-2.5 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-stone-500 shrink-0" />
                    <span className={`px-2 py-0.5 rounded-full font-medium ${OWNERSHIP_COLORS[h.status] ?? 'bg-stone-700 text-stone-300'}`}>
                      {h.status}
                    </span>
                    <span className="text-stone-500">{fmtDate(h.changedAt)}</span>
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
