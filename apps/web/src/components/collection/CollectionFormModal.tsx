'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { CURRENCIES, SALE_PLATFORMS } from '@/components/sale/SaleFormFields'
import { type FeeEntry, type DiscountEntry, type FeeTemplate } from '@/hooks/useRecordSaleGroup'
import { isValidCalendarDate } from '@/lib/dateValidation'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { X, Plus, MoveRight } from 'lucide-react'

export type { FeeEntry, DiscountEntry, FeeTemplate }

const INPUT = 'w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-brand-400 transition-colors'
const LABEL = 'block text-xs font-medium text-stone-400 mb-1'
/** Swaps the border color of an input class string to flag an invalid field. */
const inpErr = (base: string, invalid: boolean) => invalid ? base.replace('border-stone-700', 'border-red-500/70') : base

const SIGNATURE_LABELS: Record<string, string> = {
  unsigned: 'Unsigned',
  signed: 'Signed',
  autopen: 'Autopen',
  digitally_signed: 'Digitally Signed',
  signed_bookplate: 'Signed Bookplate',
  stamped: 'Stamped',
}

const FEE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'VAT', label: 'VAT' },
  { value: 'CUSTOMS', label: 'Customs' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'FORWARDING', label: 'Forwarding' },
  { value: 'PRICE_ADJUSTMENT', label: 'Price Adjustment' },
  { value: 'OTHER', label: 'Other' },
]

const DEFAULT_OWNERSHIP_OPTIONS = [
  { value: 'PREORDER', label: 'Pre-order' },
  { value: 'SHIPPING', label: 'Shipping' },
  { value: 'OWNED', label: 'Own' },
  { value: 'BORROWED', label: 'Borrowed' },
  { value: 'LENDED', label: 'Lended' },
  { value: 'TO_SELL', label: 'To Sell' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'GIFTED_AWAY', label: 'Gifted Away' },
]

export interface CollectionFormData {
  ownershipStatus: string
  purchasedAt: string
  orderNumber: string
  totalAmount: string
  shippingAmount: string
  currency: string
  isSecondHand: boolean
  sourcePlatform: string
  feeEntries: FeeEntry[]
  discountEntries: DiscountEntry[]
  feeTemplates: FeeTemplate[]
  selectedVariants: Record<string, string>
  selectedEditionIds: string[]
  /** Optional per-edition base price override, keyed by editionId. Blank = split evenly. */
  editionPrices: Record<string, string>
}

export interface SaleEditionForModal {
  id: string
  editionId: string
  edition: { book?: { title?: string | null } | null } | null
  variants: Array<{
    id: string
    signatureType: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped'
    price: number | null
    currency: string | null
  }>
}

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string | null
  note?: string | null
  submitLabel?: string
  defaultOwnershipStatus?: string
  defaultPrice?: string
  defaultCurrency?: string
  ownershipOptions?: Array<{ value: string; label: string }>
  editions?: SaleEditionForModal[]
  error?: string | null
  submitting?: boolean
  onSubmit: (data: CollectionFormData) => Promise<void>
}

