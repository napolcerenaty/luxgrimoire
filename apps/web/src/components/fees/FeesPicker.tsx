'use client'

import { useState, useEffect } from 'react'
import {
  getFeeTemplates, getPurchaseFees, createPurchaseFee, deletePurchaseFee,
  getDiscounts, createPurchaseDiscount, deletePurchaseDiscount,
  getRefunds, createPurchaseRefund, deletePurchaseRefund,
} from '@/lib/api'
import type { ApiFeeTemplate, ApiPurchaseFee, ApiPurchaseDiscount, ApiPurchaseRefund, FeeCategory } from '@luxgrimoire/shared-types'
import { ChevronDown, ChevronUp, Plus, Trash2, Loader2, Save, Tag, RotateCcw } from 'lucide-react'

import { parseDecimalInput } from '@/lib/parseDecimalInput'

interface FeesPickerProps {
  billingPeriodId?: string
  userBookEntryId?: string
  purchaseGroupId?: string
  onFeesChange?: (fees: ApiPurchaseFee[]) => void
}

interface FeeRow {
  localId: string
  savedId?: string
  feeTemplateId?: string
  name: string
  amount: string
  currency: string
  date: string
  category: FeeCategory
  notes: string
  isNew: boolean
  markedForDelete: boolean
}

interface DiscountRow {
  localId: string
  savedId?: string
  name: string
  amount: string
  currency: string
  date: string
  notes: string
  isNew: boolean
  markedForDelete: boolean
}

interface RefundRow {
  localId: string
  savedId?: string
  amount: string
  currency: string
  date: string
  reason: string
  notes: string
  isNew: boolean
  markedForDelete: boolean
}

const CATEGORIES: { value: FeeCategory; label: string }[] = [
  { value: 'VAT', label: 'VAT' },
  { value: 'CUSTOMS', label: 'Customs' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'FORWARDING', label: 'Forwarding' },
  { value: 'OTHER', label: 'Other' },
]

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

let idCounter = 0
function nextLocalId() {
  return `local-${++idCounter}`
}

const inputCls =
  'bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-2 py-1 text-xs placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors'
const selectCls =
  'bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-400 transition-colors'

