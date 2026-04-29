'use client'

import { useState, useEffect } from 'react'
import { authFetch } from '@/lib/authFetch'
import { Modal } from '@/components/ui/Modal'
import { Bookmark, BookmarkCheck, BookPlus, CheckCircle } from 'lucide-react'

interface EntryStatus {
  status: 'none' | 'wishlist' | 'collection'
  entryId?: string
}

interface Props {
  editionId: string
  editionName: string | null
  basePrice?: string | null
  currency?: string | null
  bundles: Array<{ id: string; title: string }>
}

export function EditionActionButtons({ editionId, editionName, basePrice, currency, bundles }: Props) {
  const [status, setStatus] = useState<EntryStatus['status'] | 'loading'>('loading')
  const [entryId, setEntryId] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [step, setStep] = useState<'bundle' | 'form'>('form')

  // Form fields
  const [acquiredAt, setAcquiredAt] = useState(new Date().toISOString().slice(0, 10))
  const [allocatedPrice, setAllocatedPrice] = useState(basePrice ?? '')
  const [priceCurrency, setPriceCurrency] = useState(currency ?? 'USD')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
    if (!token) { setStatus('none'); return }

    authFetch<EntryStatus>(`/collection/status/${editionId}`)
      .then(res => { setStatus(res.status); setEntryId(res.entryId ?? null) })
      .catch(() => setStatus('none'))
  }, [editionId])

  const handleAddWishlist = async () => {
    setIsPending(true)
    try {
      const res = await authFetch<{ id: string }>('/collection/wishlist', {
        method: 'POST',
        body: JSON.stringify({ bookEditionId: editionId, _entityName: editionName }),
      })
      setStatus('wishlist')
      setEntryId(res.id)
    } catch { /* silent — user may not be signed in */ } finally {
      setIsPending(false)
    }
  }

  const handleRemoveWishlist = async () => {
    if (!entryId) return
    setIsPending(true)
    try {
      await authFetch<void>(`/collection/${entryId}`, { method: 'DELETE' })
      setStatus('none')
      setEntryId(null)
    } finally {
      setIsPending(false)
    }
  }

  const openCollectionModal = () => {
    setFormError(null)
    setStep(bundles.length > 0 ? 'bundle' : 'form')
    setModalOpen(true)
  }

  const handleAddToCollection = async () => {
    setSubmitting(true)
    setFormError(null)
    const wishlistEntryId = status === 'wishlist' ? entryId : null
    try {
      const addRes = await authFetch<{ id: string }>('/collection', {
        method: 'POST',
        body: JSON.stringify({
          bookEditionId: editionId,
          ownershipStatus: 'OWNED',
          _entityName: editionName,
        }),
      })

      // Patch with purchase details if provided
      const patchBody: Record<string, string> = {}
      if (acquiredAt) patchBody.acquiredAt = acquiredAt
      if (allocatedPrice) patchBody.allocatedPrice = allocatedPrice
      if (priceCurrency) patchBody.priceCurrency = priceCurrency
      if (Object.keys(patchBody).length > 0) {
        await authFetch<void>(`/collection/${addRes.id}`, {
          method: 'PATCH',
          body: JSON.stringify(patchBody),
        })
      }

      // Remove wishlist entry if it existed
      if (wishlistEntryId) {
        await authFetch<void>(`/collection/${wishlistEntryId}`, { method: 'DELETE' })
      }

      setStatus('collection')
      setEntryId(addRes.id)
      setModalOpen(false)
    } catch {
      setFormError('Failed to add to collection. Please make sure you are signed in.')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') return null

  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
  if (!token) return null

  if (status === 'collection') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-stone-400">
        <CheckCircle size={15} className="text-amber-400" />
        In your collection
      </span>
    )
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status === 'wishlist' ? (
          <button
            onClick={handleRemoveWishlist}
            disabled={isPending}
            className="inline-flex items-center gap-2 bg-stone-800 hover:bg-stone-700 text-amber-400 disabled:opacity-50 px-4 py-2 rounded-lg text-sm transition-colors border border-stone-700"
          >
            <BookmarkCheck size={16} />
            On Wishlist
          </button>
        ) : (
          <button
            onClick={handleAddWishlist}
            disabled={isPending}
            className="inline-flex items-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-200 disabled:opacity-50 px-4 py-2 rounded-lg text-sm transition-colors border border-stone-700 hover:border-stone-600"
          >
            <Bookmark size={16} />
            {isPending ? 'Adding…' : 'Add to Wishlist'}
          </button>
        )}

        <button
          onClick={openCollectionModal}
          className="inline-flex items-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <BookPlus size={16} />
          Add to Collection
        </button>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add to Collection">
        {step === 'bundle' && bundles.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-stone-400">This edition was part of a bundle:</p>
            {bundles.map(b => (
              <p key={b.id} className="text-sm font-medium text-stone-200">📦 {b.title}</p>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => setStep('form')}
                className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Add just this book
              </button>
              <button
                onClick={() => setStep('form')}
                className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                I&apos;ll track the bundle separately
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-stone-400 text-sm block mb-1">Date acquired</label>
              <input
                type="date"
                value={acquiredAt}
                onChange={e => setAcquiredAt(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm"
              />
            </div>
            <div>
              <label className="text-stone-400 text-sm block mb-1">Price paid <span className="text-stone-600">(optional)</span></label>
              <input
                type="number"
                value={allocatedPrice}
                onChange={e => setAllocatedPrice(e.target.value)}
                placeholder={basePrice ?? '0.00'}
                min="0"
                step="0.01"
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm"
              />
            </div>
            <div>
              <label className="text-stone-400 text-sm block mb-1">Currency</label>
              <input
                type="text"
                value={priceCurrency}
                onChange={e => setPriceCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="USD"
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm"
              />
            </div>
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <button
              onClick={handleAddToCollection}
              disabled={submitting}
              className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add to Collection'}
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}
