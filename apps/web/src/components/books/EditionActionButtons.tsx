'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { createPurchaseGroup } from '@/lib/api'
import { Bookmark, BookmarkCheck, BookPlus, CheckCircle, Loader2, LogIn, Megaphone, Plus, X } from 'lucide-react'
import { useModalState } from '@/hooks/useModalState'
import { useRecordSaleGroup } from '@/hooks/useRecordSaleGroup'
import { CollectionFormModal, type CollectionFormData } from '@/components/collection/CollectionFormModal'

const OWNERSHIP_OPTIONS = [
  { value: 'OWNED', label: 'Owned' },
  { value: 'PREORDER', label: 'Pre-order' },
  { value: 'SHIPPING', label: 'Shipping / In transit' },
  { value: 'BORROWED', label: 'Borrowed' },
  { value: 'LENDED', label: 'Lent out' },
]

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
  const { postFeesAndDiscounts } = useRecordSaleGroup()
  const isFutureSale = !!generalSaleDate && new Date(generalSaleDate) > new Date()
  const [status, setStatus] = useState<EntryStatus['status'] | 'loading'>('loading')
  const [entryId, setEntryId] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const { isOpen: modalOpen, open: _openModal, close: closeModal } = useModalState()
  const [step, setStep] = useState<'bundle' | 'form'>('form')
  const [addedOnce, setAddedOnce] = useState(false)
  const [selectedBundle, setSelectedBundle] = useState<{ id: string; title: string } | null>(null)
  const [bundleFetching, setBundleFetching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const handleConfirm = async (data: CollectionFormData) => {
    setSubmitting(true)
    setError(null)
    const feeDate = data.purchasedAt || new Date().toISOString().slice(0, 10)
    const parsedPrice = parseDecimalInput(data.totalAmount)
    const parsedShipping = parseDecimalInput(data.shippingAmount)
    try {
      let purchaseGroupId: string | null = null

      if (selectedBundle) {
        // ── Bundle / set path ──────────────────────────────────────────────
        const bundleEditionIds: string[] = (selectedBundle as any).editionIds ?? []
        const allIds = bundleEditionIds.includes(editionId)
          ? bundleEditionIds
          : [...bundleEditionIds, editionId]
        const result = await createPurchaseGroup({
          saleAnnouncementId: selectedBundle.id,
          editionIds: allIds,
          totalAmount: parsedPrice > 0 ? parsedPrice : 0,
          currency: data.currency,
          shippingAmount: parsedShipping > 0 ? parsedShipping : undefined,
          purchasedAt: feeDate,
          ownershipStatus: data.ownershipStatus,
          isSecondHand: data.isSecondHand,
          sourcePlatform: data.sourcePlatform || undefined,
        })
        purchaseGroupId = (result as any).group?.id ?? (result as any).id
        setStatus('collection')
      } else {
        // ── Single-edition path ────────────────────────────────────────────
        let targetEntryId: string

        if (status === 'wishlist' && entryId) {
          const body: Record<string, unknown> = { isWishlist: false, ownershipStatus: data.ownershipStatus }
          if (data.purchasedAt) body.acquiredAt = new Date(data.purchasedAt).toISOString()
          await authFetch<void>(`/collection/${entryId}`, { method: 'PATCH', body: JSON.stringify(body) })
          targetEntryId = entryId
          setStatus('collection')
        } else {
          const res = await authFetch<{ id: string }>('/collection', {
            method: 'POST',
            body: JSON.stringify({ bookEditionId: editionId, ownershipStatus: data.ownershipStatus }),
          })
          targetEntryId = res.id
          if (data.purchasedAt) {
            await authFetch<void>(`/collection/${targetEntryId}`, {
              method: 'PATCH',
              body: JSON.stringify({ acquiredAt: new Date(data.purchasedAt).toISOString() }),
            })
          }
          setEntryId(res.id)
          if (status !== 'collection') setStatus('collection')
        }

        const hasFees = data.feeEntries.some(f => parseDecimalInput(f.amount) > 0)
        const hasDiscounts = data.discountEntries.some(d => parseDecimalInput(d.amount) > 0)
        if (parsedPrice > 0 || parsedShipping > 0 || hasFees || hasDiscounts) {
          const pgRes = await authFetch<{ id: string }>(`/collection/bundles/for-entry/${targetEntryId}`, {
            method: 'POST',
            body: JSON.stringify({
              totalAmount: parsedPrice > 0 ? parsedPrice : 0,
              currency: data.currency,
              shippingAmount: parsedShipping > 0 ? parsedShipping : undefined,
              purchasedAt: feeDate,
              isSecondHand: data.isSecondHand,
              sourcePlatform: data.sourcePlatform || undefined,
            }),
          })
          purchaseGroupId = pgRes.id
        }

        if (data.orderNumber.trim()) {
          await authFetch<void>(`/collection/${targetEntryId}`, {
            method: 'PATCH',
            body: JSON.stringify({ orderNumber: data.orderNumber.trim() }),
          }).catch(() => {})
        }
      }

      if (purchaseGroupId) {
        await postFeesAndDiscounts(purchaseGroupId, data.feeEntries, data.discountEntries, data.feeTemplates, feeDate)
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

      {/* Modal */}
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
            ) : null}
          </div>
        </div>
      )}

      <CollectionFormModal
        open={modalOpen && step === 'form'}
        onClose={closeModal}
        title={status === 'wishlist' ? 'Move to Collection' : 'Add to Collection'}
        subtitle={selectedBundle ? `📦 Adding as set: ${selectedBundle.title}` : undefined}
        submitLabel={status === 'wishlist' ? 'Move' : 'Add'}
        defaultOwnershipStatus="PREORDER"
        defaultPrice={basePrice ?? ''}
        defaultCurrency={currency ?? 'EUR'}
        ownershipOptions={OWNERSHIP_OPTIONS}
        error={error}
        submitting={submitting}
        onSubmit={handleConfirm}
      />
    </>
  )
}