export function CollectionFormModal({
  open,
  onClose,
  title = 'Add to Collection',
  subtitle,
  note,
  submitLabel = 'Add to Collection',
  defaultOwnershipStatus = 'PREORDER',
  defaultPrice = '',
  defaultCurrency = 'EUR',
  ownershipOptions = DEFAULT_OWNERSHIP_OPTIONS,
  editions = [],
  error,
  submitting = false,
  onSubmit,
}: Props) {
  const [ownershipStatus, setOwnershipStatus] = useState(defaultOwnershipStatus)
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [totalAmount, setTotalAmount] = useState(defaultPrice)
  const [shippingAmount, setShippingAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [orderNumber, setOrderNumber] = useState('')
  const [isSecondHand, setIsSecondHand] = useState(false)
  const [sourcePlatform, setSourcePlatform] = useState('')
  const [feeEntries, setFeeEntries] = useState<FeeEntry[]>([])
  const [discountEntries, setDiscountEntries] = useState<DiscountEntry[]>([])
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const [selectedEditionIds, setSelectedEditionIds] = useState<string[]>([])
  const [editionPrices, setEditionPrices] = useState<Record<string, string>>({})
  const feeKeyRef = useRef(0)
  const discountKeyRef = useRef(0)

  // Client-side validation — mirrors backend's @Min(0) on fee/discount amounts and catches
  // dates that don't exist (e.g. 30 Feb) which native <input type="date"> doesn't always
  // reject on its own, so a bad entry doesn't just silently fail without explanation.
  const [validationError, setValidationError] = useState<string | null>(null)
  const [dateInvalid, setDateInvalid] = useState(false)
  const [totalInvalid, setTotalInvalid] = useState(false)
  const [shippingInvalid, setShippingInvalid] = useState(false)
  const [invalidFeeKeys, setInvalidFeeKeys] = useState<Set<number>>(new Set())
  const [invalidDiscountKeys, setInvalidDiscountKeys] = useState<Set<number>>(new Set())
  const [invalidPriceEditionIds, setInvalidPriceEditionIds] = useState<Set<string>>(new Set())

  // Two mutually exclusive ways to price a multi-book purchase: either every book gets its own
  // price (total is derived, summed below), or none do and the total is split evenly by the
  // backend. Filling in even one book price switches the whole form into per-book mode.
  const perBookPriceMode = selectedEditionIds.length > 1 && selectedEditionIds.some(id => (editionPrices[id] ?? '').trim() !== '')
  const editionPriceSum = selectedEditionIds.reduce((sum, id) => {
    const raw = (editionPrices[id] ?? '').trim()
    return sum + (raw === '' ? 0 : parseDecimalInput(raw))
  }, 0)

  useEffect(() => {
    if (perBookPriceMode) setTotalAmount(editionPriceSum.toFixed(2))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perBookPriceMode, editionPriceSum])

  const { data: feeTemplates = [] } = useQuery<FeeTemplate[]>({
    queryKey: ['fee-templates'],
    queryFn: () => authFetch<FeeTemplate[]>('/fees/templates?activeOnly=true'),
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    setOwnershipStatus(defaultOwnershipStatus)
    setPurchasedAt(new Date().toISOString().slice(0, 10))
    setTotalAmount(defaultPrice)
    setShippingAmount('')
    setCurrency(defaultCurrency)
    setOrderNumber('')
    setIsSecondHand(false)
    setSourcePlatform('')
    setFeeEntries([])
    setDiscountEntries([])
    setValidationError(null)
    setDateInvalid(false)
    setTotalInvalid(false)
    setShippingInvalid(false)
    setInvalidFeeKeys(new Set())
    setInvalidDiscountKeys(new Set())
    setInvalidPriceEditionIds(new Set())
    const initVariants: Record<string, string> = {}
    for (const ed of editions) {
      if (ed.variants.length >= 1) {
        initVariants[ed.editionId] = ed.variants[0].signatureType
      }
    }
    setSelectedVariants(initVariants)
    setSelectedEditionIds(editions.map(e => e.editionId))
    setEditionPrices({})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const editionsNeedingSelection = editions.filter(e => e.variants.length > 1 && selectedEditionIds.includes(e.editionId))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const nextInvalidFeeKeys = new Set(
      feeEntries.filter(f => f.amount !== '' && (isNaN(parseFloat(f.amount)) || parseFloat(f.amount) < 0)).map(f => f.key),
    )
    const nextInvalidDiscountKeys = new Set(
      discountEntries.filter(d => d.amount !== '' && (isNaN(parseFloat(d.amount)) || parseFloat(d.amount) < 0)).map(d => d.key),
    )
    const nextDateInvalid = !isValidCalendarDate(purchasedAt)
    const nextTotalInvalid = totalAmount !== '' && (isNaN(parseFloat(totalAmount)) || parseFloat(totalAmount) < 0)
    const nextShippingInvalid = shippingAmount !== '' && (isNaN(parseFloat(shippingAmount)) || parseFloat(shippingAmount) < 0)
    // Per-book mode is all-or-nothing: once any book has a price, every selected book needs one
    // (a partial set would leave the total ambiguous — see the "auto" placeholder confusion this replaced).
    const nextInvalidPriceEditionIds = new Set<string>()
    if (perBookPriceMode) {
      for (const id of selectedEditionIds) {
        const raw = (editionPrices[id] ?? '').trim()
        const n = parseFloat(raw.replace(',', '.'))
        if (raw === '' || isNaN(n) || n < 0) nextInvalidPriceEditionIds.add(id)
      }
    }

    setDateInvalid(nextDateInvalid)
    setTotalInvalid(nextTotalInvalid)
    setShippingInvalid(nextShippingInvalid)
    setInvalidFeeKeys(nextInvalidFeeKeys)
    setInvalidDiscountKeys(nextInvalidDiscountKeys)
    setInvalidPriceEditionIds(nextInvalidPriceEditionIds)

    if (nextDateInvalid) { setValidationError('Enter a valid purchase date.'); return }
    if (nextInvalidPriceEditionIds.size > 0) { setValidationError('Enter a price for every book above, or clear all of them to set one total price instead.'); return }
    if (nextTotalInvalid) { setValidationError('Price must be 0 or greater.'); return }
    if (nextShippingInvalid) { setValidationError('Shipping must be 0 or greater.'); return }
    if (nextInvalidFeeKeys.size > 0) { setValidationError('Fee amounts must be 0 or greater.'); return }
    if (nextInvalidDiscountKeys.size > 0) { setValidationError('Discount amounts must be 0 or greater.'); return }
    setValidationError(null)

    await onSubmit({
      ownershipStatus,
      purchasedAt,
      orderNumber,
      totalAmount,
      shippingAmount,
      currency,
      isSecondHand,
      sourcePlatform,
      feeEntries,
      discountEntries,
      feeTemplates,
      editionPrices,
      selectedVariants,
      selectedEditionIds,
    })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-serif font-semibold text-stone-100">{title}</h2>
          <button onClick={onClose} className="p-1 text-stone-500 hover:text-stone-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {subtitle && (
          <p className="text-sm text-stone-400">
            <span className="text-stone-200 font-medium">{subtitle}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Status */}
          <div>
            <label className={LABEL}>Status</label>
            <select value={ownershipStatus} onChange={e => setOwnershipStatus(e.target.value)} className={INPUT}>
              {ownershipOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Purchase date */}
          <div>
            <label className={LABEL}>Purchase date</label>
            <input type="date" value={purchasedAt} onChange={e => { setPurchasedAt(e.target.value); if (dateInvalid) { setDateInvalid(false); setValidationError(null) } }} className={inpErr(INPUT, dateInvalid)} />
          </div>

          {/* Edition selection (multi-select when > 1 edition) */}
          {editions.length > 1 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-stone-400">Select editions to add</span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {editions.map(ed => {
                  const checked = selectedEditionIds.includes(ed.editionId)
                  return (
                    <label key={ed.editionId} className="flex items-center gap-2.5 cursor-pointer rounded-lg border border-stone-700 px-3 py-2 hover:border-stone-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedEditionIds(prev =>
                          checked ? prev.filter(id => id !== ed.editionId) : [...prev, ed.editionId]
                        )}
                        className="w-4 h-4 accent-brand-500 shrink-0"
                      />
                      <span className="text-sm text-stone-300 leading-tight flex-1">
                        {ed.edition?.book?.title ?? 'Edition'}
                      </span>
                      {checked && selectedEditionIds.length > 1 && (
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={editionPrices[ed.editionId] ?? ''}
                          onChange={e => {
                            setEditionPrices(prev => ({ ...prev, [ed.editionId]: e.target.value }))
                            if (invalidPriceEditionIds.has(ed.editionId)) {
                              setInvalidPriceEditionIds(prev => { const next = new Set(prev); next.delete(ed.editionId); return next })
                              setValidationError(null)
                            }
                          }}
                          onClick={e => e.stopPropagation()}
                          className={`w-16 bg-stone-800 border rounded px-1.5 py-0.5 text-stone-100 text-xs text-right shrink-0 ${invalidPriceEditionIds.has(ed.editionId) ? 'border-red-500/70' : 'border-stone-600'}`}
                        />
                      )}
                    </label>
                  )
                })}
              </div>
              {selectedEditionIds.length === 0 && (
                <p className="text-xs text-red-400">Select at least one edition</p>
              )}
              {selectedEditionIds.length > 1 && (
                <p className="text-[11px] text-stone-500">
                  {perBookPriceMode
                    ? `Pricing books individually — fill in all ${selectedEditionIds.length}, total below is calculated automatically.`
                    : 'Leave every book price blank and set one total below to split it evenly — or price each book individually here instead.'}
                </p>
              )}
            </div>
          )}

          {/* Edition variants (conditional) */}
          {editionsNeedingSelection.length > 0 && (
            <div className="space-y-3">
              <span className="text-xs font-medium text-stone-400">Edition variants</span>
              {editionsNeedingSelection.map(ed => (
                <div key={ed.editionId} className="rounded-xl border border-stone-700 p-3 space-y-2">
                  <p className="text-xs text-stone-400 font-medium">
                    {ed.edition?.book?.title ?? 'Edition'}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {ed.variants.map(v => (
                      <label key={v.id} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`variant-${ed.editionId}`}
                          value={v.signatureType}
                          checked={selectedVariants[ed.editionId] === v.signatureType}
                          onChange={() => setSelectedVariants(prev => ({ ...prev, [ed.editionId]: v.signatureType }))}
                          className="accent-brand-500"
                        />
                        <span className="text-sm text-stone-300">
                          {SIGNATURE_LABELS[v.signatureType] ?? v.signatureType}
                          {v.price != null && (
                            <span className="text-stone-500 ml-1">({v.price} {v.currency ?? currency})</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Price / Shipping / Currency */}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
            <div>
              <label className={LABEL}>{perBookPriceMode ? 'Price paid' : 'Price paid (optional)'}</label>
              <input
                type="text"
                value={totalAmount}
                disabled={perBookPriceMode}
                onChange={e => { setTotalAmount(e.target.value); if (totalInvalid) { setTotalInvalid(false); setValidationError(null) } }}
                placeholder="0.00"
                className={`${inpErr(INPUT, totalInvalid)} ${perBookPriceMode ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </div>
            <div>
              <label className={LABEL}>Shipping (optional)</label>
              <input type="text" value={shippingAmount} onChange={e => { setShippingAmount(e.target.value); if (shippingInvalid) { setShippingInvalid(false); setValidationError(null) } }} placeholder="0.00" className={inpErr(INPUT, shippingInvalid)} />
            </div>
            <div>
              <label className={LABEL}>Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={INPUT}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {perBookPriceMode && (
            <p className="text-[11px] text-stone-500 -mt-2">Price paid is calculated automatically from the book prices above.</p>
          )}

          {/* Additional fees */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-400">Additional fees (optional)</span>
              <button type="button"
                onClick={() => { feeKeyRef.current++; setFeeEntries(prev => [...prev, { key: feeKeyRef.current, templateId: '', amount: '', currency, name: '', category: 'OTHER' }]) }}
                className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors">
                <Plus size={12} /> Add fee
              </button>
            </div>
            {feeEntries.length === 0 && <p className="text-xs text-stone-500 italic">No additional fees</p>}
            <div className="space-y-2">
              {feeEntries.map(fee => (
                <div key={fee.key} className="flex flex-col gap-2 border border-stone-800 rounded-xl p-2">
                  {/* Fee template pills — same pattern as the collection entry's Edit Costs panel */}
                  {feeTemplates.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {feeTemplates.map(t => (
                        <button key={t.id} type="button"
                          onClick={() => setFeeEntries(prev => prev.map(f => f.key === fee.key ? {
                            ...f, templateId: t.id, name: t.name,
                            amount: t.defaultAmount != null ? String(t.defaultAmount) : f.amount,
                            currency: t.defaultCurrency ?? f.currency,
                            category: t.category ?? f.category,
                          } : f))}
                          className={`px-2 py-0.5 rounded text-xs border transition-colors ${fee.templateId === t.id ? 'border-brand-500/60 text-brand-400' : 'border-stone-600 text-stone-400 hover:border-brand-500/40 hover:text-brand-400'}`}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    {fee.templateId ? (
                      <div className="flex-1 min-w-0 flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-xl border border-stone-700 text-stone-300">
                        <span className="flex-1 truncate">{fee.name}</span>
                        <span className="text-stone-500 shrink-0">{FEE_CATEGORIES.find(c => c.value === fee.category)?.label ?? fee.category}</span>
                        <button type="button" onClick={() => setFeeEntries(prev => prev.map(f => f.key === fee.key ? { ...f, templateId: '', name: '', category: 'OTHER' } : f))}
                          className="text-stone-500 hover:text-red-400 transition-colors shrink-0">
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <input type="text" value={fee.name}
                          onChange={e => setFeeEntries(prev => prev.map(f => f.key === fee.key ? { ...f, name: e.target.value } : f))}
                          placeholder="Fee name"
                          className="flex-1 min-w-0 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs placeholder:text-stone-500 focus:outline-none focus:border-brand-400 transition-colors" />
                        <select value={fee.category}
                          onChange={e => setFeeEntries(prev => prev.map(f => f.key === fee.key ? { ...f, category: e.target.value } : f))}
                          className="w-32 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-brand-400 transition-colors">
                          {FEE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </>
                    )}
                    <button type="button" onClick={() => setFeeEntries(prev => prev.filter(f => f.key !== fee.key))}
                      className="p-2 text-stone-500 hover:text-red-400 transition-colors shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={fee.amount}
                      onChange={e => {
                        setFeeEntries(prev => prev.map(f => f.key === fee.key ? { ...f, amount: e.target.value } : f))
                        if (invalidFeeKeys.has(fee.key)) { setInvalidFeeKeys(prev => { const next = new Set(prev); next.delete(fee.key); return next }); setValidationError(null) }
                      }}
                      placeholder="0.00"
                      className={inpErr('w-24 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-brand-400 transition-colors', invalidFeeKeys.has(fee.key))} />
                    <select value={fee.currency}
                      onChange={e => setFeeEntries(prev => prev.map(f => f.key === fee.key ? { ...f, currency: e.target.value } : f))}
                      className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-brand-400 transition-colors">
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Discounts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-400">Discounts (optional)</span>
              <button type="button"
                onClick={() => { discountKeyRef.current++; setDiscountEntries(prev => [...prev, { key: discountKeyRef.current, name: '', amount: '', currency }]) }}
                className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors">
                <Plus size={12} /> Add discount
              </button>
            </div>
            {discountEntries.length === 0 && <p className="text-xs text-stone-500 italic">No discounts</p>}
            <div className="space-y-2">
              {discountEntries.map(disc => (
                <div key={disc.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                  <input type="text" value={disc.name}
                    onChange={e => setDiscountEntries(prev => prev.map(d => d.key === disc.key ? { ...d, name: e.target.value } : d))}
                    placeholder="e.g. Promo code, loyalty…"
                    className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400 transition-colors" />
                  <input type="text" value={disc.amount}
                    onChange={e => {
                      setDiscountEntries(prev => prev.map(d => d.key === disc.key ? { ...d, amount: e.target.value } : d))
                      if (invalidDiscountKeys.has(disc.key)) { setInvalidDiscountKeys(prev => { const next = new Set(prev); next.delete(disc.key); return next }); setValidationError(null) }
                    }}
                    placeholder="0.00"
                    className={inpErr('w-20 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400 transition-colors', invalidDiscountKeys.has(disc.key))} />
                  <select value={disc.currency}
                    onChange={e => setDiscountEntries(prev => prev.map(d => d.key === disc.key ? { ...d, currency: e.target.value } : d))}
                    className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400 transition-colors">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="button" onClick={() => setDiscountEntries(prev => prev.filter(d => d.key !== disc.key))}
                    className="p-2 text-stone-500 hover:text-red-400 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Order number + second hand */}
          <div className="flex flex-col gap-2">
            <div>
              <label className={LABEL}>Order number (optional)</label>
              <input type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="e.g. 12345678" className={INPUT} />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isSecondHand}
                onChange={e => { setIsSecondHand(e.target.checked); if (!e.target.checked) setSourcePlatform('') }}
                className="w-4 h-4 rounded border-stone-600 bg-stone-800 accent-orange-500"
              />
              <span className="text-sm text-stone-300">&#x1F504; Second hand</span>
            </label>
            {isSecondHand && (
              <select value={sourcePlatform} onChange={e => setSourcePlatform(e.target.value)} className={INPUT}>
                <option value="">Select platform (optional)</option>
                {SALE_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            )}
          </div>

          {note && <p className="text-xs text-stone-500">{note}</p>}
          {validationError && <p className="text-xs text-red-400">{validationError}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-stone-700 text-stone-400 text-sm hover:bg-stone-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting || (editions.length > 1 && selectedEditionIds.length === 0)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-brand-500 hover:bg-brand-400 disabled:opacity-60 text-stone-950 font-semibold py-2 rounded-xl text-sm transition-colors">
              <MoveRight size={14} />
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
