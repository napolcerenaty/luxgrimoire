'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createPurchaseGroup } from '@/lib/api'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { BookPlus, LogIn } from 'lucide-react'
import { useRecordSaleGroup } from '@/hooks/useRecordSaleGroup'
import { useAuth } from '@/components/AuthProvider'
import { CollectionFormModal, type CollectionFormData, type SaleEditionForModal } from '@/components/collection/CollectionFormModal'

export interface SaleEditionData {
  id: string       // SaleAnnouncementEdition.id (for saleAnnouncementEditionId)
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
  saleAnnouncementId: string
  editions: SaleEditionData[]
  basePrice?: number
  currency: string
  selectedPrice?: number
  selectedPriceCurrency?: string
  compact?: boolean
  defaultOwnershipStatus?: string
  triggerLabel?: string
  defaultOpen?: boolean
  onClose?: () => void
}

export function AddToCollectionButton({ saleAnnouncementId, editions, basePrice, currency, selectedPrice, selectedPriceCurrency, compact, defaultOwnershipStatus = 'PREORDER', triggerLabel, defaultOpen, onClose }: Props) {
  const { user } = useAuth()
  const { postFeesAndDiscounts } = useRecordSaleGroup()
  const [open, setOpen] = useState(defaultOpen ?? false)
  const [success, setSuccess] = useState(false)
  const [addedCount, setAddedCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectivePrice = selectedPrice ?? basePrice
  const effectiveCurrency = selectedPriceCurrency ?? currency

  const closeModal = () => { setOpen(false); onClose?.() }

  const openTrigger = () => {
    setError(null)
    setSuccess(false)
    setOpen(true)
  }

  const handleSubmit = async (data: CollectionFormData) => {
    setSubmitting(true)
    setError(null)
    const feeDate = data.purchasedAt || new Date().toISOString().slice(0, 10)
    try {
      const parsedPrice = parseDecimalInput(data.totalAmount)
      const parsedShipping = parseDecimalInput(data.shippingAmount)

      const activeEditions = editions.length > 1
        ? editions.filter(ed => data.selectedEditionIds.includes(ed.editionId))
        : editions

      const editionIds = activeEditions.map(ed => ed.editionId)
      const editionSignatureTypes: Record<string, string> = {}
      const editionSaleAnnouncementEditionIds: Record<string, string> = {}
      for (const ed of activeEditions) {
        const chosen = data.selectedVariants[ed.editionId]
        if (chosen) editionSignatureTypes[ed.editionId] = chosen
        editionSaleAnnouncementEditionIds[ed.editionId] = ed.id
      }

      const result = await createPurchaseGroup({
        saleAnnouncementId,
        totalAmount: parsedPrice,
        currency: data.currency,
        shippingAmount: parsedShipping > 0 ? parsedShipping : undefined,
        purchasedAt: feeDate,
        ownershipStatus: data.ownershipStatus,
        orderNumber: data.orderNumber.trim() || undefined,
        editionIds,
        editionSignatureTypes: Object.keys(editionSignatureTypes).length > 0 ? editionSignatureTypes : undefined,
        editionSaleAnnouncementEditionIds,
        isSecondHand: data.isSecondHand,
        sourcePlatform: data.isSecondHand && data.sourcePlatform ? data.sourcePlatform : undefined,
      })

      const purchaseGroupId = (result as any).group?.id ?? (result as any).id

      if (purchaseGroupId) {
        await postFeesAndDiscounts(purchaseGroupId, data.feeEntries, data.discountEntries, data.feeTemplates, feeDate)
      }

      setAddedCount(editionIds.length)
      setSuccess(true)
      setTimeout(() => { closeModal(); setSuccess(false) }, 2000)
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
      {!defaultOpen && (
        <button
          onClick={openTrigger}
          className={compact
            ? "flex items-center gap-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-500/60 font-medium px-3 py-1.5 rounded-lg transition-colors"
            : "inline-flex items-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          }
        >
          <BookPlus size={compact ? 13 : 16} />
          {triggerLabel ?? (compact ? 'Add to Collection' : 'Add to My Collection')}
        </button>
      )}

      {success ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl p-6">
            <div className="text-center py-6">
              <div className="text-4xl mb-3">&#10003;</div>
              <p className="text-green-400 font-semibold">Added to your collection!</p>
              <p className="text-stone-500 text-sm mt-1">{addedCount} edition{addedCount !== 1 ? 's' : ''} added</p>
            </div>
          </div>
        </div>
      ) : (
        <CollectionFormModal
          open={open}
          onClose={closeModal}
          title="Add to Collection"
          note={editions.length === 1 ? 'Adds this edition to your collection.' : `Adds ${editions.length} editions to your collection.`}
          defaultOwnershipStatus={defaultOwnershipStatus}
          defaultPrice={effectivePrice != null ? String(effectivePrice) : ''}
          defaultCurrency={effectiveCurrency || 'EUR'}
          editions={editions as SaleEditionForModal[]}
          error={error}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}
    </>
  )
}