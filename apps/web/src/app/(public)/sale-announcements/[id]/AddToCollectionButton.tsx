'use client'

import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { createPurchaseGroup } from '@/lib/api'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { BookPlus, Plus, X, MoveRight } from 'lucide-react'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF']
const INPUT = 'w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors'
const LABEL = 'block text-xs font-medium text-stone-400 mb-1'

const SALE_PLATFORMS = [
  { value: 'vinted', label: '🛍️ Vinted' },
  { value: 'ebay', label: '🛒 eBay' },
  { value: 'facebook', label: '📘 Facebook' },
  { value: 'instagram', label: '📷 Instagram' },
  { value: 'depop', label: '👗 Depop' },
  { value: 'whatnot', label: '🎉 Whatnot' },
  { value: 'local', label: '🤝 Local / In-person' },
  { value: 'other', label: '✏️ Other' },
]

const OWNERSHIP_OPTIONS = [
  { value: 'OWNED', label: 'Owned' },
  { value: 'PREORDER', label: 'Pre-order' },
  { value: 'SHIPPING', label: 'Shipping / In transit' },
] as const

interface FeeEntry { key: number; templateId: string; amount: string; currency: string }
interface DiscountEntry { key: number; name: string; amount: string; currency: string }
interface FeeTemplate { id: string; name: string; category: string | null; defaultAmount: number | null; defaultCurrency: string | null; isActive: boolean }

interface Props {
  saleAnnouncementId: string
  editionIds: string[]
  basePrice?: number
  currency: string
  compact?: boolean
}

export function AddToCollectionButton({ saleAnnouncementId, editionIds, basePrice, currency, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ownershipStatus, setOwnershipStatus] = useState<string>('OWNED')
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [totalAmount, setTotalAmount] = useState(basePrice != null ? String(basePrice) : '')
  const [shippingAmount, setShippingAmount] = useState('')
  const [selectedCurrency, setSelectedCurrency] = useState(currency || 'EUR')
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
    setOwnershipStatus('OWNED')
    setFeeEntries([])
    setDiscountEntries([])
    setIsSecondHand(false)
    setSourcePlatform('')
    setOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const feeDate = purchasedAt || new Date().toISOString().slice(0, 10)
    try {
      const parsedPrice = parseDecimalInput(totalAmount)
      const parsedShipping = parseDecimalInput(shippingAmount)

      const result = await createPurchaseGroup({
        saleAnnouncementId,
        totalAmount: parsedPrice,
        currency: selectedCurrency,
        shippingAmount: parsedShipping > 0 ? parsedShipping : undefined,
        purchasedAt: feeDate,
        ownershipStatus,
        editionIds,
        isSecondHand,
        sourcePlatform: isSecondHand && sourcePlatform ? sourcePlatform : undefined,
      })

      const purchaseGroupId = (result as any).group?.id ?? (result as any).id

      if (purchaseGroupId) {
        for (const fee of feeEntries) {
          const amount = parseDecimalInput(fee.amount)
          if (amount <= 0) continue
          const template = feeTemplates.find(t => t.id === fee.templateId)
          await authFetch('/fees', {
            method: 'POST',
            body: JSON.stringify({
              feeTemplateId: template?.id,
              name: template?.name ?? 'Fee',
              amount,
              currency: fee.currency,
              date: feeDate,
              category: template?.category ?? undefined,
              purchaseGroupId,
            }),
          })
        }

        for (const disc of discountEntries) {
          const amount = parseDecimalInput(disc.amount)
          if (amount <= 0 || !disc.name.trim()) continue
          await authFetch('/fees/discounts', {
            method: 'POST',
            body: JSON.stringify({
              name: disc.name.trim(),
              amount,
              currency: disc.currency,
              date: feeDate,
              purchaseGroupId,
            }),
          })
        }
      }

      setSuccess(true)
      setTimeout(() => { setOpen(false); setSuccess(false) }, 2000)
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
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
        {compact ? 'Add to Collection' : 'Add to My Collection'}
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
                <div className="text-4xl mb-3">✓</div>
                <p className="text-green-400 font-semibold">Added to your collection!</p>
                <p className="text-stone-500 text-sm mt-1">
                  {editionIds.length} edition{editionIds.length !== 1 ? 's' : ''} added
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

                {/* Fees */}
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
                          <option value="">— Template —</option>
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

                {/* Discounts */}
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
                          placeholder="e.g. Promo code, loyalty…"
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

                {/* Second hand */}
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isSecondHand}
                      onChange={e => { setIsSecondHand(e.target.checked); if (!e.target.checked) setSourcePlatform('') }}
                      className="w-4 h-4 rounded border-stone-600 bg-stone-800 accent-orange-500"
                    />
                    <span className="text-sm text-stone-300">🔄 Second hand</span>
                  </label>
                  {isSecondHand && (
                    <select
                      value={sourcePlatform}
                      onChange={e => setSourcePlatform(e.target.value)}
                      className={INPUT}
                    >
                      <option value="">— Select platform —</option>
                      {SALE_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  )}
                </div>

                <p className="text-xs text-stone-500">
                  Adds {editionIds.length} edition{editionIds.length !== 1 ? 's' : ''} to your collection as a bundle.
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
                    {submitting ? 'Adding…' : 'Add to Collection'}
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
