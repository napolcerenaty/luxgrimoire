'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { CURRENCIES, SALE_PLATFORMS } from '@/components/sale/SaleFormFields'
import { type FeeEntry, type DiscountEntry, type FeeTemplate } from '@/hooks/useRecordSaleGroup'
import { X, Plus, MoveRight } from 'lucide-react'

export type { FeeEntry, DiscountEntry, FeeTemplate }

const INPUT = 'w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors'
const LABEL = 'block text-xs font-medium text-stone-400 mb-1'

const SIGNATURE_LABELS: Record<string, string> = {
  unsigned: 'Unsigned',
  signed: 'Signed',
  autopen: 'Autopen',
  digitally_signed: 'Digitally Signed',
  signed_bookplate: 'Signed Bookplate',
  stamped: 'Stamped',
}

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
  const feeKeyRef = useRef(0)
  const discountKeyRef = useRef(0)

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
    const initVariants: Record<string, string> = {}
    for (const ed of editions) {
      if (ed.variants.length >= 1) {
        initVariants[ed.editionId] = ed.variants[0].signatureType
      }
    }
    setSelectedVariants(initVariants)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const editionsNeedingSelection = editions.filter(e => e.variants.length > 1)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      selectedVariants,
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
            <input type="date" value={purchasedAt} onChange={e => setPurchasedAt(e.target.value)} className={INPUT} />
          </div>

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
                          className="accent-amber-500"
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
              <label className={LABEL}>Price paid (optional)</label>
              <input type="text" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="0.00" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Shipping (optional)</label>
              <input type="text" value={shippingAmount} onChange={e => setShippingAmount(e.target.value)} placeholder="0.00" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={INPUT}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Additional fees */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-400">Additional fees (optional)</span>
              <button type="button"
                onClick={() => { feeKeyRef.current++; setFeeEntries(prev => [...prev, { key: feeKeyRef.current, templateId: '', amount: '', currency }]) }}
                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors">
                <Plus size={12} /> Add fee
              </button>
            </div>
            {feeEntries.length === 0 && <p className="text-xs text-stone-500 italic">No additional fees</p>}
            <div className="space-y-2">
              {feeEntries.map(fee => (
                <div key={fee.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                  <select value={fee.templateId}
                    onChange={e => {
                      const tpl = feeTemplates.find(t => t.id === e.target.value)
                      setFeeEntries(prev => prev.map(f => f.key === fee.key ? {
                        ...f, templateId: e.target.value,
                        amount: tpl?.defaultAmount != null ? String(tpl.defaultAmount) : f.amount,
                        currency: tpl?.defaultCurrency ?? f.currency,
                      } : f))
                    }}
                    className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400 transition-colors">
                    <option value="">— Template —</option>
                    {feeTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.category ? ` (${t.category})` : ''}</option>
                    ))}
                  </select>
                  <input type="text" value={fee.amount}
                    onChange={e => setFeeEntries(prev => prev.map(f => f.key === fee.key ? { ...f, amount: e.target.value } : f))}
                    placeholder="0.00"
                    className="w-20 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400 transition-colors" />
                  <select value={fee.currency}
                    onChange={e => setFeeEntries(prev => prev.map(f => f.key === fee.key ? { ...f, currency: e.target.value } : f))}
                    className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400 transition-colors">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="button" onClick={() => setFeeEntries(prev => prev.filter(f => f.key !== fee.key))}
                    className="p-2 text-stone-500 hover:text-red-400 transition-colors">
                    <X size={14} />
                  </button>
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
                    onChange={e => setDiscountEntries(prev => prev.map(d => d.key === disc.key ? { ...d, amount: e.target.value } : d))}
                    placeholder="0.00"
                    className="w-20 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400 transition-colors" />
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
          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-stone-700 text-stone-400 text-sm hover:bg-stone-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold py-2 rounded-xl text-sm transition-colors">
              <MoveRight size={14} />
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
