'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { createPurchaseGroup } from '@/lib/api'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { BookPlus, LogIn, Plus, X, MoveRight } from 'lucide-react'
import { CURRENCIES, SALE_PLATFORMS } from '@/components/sale/SaleFormFields'
import { useRecordSaleGroup, type FeeEntry, type DiscountEntry, type FeeTemplate } from '@/hooks/useRecordSaleGroup'
import { useAuth } from '@/components/AuthProvider'

const INPUT = 'w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors'
const LABEL = 'block text-xs font-medium text-stone-400 mb-1'

const OWNERSHIP_OPTIONS = [
  { value: 'OWNED', label: 'Owned' },
  { value: 'PREORDER', label: 'Pre-order' },
  { value: 'SHIPPING', label: 'Shipping / In transit' },
] as const

const SIGNATURE_LABELS: Record<string, string> = {
  unsigned: 'Unsigned',
  signed: 'Signed',
  digitally_signed: 'Digitally Signed',
  signed_bookplate: 'Signed Bookplate',
}

export interface SaleEditionData {
  editionId: string
  edition: { book?: { title?: string | null } | null } | null
  variants: Array<{
    id: string
    signatureType: 'unsigned' | 'signed' | 'digitally_signed' | 'signed_bookplate'
    price: number | null
    currency: string | null
  }>
}

interface Props {
  saleAnnouncementId: string
  editions: SaleEditionData[]
  basePrice?: number
  currency: string
  compact?: boolean
  defaultOwnershipStatus?: string
  triggerLabel?: string
}