export default function FeesPicker({ billingPeriodId, userBookEntryId, purchaseGroupId, onFeesChange }: FeesPickerProps) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<ApiFeeTemplate[]>([])
  const [feeRows, setFeeRows] = useState<FeeRow[]>([])
  const [discountRows, setDiscountRows] = useState<DiscountRow[]>([])
  const [refundRows, setRefundRows] = useState<RefundRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    Promise.all([
      getFeeTemplates(true),
      getPurchaseFees({ billingPeriodId, userBookEntryId, purchaseGroupId }),
      getDiscounts({ billingPeriodId, userBookEntryId, purchaseGroupId }),
      getRefunds({ billingPeriodId, userBookEntryId, purchaseGroupId }),
    ])
      .then(([tmpl, fees, discounts, refunds]) => {
        setTemplates(tmpl)
        setFeeRows(fees.map((f) => ({
          localId: nextLocalId(), savedId: f.id, feeTemplateId: f.feeTemplateId ?? undefined,
          name: f.name, amount: String(f.amount), currency: f.currency, date: f.date.slice(0, 10),
          category: f.category, notes: f.notes ?? '', isNew: false, markedForDelete: false,
        })))
        setDiscountRows(discounts.map((d) => ({
          localId: nextLocalId(), savedId: d.id, name: d.name, amount: String(d.amount),
          currency: d.currency, date: d.date.slice(0, 10), notes: d.notes ?? '',
          isNew: false, markedForDelete: false,
        })))
        setRefundRows(refunds.map((r) => ({
          localId: nextLocalId(), savedId: r.id, amount: String(r.amount), currency: r.currency,
          date: r.date.slice(0, 10), reason: r.reason ?? '', notes: r.notes ?? '',
          isNew: false, markedForDelete: false,
        })))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, billingPeriodId, userBookEntryId, purchaseGroupId])

  // ── Fee helpers ──────────────────────────────────────────────────────────────

  const addFeeFromTemplate = (t: ApiFeeTemplate) => {
    setFeeRows((prev) => [...prev, {
      localId: nextLocalId(), feeTemplateId: t.id, name: t.name,
      amount: t.defaultAmount != null ? String(t.defaultAmount) : '',
      currency: t.defaultCurrency, date: todayStr(), category: t.category,
      notes: '', isNew: true, markedForDelete: false,
    }])
  }

  const addBlankFee = () => {
    setFeeRows((prev) => [...prev, {
      localId: nextLocalId(), name: '', amount: '', currency: 'PLN',
      date: todayStr(), category: 'OTHER', notes: '', isNew: true, markedForDelete: false,
    }])
  }

  const updateFeeRow = (localId: string, patch: Partial<FeeRow>) =>
    setFeeRows((prev) => prev.map((r) => r.localId === localId ? { ...r, ...patch } : r))

  const removeFeeRow = (localId: string) =>
    setFeeRows((prev) => (prev.map((r) => {
      if (r.localId !== localId) return r
      if (r.savedId) return { ...r, markedForDelete: true }
      return null
    }).filter(Boolean)) as FeeRow[])

  // ── Discount helpers ──────────────────────────────────────────────────────────

  const addBlankDiscount = () => {
    setDiscountRows((prev) => [...prev, {
      localId: nextLocalId(), name: '', amount: '', currency: 'PLN',
      date: todayStr(), notes: '', isNew: true, markedForDelete: false,
    }])
  }

  const updateDiscountRow = (localId: string, patch: Partial<DiscountRow>) =>
    setDiscountRows((prev) => prev.map((r) => r.localId === localId ? { ...r, ...patch } : r))

  const removeDiscountRow = (localId: string) =>
    setDiscountRows((prev) => (prev.map((r) => {
      if (r.localId !== localId) return r
      if (r.savedId) return { ...r, markedForDelete: true }
      return null
    }).filter(Boolean)) as DiscountRow[])

  // ── Refund helpers ────────────────────────────────────────────────────────────

  const addBlankRefund = () => {
    setRefundRows((prev) => [...prev, {
      localId: nextLocalId(), amount: '', currency: 'PLN',
      date: todayStr(), reason: '', notes: '', isNew: true, markedForDelete: false,
    }])
  }

  const updateRefundRow = (localId: string, patch: Partial<RefundRow>) =>
    setRefundRows((prev) => prev.map((r) => r.localId === localId ? { ...r, ...patch } : r))

  const removeRefundRow = (localId: string) =>
    setRefundRows((prev) => (prev.map((r) => {
      if (r.localId !== localId) return r
      if (r.savedId) return { ...r, markedForDelete: true }
      return null
    }).filter(Boolean)) as RefundRow[])

  // ── Save ──────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await Promise.all([
        ...feeRows.filter((r) => r.markedForDelete && r.savedId).map((r) => deletePurchaseFee(r.savedId!)),
        ...discountRows.filter((r) => r.markedForDelete && r.savedId).map((r) => deletePurchaseDiscount(r.savedId!)),
        ...refundRows.filter((r) => r.markedForDelete && r.savedId).map((r) => deletePurchaseRefund(r.savedId!)),
      ])

      const [createdFees, createdDiscounts, createdRefunds] = await Promise.all([
        Promise.all(
          feeRows.filter((r) => r.isNew && !r.markedForDelete).map((r) =>
            createPurchaseFee({
              feeTemplateId: r.feeTemplateId, name: r.name, amount: parseDecimalInput(r.amount),
              currency: r.currency, date: r.date, category: r.category,
              billingPeriodId, userBookEntryId, purchaseGroupId, notes: r.notes || undefined,
            })
          )
        ),
        Promise.all(
          discountRows.filter((r) => r.isNew && !r.markedForDelete).map((r) =>
            createPurchaseDiscount({
              name: r.name, amount: parseDecimalInput(r.amount), currency: r.currency,
              date: r.date, billingPeriodId, userBookEntryId, purchaseGroupId, notes: r.notes || undefined,
            })
          )
        ),
        Promise.all(
          refundRows.filter((r) => r.isNew && !r.markedForDelete).map((r) =>
            createPurchaseRefund({
              amount: parseDecimalInput(r.amount), currency: r.currency, date: r.date,
              billingPeriodId, userBookEntryId, purchaseGroupId,
              reason: r.reason || undefined, notes: r.notes || undefined,
            })
          )
        ),
      ])

      setFeeRows(
        feeRows.filter((r) => !r.markedForDelete && !r.isNew).concat(
          createdFees.map((f) => ({
            localId: nextLocalId(), savedId: f.id, feeTemplateId: f.feeTemplateId ?? undefined,
            name: f.name, amount: String(f.amount), currency: f.currency, date: f.date.slice(0, 10),
            category: f.category, notes: f.notes ?? '', isNew: false, markedForDelete: false,
          }))
        )
      )
      setDiscountRows(
        discountRows.filter((r) => !r.markedForDelete && !r.isNew).concat(
          createdDiscounts.map((d: ApiPurchaseDiscount) => ({
            localId: nextLocalId(), savedId: d.id, name: d.name, amount: String(d.amount),
            currency: d.currency, date: d.date.slice(0, 10), notes: d.notes ?? '',
            isNew: false, markedForDelete: false,
          }))
        )
      )
      setRefundRows(
        refundRows.filter((r) => !r.markedForDelete && !r.isNew).concat(
          createdRefunds.map((r: ApiPurchaseRefund) => ({
            localId: nextLocalId(), savedId: r.id, amount: String(r.amount), currency: r.currency,
            date: r.date.slice(0, 10), reason: r.reason ?? '', notes: r.notes ?? '',
            isNew: false, markedForDelete: false,
          }))
        )
      )

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)

      if (onFeesChange) {
        const allFees = await getPurchaseFees({ billingPeriodId, userBookEntryId, purchaseGroupId })
        onFeesChange(allFees)
      }
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const visibleFees = feeRows.filter((r) => !r.markedForDelete)
  const visibleDiscounts = discountRows.filter((r) => !r.markedForDelete)
  const visibleRefunds = refundRows.filter((r) => !r.markedForDelete)
  const totalCount = visibleFees.length + visibleDiscounts.length + visibleRefunds.length

  const feeTotals: Record<string, number> = {}
  for (const r of visibleFees) {
    const amt = parseDecimalInput(r.amount)
    if (amt) feeTotals[r.currency] = (feeTotals[r.currency] ?? 0) + amt
  }
  const discountTotals: Record<string, number> = {}
  for (const r of visibleDiscounts) {
    const amt = parseDecimalInput(r.amount)
    if (amt) discountTotals[r.currency] = (discountTotals[r.currency] ?? 0) + amt
  }
  const refundTotals: Record<string, number> = {}
  for (const r of visibleRefunds) {
    const amt = parseDecimalInput(r.amount)
    if (amt) refundTotals[r.currency] = (refundTotals[r.currency] ?? 0) + amt
  }

  return (
    <div className="border border-stone-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-stone-800/50 hover:bg-stone-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-serif text-sm font-semibold text-stone-200">Fees, Taxes, Discounts &amp; Refunds</span>
          {totalCount > 0 && (
            <span className="text-xs bg-amber-500/20 text-amber-400 rounded-full px-2 py-0.5">{totalCount}</span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-stone-400" /> : <ChevronDown size={16} className="text-stone-400" />}
      </button>

      {open && (
        <div className="p-4 space-y-5 bg-stone-900/40">
          {loading && (
            <div className="flex items-center gap-2 text-stone-400 text-sm">
              <Loader2 size={15} className="animate-spin" /> Loading…
            </div>
          )}

          {!loading && (
            <>
              {/* ── FEES ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-stone-300 uppercase tracking-wider">Fees &amp; Taxes</span>
                  <span className="flex-1 border-t border-stone-700" />
                </div>

                {templates.length > 0 && (
                  <div>
                    <p className="text-xs text-stone-500 mb-1.5">Add from template:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {templates.map((t) => (
                        <button
                          key={t.id} type="button" onClick={() => addFeeFromTemplate(t)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-stone-600 hover:border-amber-400 text-stone-300 hover:text-amber-300 transition-colors"
                        >
                          + {t.name}
                          {t.defaultAmount != null && <span className="ml-1 text-stone-500">({t.defaultAmount} {t.defaultCurrency})</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {visibleFees.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_80px_55px_105px_95px_1fr_28px] gap-1 text-xs text-stone-500 font-medium px-0.5">
                      <span>Name</span><span>Amount</span><span>Curr.</span><span>Date</span><span>Category</span><span>Notes</span><span />
                    </div>
                    {visibleFees.map((row) => (
                      <div key={row.localId} className="grid grid-cols-[1fr_80px_55px_105px_95px_1fr_28px] gap-1 items-center">
                        <input type="text" value={row.name} onChange={(e) => updateFeeRow(row.localId, { name: e.target.value })} placeholder="Name" className={inputCls} />
                        <input type="number" min="0" step="0.01" value={row.amount} onChange={(e) => updateFeeRow(row.localId, { amount: e.target.value })} placeholder="0.00" className={inputCls} />
                        <input type="text" value={row.currency} onChange={(e) => updateFeeRow(row.localId, { currency: e.target.value.toUpperCase() })} maxLength={5} className={inputCls} />
                        <input type="date" value={row.date} onChange={(e) => updateFeeRow(row.localId, { date: e.target.value })} className={inputCls} />
                        <select value={row.category} onChange={(e) => updateFeeRow(row.localId, { category: e.target.value as FeeCategory })} className={selectCls}>
                          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        <input type="text" value={row.notes} onChange={(e) => updateFeeRow(row.localId, { notes: e.target.value })} placeholder="Notes…" className={inputCls} />
                        <button type="button" onClick={() => removeFeeRow(row.localId)} className="p-1 text-stone-500 hover:text-red-400 transition-colors rounded"><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {visibleFees.length === 0 && <p className="text-xs text-stone-600 italic">No fees added.</p>}

                <button type="button" onClick={addBlankFee} className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors">
                  <Plus size={12} /> Add fee / tax
                </button>

                {Object.keys(feeTotals).length > 0 && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="text-stone-500">Fees total:</span>
                    {Object.entries(feeTotals).map(([cur, amt]) => (
                      <span key={cur} className="font-semibold text-stone-300">+{amt.toFixed(2)} {cur}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── DISCOUNTS ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Tag size={12} className="text-emerald-400" />
                  <span className="text-xs font-semibold text-stone-300 uppercase tracking-wider">Discounts</span>
                  <span className="flex-1 border-t border-stone-700" />
                </div>

                <p className="text-xs text-stone-500">One-off discounts applied at purchase (new subscriber offer, loyalty coupon, referral code). Amount in payment currency.</p>

                {visibleDiscounts.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_80px_55px_105px_1fr_28px] gap-1 text-xs text-stone-500 font-medium px-0.5">
                      <span>Description</span><span>Amount</span><span>Curr.</span><span>Date</span><span>Notes</span><span />
                    </div>
                    {visibleDiscounts.map((row) => (
                      <div key={row.localId} className="grid grid-cols-[1fr_80px_55px_105px_1fr_28px] gap-1 items-center">
                        <input type="text" value={row.name} onChange={(e) => updateDiscountRow(row.localId, { name: e.target.value })} placeholder="e.g. New subscriber discount" className={inputCls} />
                        <input type="number" min="0" step="0.01" value={row.amount} onChange={(e) => updateDiscountRow(row.localId, { amount: e.target.value })} placeholder="0.00" className={inputCls} />
                        <input type="text" value={row.currency} onChange={(e) => updateDiscountRow(row.localId, { currency: e.target.value.toUpperCase() })} maxLength={5} className={inputCls} />
                        <input type="date" value={row.date} onChange={(e) => updateDiscountRow(row.localId, { date: e.target.value })} className={inputCls} />
                        <input type="text" value={row.notes} onChange={(e) => updateDiscountRow(row.localId, { notes: e.target.value })} placeholder="Notes…" className={inputCls} />
                        <button type="button" onClick={() => removeDiscountRow(row.localId)} className="p-1 text-stone-500 hover:text-red-400 transition-colors rounded"><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {visibleDiscounts.length === 0 && <p className="text-xs text-stone-600 italic">No discounts added.</p>}

                <button type="button" onClick={addBlankDiscount} className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                  <Plus size={12} /> Add discount
                </button>

                {Object.keys(discountTotals).length > 0 && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="text-stone-500">Discounts total:</span>
                    {Object.entries(discountTotals).map(([cur, amt]) => (
                      <span key={cur} className="font-semibold text-emerald-400">-{amt.toFixed(2)} {cur}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── REFUNDS ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <RotateCcw size={12} className="text-sky-400" />
                  <span className="text-xs font-semibold text-stone-300 uppercase tracking-wider">Refunds</span>
                  <span className="flex-1 border-t border-stone-700" />
                </div>

                <p className="text-xs text-stone-500">Partial or full refunds received (e.g. damaged collector edition). Reduces the net cost of this purchase.</p>

                {visibleRefunds.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[80px_55px_105px_1fr_1fr_28px] gap-1 text-xs text-stone-500 font-medium px-0.5">
                      <span>Amount</span><span>Curr.</span><span>Date</span><span>Reason</span><span>Notes</span><span />
                    </div>
                    {visibleRefunds.map((row) => (
                      <div key={row.localId} className="grid grid-cols-[80px_55px_105px_1fr_1fr_28px] gap-1 items-center">
                        <input type="number" min="0" step="0.01" value={row.amount} onChange={(e) => updateRefundRow(row.localId, { amount: e.target.value })} placeholder="0.00" className={inputCls} />
                        <input type="text" value={row.currency} onChange={(e) => updateRefundRow(row.localId, { currency: e.target.value.toUpperCase() })} maxLength={5} className={inputCls} />
                        <input type="date" value={row.date} onChange={(e) => updateRefundRow(row.localId, { date: e.target.value })} className={inputCls} />
                        <input type="text" value={row.reason} onChange={(e) => updateRefundRow(row.localId, { reason: e.target.value })} placeholder="e.g. Damaged cover" className={inputCls} />
                        <input type="text" value={row.notes} onChange={(e) => updateRefundRow(row.localId, { notes: e.target.value })} placeholder="Notes…" className={inputCls} />
                        <button type="button" onClick={() => removeRefundRow(row.localId)} className="p-1 text-stone-500 hover:text-red-400 transition-colors rounded"><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {visibleRefunds.length === 0 && <p className="text-xs text-stone-600 italic">No refunds recorded.</p>}

                <button type="button" onClick={addBlankRefund} className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors">
                  <Plus size={12} /> Add refund
                </button>

                {Object.keys(refundTotals).length > 0 && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="text-stone-500">Refunds total:</span>
                    {Object.entries(refundTotals).map(([cur, amt]) => (
                      <span key={cur} className="font-semibold text-sky-400">-{amt.toFixed(2)} {cur}</span>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded px-2 py-1">{error}</p>}

              <div className="flex justify-end border-t border-stone-700 pt-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-1.5 rounded-xl text-sm transition-colors"
                >
                  {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : saveSuccess ? '✓ Saved' : <><Save size={13} /> Save</>}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
