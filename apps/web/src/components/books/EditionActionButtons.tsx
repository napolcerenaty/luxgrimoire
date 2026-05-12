'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { createPurchaseGroup } from '@/lib/api'
import { Bookmark, BookmarkCheck, BookPlus, CheckCircle, Loader2, LogIn, Megaphone, Plus, X } from 'lucide-react'
import { CURRENCIES, SALE_PLATFORMS } from '@/components/sale/SaleFormFields'
import { useModalState } from '@/hooks/useModalState'

const INPUT = 'w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors'
const LABEL = 'block text-xs font-medium text-stone-400 mb-1'

const OWNERSHIP_OPTIONS = [
  { value: 'OWNED', label: 'Owned' },
  { value: 'PREORDER', label: 'Pre-order' },
  { value: 'SHIPPING', label: 'Shipping / In transit' },
  { value: 'BORROWED', label: 'Borrowed' },
  { value: 'LENDED', label: 'Lent out' },
] as const
type OwnershipOption = typeof OWNERSHIP_OPTIONS[number]['value']

interface FeeEntry { key: number; templateId: string; amount: string; currency: string }
interface DiscountEntry { key: number; name: string; amount: string; currency: string }
interface FeeTemplate { id: string; name: string; category: string | null; defaultAmount: number | null; defaultCurrency: string | null; isActive: boolean }
interface EntryStatus { status: 'none' | 'wishlist' | 'collection'; entryId?: string }

interface Props {
  editionId: string
  bookTitle: string | null
  basePrice?: string | null
  currency?: string | null
  bundles: Array<{ id: string; title: string }>
  generalSaleDate?: string | null
  saleAnnouncementId?: string | null
}