export function AddToCollectionButton({ saleAnnouncementId, editions, basePrice, currency, compact, defaultOwnershipStatus = 'OWNED', triggerLabel }: Props) {
  const { user } = useAuth()
  const { postFeesAndDiscounts } = useRecordSaleGroup()
  const [open, setOpen] = useState(false)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ownershipStatus, setOwnershipStatus] = useState<string>(defaultOwnershipStatus)
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [totalAmount, setTotalAmount] = useState(basePrice != null ? String(basePrice) : '')
  const [shippingAmount, setShippingAmount] = useState('')
  const [selectedCurrency, setSelectedCurrency] = useState(currency || 'EUR')
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const [feeEntries, setFeeEntries] = useState<FeeEntry[]>([])
  const [discountEntries, setDiscountEntries] = useState<DiscountEntry[]>([])
  const [isSecondHand, setIsSecondHand] = useState(false)
  const [sourcePlatform, setSourcePlatform] = useState('')
  const feeKeyRef = useRef(0)
  const discountKeyRef = useRef(0)

  const { data: feeTemplates = [] } = useQuery<FeeTemplate[]>({
    queryKey: ['fee-templates'],
    queryFn: () => authFetch<FeeTemplate[]>('/fees/templates?activeOnly=true'),
    enabled: open,
  })

  const openModal = () => {
    setError(null)
    setSuccess(false)
    setPurchasedAt(new Date().toISOString().slice(0, 10))
    setTotalAmount(basePrice != null ? String(basePrice) : '')
    setShippingAmount('')
    setSelectedCurrency(currency || 'EUR')
    setOwnershipStatus(defaultOwnershipStatus)
    setFeeEntries([])
    setDiscountEntries([])
    setIsSecondHand(false)
    setSourcePlatform('')
    const initVariants: Record<string, string> = {}
    for (const ed of editions) {
      if (ed.variants.length >= 1) {
        initVariants[ed.editionId] = ed.variants[0].signatureType
      }
    }
    setSelectedVariants(initVariants)
    setOpen(true)
  }

  const editionsNeedingSelection = editions.filter(e => e.variants.length > 1)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const feeDate = purchasedAt || new Date().toISOString().slice(0, 10)
    try {
      const parsedPrice = parseDecimalInput(totalAmount)
      const parsedShipping = parseDecimalInput(shippingAmount)

      const editionIds = editions.map(ed => ed.editionId)
      const editionSignatureTypes: Record<string, string> = {}
      for (const ed of editions) {
        const chosen = selectedVariants[ed.editionId]
        if (chosen) editionSignatureTypes[ed.editionId] = chosen
      }

      const result = await createPurchaseGroup({
        saleAnnouncementId,
        totalAmount: parsedPrice,
        currency: selectedCurrency,
        shippingAmount: parsedShipping > 0 ? parsedShipping : undefined,
        purchasedAt: feeDate,
        ownershipStatus,
        editionIds,
        editionSignatureTypes: Object.keys(editionSignatureTypes).length > 0 ? editionSignatureTypes : undefined,
        isSecondHand,
        sourcePlatform: isSecondHand && sourcePlatform ? sourcePlatform : undefined,
      })

      const purchaseGroupId = (result as any).group?.id ?? (result as any).id

      if (purchaseGroupId) {
        await postFeesAndDiscounts(purchaseGroupId, feeEntries, discountEntries, feeTemplates, feeDate)
      }

      setSuccess(true)
      setTimeout(() => { setOpen(false); setSuccess(false) }, 2000)
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div className={compact
        ? "flex items-center gap-1.5 text-xs bg-stone-800/60 border border-stone-700 px-3 py-1.5 rounded-lg"
        : "inline-flex items-center gap-2 bg-stone-800/60 border border-stone-700 px-4 py-2 rounded-lg text-sm"
      }>
        <LogIn size={compact ? 13 : 16} className="text-amber-400 shrink-0" />
        <span className="text-stone-400">
          <Link href="/login" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">
            Sign in
          </Link>
          {' '}to add to collection
        </span>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={openModal}
        className={compact
          ? "flex items-center gap-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-500/60 font-medium px-3 py-1.5 rounded-lg transition-colors"
          : "inline-flex items-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        }
      >
        <BookPlus size={compact ? 13 : 16} />
        {triggerLabel ?? (compact ? 'Add to Collection' : 'Add to My Collection')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="w-full max-w-sm bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-serif font-semibold text-stone-100">Add to Collection</h2>
              <button onClick={() => setOpen(false)} className="p-1 text-stone-500 hover:text-stone-200 transition-colors">
                <X size={16} />
              </button>
            </div>

            {success ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">&#10003;</div>
                <p className="text-green-400 font-semibold">Added to your collection!</p>
                <p className="text-stone-500 text-sm mt-1">
                  {editions.length} edition{editions.length !== 1 ? 's' : ''} added
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={LABEL}>Status</label>
                  <select value={ownershipStatus} onChange={e => setOwnershipStatus(e.target.value)} className={INPUT}>
                    {OWNERSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className={LABEL}>Purchase date</label>
                  <input type="date" value={purchasedAt} onChange={e => setPurchasedAt(e.target.value)} className={INPUT} />
                </div>

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
                                  <span className="text-stone-500 ml-1">({v.price} {v.currency ?? selectedCurrency})</span>
                                )}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

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
                    <select value={selectedCurrency} onChange={e => setSelectedCurrency(e.target.value)} className={INPUT}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-stone-400">Additional fees (optional)</span>
                    <button type="button"
                      onClick={() => { feeKeyRef.current++; setFeeEntries(prev => [...prev, { key: feeKeyRef.current, templateId: '', amount: '', currency: selectedCurrency }]) }}
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
                          className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400">
                          <option value="">Template</option>
                          {feeTemplates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}{t.category ? ` (${t.category})` : ''}</option>
                          ))}
                        </select>
                        <input type="text" value={fee.amount}
                          onChange={e => setFeeEntries(prev => prev.map(f => f.key === fee.key ? { ...f, amount: e.target.value } : f))}
                          placeholder="0.00"
                          className="w-20 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400" />
                        <select value={fee.currency}
                          onChange={e => setFeeEntries(prev => prev.map(f => f.key === fee.key ? { ...f, currency: e.target.value } : f))}
                          className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400">
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

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-stone-400">Discounts (optional)</span>
                    <button type="button"
                      onClick={() => { discountKeyRef.current++; setDiscountEntries(prev => [...prev, { key: discountKeyRef.current, name: '', amount: '', currency: selectedCurrency }]) }}
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
                          placeholder="e.g. Promo code, loyalty"
                          className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400" />
                        <input type="text" value={disc.amount}
                          onChange={e => setDiscountEntries(prev => prev.map(d => d.key === disc.key ? { ...d, amount: e.target.value } : d))}
                          placeholder="0.00"
                          className="w-20 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400" />
                        <select value={disc.currency}
                          onChange={e => setDiscountEntries(prev => prev.map(d => d.key === disc.key ? { ...d, currency: e.target.value } : d))}
                          className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400">
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

                <div className="flex flex-col gap-2">
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
                    <select
                      value={sourcePlatform}
                      onChange={e => setSourcePlatform(e.target.value)}
                      className={INPUT}
                    >
                      <option value="">Select platform</option>
                      {SALE_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  )}
                </div>

                <p className="text-xs text-stone-500">
                  {editions.length === 1
                    ? 'Adds this edition to your collection.'
                    : `Adds ${editions.length} editions to your collection.`}
                </p>

                {error && <p className="text-xs text-red-400">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setOpen(false)}
                    className="flex-1 py-2 rounded-xl border border-stone-700 text-stone-400 text-sm hover:bg-stone-800 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold py-2 rounded-xl text-sm transition-colors">
                    <MoveRight size={14} />
                    {submitting ? 'Adding...' : 'Add to Collection'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}