export function EditionActionButtons({ editionId, bookTitle, basePrice, currency, bundles, generalSaleDate, saleAnnouncementId }: Props) {
  const { user } = useAuth()
  const isFutureSale = !!generalSaleDate && new Date(generalSaleDate) > new Date()
  const [status, setStatus] = useState<EntryStatus['status'] | 'loading'>('loading')
  const [entryId, setEntryId] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const { isOpen: modalOpen, open: _openModal, close: closeModal } = useModalState()
  const [step, setStep] = useState<'bundle' | 'form'>('form')
  const [addedOnce, setAddedOnce] = useState(false)
  const [selectedBundle, setSelectedBundle] = useState<{ id: string; title: string } | null>(null)
  const [bundleFetching, setBundleFetching] = useState(false)

  // Form state — mirrors wishlist "Move to Collection" modal exactly
  const [moveDate, setMoveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [movePrice, setMovePrice] = useState(basePrice ?? '')
  const [moveCurrency, setMoveCurrency] = useState(currency ?? 'EUR')
  const [ownershipStatus, setOwnershipStatus] = useState<OwnershipOption>('PREORDER')
  const [shippingPrice, setShippingPrice] = useState('')
  const [feeEntries, setFeeEntries] = useState<FeeEntry[]>([])
  const [discountEntries, setDiscountEntries] = useState<DiscountEntry[]>([])
  const [isSecondHand, setIsSecondHand] = useState(false)
  const [sourcePlatform, setSourcePlatform] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const feeKeyRef = useRef(0)
  const discountKeyRef = useRef(0)

  const { data: feeTemplates = [] } = useQuery<FeeTemplate[]>({
    queryKey: ['fee-templates'],
    queryFn: () => authFetch<FeeTemplate[]>('/fees/templates?activeOnly=true'),
    enabled: modalOpen,
  })

  useEffect(() => {
    if (!user) { setStatus('none'); return }
    authFetch<EntryStatus>(`/collection/status/${editionId}`)
      .then(res => { setStatus(res.status); setEntryId(res.entryId ?? null) })
      .catch(() => setStatus('none'))
  }, [editionId, user])

  const handleAddWishlist = async () => {
    setIsPending(true)
    try {
      const res = await authFetch<{ id: string }>('/collection/wishlist', {
        method: 'POST',
        body: JSON.stringify({ bookEditionId: editionId }),
      })
      setStatus('wishlist')
      setEntryId(res.id)
    } catch { /* user may not be signed in */ } finally { setIsPending(false) }
  }

  const handleRemoveWishlist = async () => {
    if (!entryId) return
    setIsPending(true)
    try {
      await authFetch<void>(`/collection/${entryId}`, { method: 'DELETE' })
      setStatus('none')
      setEntryId(null)
    } finally { setIsPending(false) }
  }

  const openModal = () => {
    setError(null)
    setMoveDate(new Date().toISOString().slice(0, 10))
    setMovePrice(basePrice ?? '')
    setMoveCurrency(currency ?? 'EUR')
    setOwnershipStatus('PREORDER')
    setShippingPrice('')
    setFeeEntries([])
    setDiscountEntries([])
    setIsSecondHand(false)
    setSourcePlatform('')
    setSelectedBundle(null)
    setStep(bundles.length > 0 ? 'bundle' : 'form')
    _openModal()
  }

  const handleAddAsSet = async (bundle: { id: string; title: string }) => {
    setBundleFetching(true)
    try {
      const ann = await authFetch<{ editions?: { editionId: string }[] }>(`/announcements/${bundle.id}`)
      setSelectedBundle({ ...bundle, editionIds: ann.editions?.map(e => e.editionId) ?? [] } as any)
      setStep('form')
    } catch {
      setError('Failed to load bundle editions. Please try again.')
    } finally {
      setBundleFetching(false)
    }
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    setError(null)
    const feeDate = moveDate || new Date().toISOString().slice(0, 10)
    const parsedPrice = parseDecimalInput(movePrice)
    const parsedShipping = parseDecimalInput(shippingPrice)
    try {
      let purchaseGroupId: string | null = null

      if (selectedBundle) {
        // ── Bundle / set path ──────────────────────────────────────────────
        const bundleEditionIds: string[] = (selectedBundle as any).editionIds ?? []
        // Make sure current edition is included
        const allIds = bundleEditionIds.includes(editionId)
          ? bundleEditionIds
          : [...bundleEditionIds, editionId]
        const result = await createPurchaseGroup({
          saleAnnouncementId: selectedBundle.id,
          editionIds: allIds,
          totalAmount: parsedPrice > 0 ? parsedPrice : 0,
          currency: moveCurrency,
          shippingAmount: parsedShipping > 0 ? parsedShipping : undefined,
          purchasedAt: feeDate,
          ownershipStatus,
          isSecondHand,
          sourcePlatform: sourcePlatform || undefined,
        })
        purchaseGroupId = (result as any).group?.id ?? (result as any).id
        setStatus('collection')
      } else {
        // ── Single-edition path ────────────────────────────────────────────
        let targetEntryId: string

        if (status === 'wishlist' && entryId) {
          const body: Record<string, unknown> = { isWishlist: false, ownershipStatus }
          if (moveDate) body.acquiredAt = new Date(moveDate).toISOString()
          await authFetch<void>(`/collection/${entryId}`, { method: 'PATCH', body: JSON.stringify(body) })
          targetEntryId = entryId
          setStatus('collection')
        } else {
          const res = await authFetch<{ id: string }>('/collection', {
            method: 'POST',
            body: JSON.stringify({ bookEditionId: editionId, ownershipStatus }),
          })
          targetEntryId = res.id
          if (moveDate) {
            await authFetch<void>(`/collection/${targetEntryId}`, {
              method: 'PATCH',
              body: JSON.stringify({ acquiredAt: new Date(moveDate).toISOString() }),
            })
          }
          setEntryId(res.id)
          if (status !== 'collection') setStatus('collection')
        }

        const hasFees = feeEntries.some(f => parseDecimalInput(f.amount) > 0)
        const hasDiscounts = discountEntries.some(d => parseDecimalInput(d.amount) > 0)
        if (parsedPrice > 0 || parsedShipping > 0 || hasFees || hasDiscounts) {
          const pgRes = await authFetch<{ id: string }>(`/collection/bundles/for-entry/${targetEntryId}`, {
            method: 'POST',
            body: JSON.stringify({
              totalAmount: parsedPrice > 0 ? parsedPrice : 0,
              currency: moveCurrency,
              shippingAmount: parsedShipping > 0 ? parsedShipping : undefined,
              purchasedAt: feeDate,
              isSecondHand,
              sourcePlatform: sourcePlatform || undefined,
            }),
          })
          purchaseGroupId = pgRes.id
        }
      }

      // Additional custom fees
      for (const fee of feeEntries) {
        const parsedAmount = parseDecimalInput(fee.amount)
        if (parsedAmount <= 0) continue
        const template = feeTemplates.find(t => t.id === fee.templateId)
        await authFetch('/fees', {
          method: 'POST',
          body: JSON.stringify({
            feeTemplateId: template?.id,
            name: template?.name ?? 'Fee',
            amount: parsedAmount,
            currency: fee.currency,
            date: feeDate,
            category: template?.category ?? undefined,
            ...(purchaseGroupId ? { purchaseGroupId } : {}),
          }),
        })
      }

      // Discounts
      for (const disc of discountEntries) {
        const parsedAmount = parseDecimalInput(disc.amount)
        if (parsedAmount <= 0 || !disc.name.trim()) continue
        await authFetch('/fees/discounts', {
          method: 'POST',
          body: JSON.stringify({
            name: disc.name.trim(),
            amount: parsedAmount,
            currency: disc.currency,
            date: feeDate,
            ...(purchaseGroupId ? { purchaseGroupId } : {}),
          }),
        })
      }

      setAddedOnce(true)
      closeModal()
      window.dispatchEvent(new CustomEvent('collection:updated', { detail: { editionId } }))
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') return null

  if (!user) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-stone-700/60 bg-stone-800/40">
        <LogIn size={16} className="text-amber-400 shrink-0" />
        <p className="text-sm text-stone-400 flex-1">Sign in to add this edition to your collection or wishlist.</p>
        <Link
          href="/login"
          className="shrink-0 text-xs font-medium text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline transition-colors"
        >
          Sign in
        </Link>
      </div>
    )
  }

  const isInCollection = status === 'collection'

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* Sale Announcement button — shown instead of wishlist when there's a linked future sale */}
        {isFutureSale && saleAnnouncementId ? (
          <Link
            href={`/sale-announcements/${saleAnnouncementId}`}
            className="inline-flex items-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Megaphone size={16} />View Sale Announcement
          </Link>
        ) : (
          /* Wishlist toggle — hidden once in collection */
          !isInCollection && (
            status === 'wishlist' ? (
              <button onClick={handleRemoveWishlist} disabled={isPending}
                className="inline-flex items-center gap-2 bg-stone-800 hover:bg-stone-700 text-amber-400 disabled:opacity-50 px-4 py-2 rounded-lg text-sm transition-colors border border-stone-700">
                <BookmarkCheck size={16} />On Wishlist
              </button>
            ) : (
              <button onClick={handleAddWishlist} disabled={isPending}
                className="inline-flex items-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-200 disabled:opacity-50 px-4 py-2 rounded-lg text-sm transition-colors border border-stone-700 hover:border-stone-600">
                <Bookmark size={16} />{isPending ? 'Adding…' : 'Add to Wishlist'}
              </button>
            )
          )
        )}

        {/* Collection state — hidden if sale date is in the future */}
        {!isFutureSale && (isInCollection ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-stone-400">
              <CheckCircle size={15} className="text-amber-400" />
              {addedOnce ? 'Added to collection' : 'In your collection'}
            </span>
            <button onClick={openModal}
              className="text-xs text-stone-500 hover:text-stone-300 underline-offset-2 hover:underline transition-colors">
              + Add another copy
            </button>
          </div>
        ) : (
          <button onClick={openModal}
            className="inline-flex items-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <BookPlus size={16} />Add to Collection
          </button>
        ))}
      </div>

      {/* Modal — identical to wishlist "Move to Collection" */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="w-full max-w-sm bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-serif font-semibold text-stone-100">
                {status === 'wishlist' ? 'Move to Collection' : 'Add to Collection'}
              </h2>
              <button onClick={() => closeModal()} className="p-1 text-stone-500 hover:text-stone-200 transition-colors">
                <X size={16} />
              </button>
            </div>
            {bookTitle && (
              <p className="text-sm text-stone-400">
                <span className="text-stone-200 font-medium">{bookTitle}</span>
              </p>
            )}

            {step === 'bundle' && bundles.length > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-stone-400">This edition was part of a bundle:</p>
                {bundles.map(b => (
                  <p key={b.id} className="text-sm font-medium text-stone-200">📦 {b.title}</p>
                ))}
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="flex flex-col gap-2 pt-2">
                  <button onClick={() => { setSelectedBundle(null); setStep('form') }}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
                    Add just this book
                  </button>
                  <button
                    onClick={() => handleAddAsSet(bundles[0])}
                    disabled={bundleFetching}
                    className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2">
                    {bundleFetching ? <><Loader2 size={14} className="animate-spin" />Loading…</> : 'Add as set'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {selectedBundle && (
                  <p className="text-xs text-stone-400 -mt-1">
                    📦 Adding as set: <span className="text-stone-200 font-medium">{selectedBundle.title}</span>
                  </p>
                )}
                <div>
                  <label className={LABEL}>Status</label>
                  <select value={ownershipStatus} onChange={e => setOwnershipStatus(e.target.value as OwnershipOption)} className={INPUT}>
                    {OWNERSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className={LABEL}>Purchase date</label>
                  <input type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} className={INPUT} />
                </div>

                <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
                  <div>
                    <label className={LABEL}>Price paid (optional)</label>
                    <input type="text" value={movePrice} onChange={e => setMovePrice(e.target.value)} placeholder="0.00" className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Shipping (optional)</label>
                    <input type="text" value={shippingPrice} onChange={e => setShippingPrice(e.target.value)} placeholder="0.00" className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Currency</label>
                    <select value={moveCurrency} onChange={e => setMoveCurrency(e.target.value)} className={INPUT}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={LABEL.replace('mb-1', '')}>Additional fees (optional)</span>
                    <button type="button"
                      onClick={() => { feeKeyRef.current++; setFeeEntries(prev => [...prev, { key: feeKeyRef.current, templateId: '', amount: '', currency: 'EUR' }]) }}
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

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={LABEL.replace('mb-1', '')}>Discounts (optional)</span>
                    <button type="button"
                      onClick={() => { discountKeyRef.current++; setDiscountEntries(prev => [...prev, { key: discountKeyRef.current, name: '', amount: '', currency: moveCurrency || 'EUR' }]) }}
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

                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={isSecondHand} onChange={e => { setIsSecondHand(e.target.checked); if (!e.target.checked) setSourcePlatform('') }}
                      className="w-4 h-4 rounded accent-amber-500" />
                    <span className="text-sm text-stone-300">Second-hand purchase</span>
                  </label>
                  {isSecondHand && (
                    <select value={sourcePlatform} onChange={e => setSourcePlatform(e.target.value)}
                      className={INPUT}>
                      <option value="">Select platform (optional)</option>
                      {SALE_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  )}
                </div>

                {error && <p className="text-xs text-red-400">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button onClick={() => closeModal()}
                    className="flex-1 py-2 rounded-xl border border-stone-700 text-stone-400 text-sm hover:bg-stone-800 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleConfirm} disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold py-2 rounded-xl text-sm transition-colors">
                    <Plus size={14} />
                    {submitting ? 'Adding…' : status === 'wishlist' ? 'Move' : 'Add'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
