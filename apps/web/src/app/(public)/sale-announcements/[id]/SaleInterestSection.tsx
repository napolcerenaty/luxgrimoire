'use client'

import { useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { SaleInterestButton } from '@/components/sales/SaleInterestButton'
import { ConfirmPurchaseModal } from '@/components/sales/ConfirmPurchaseModal'
import { AddToCollectionButton } from './AddToCollectionButton'
import { useSaleInterest } from '@/hooks/useSaleInterest'
import { isOpenForPurchase, isSalePast } from '@/lib/saleDates'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'

interface Props {
  sale: ApiSaleAnnouncement
}

export function SaleInterestSection({ sale }: Props) {
  const { isInterested, tier, regionId } = useSaleInterest(sale.id)
  const [showPurchase, setShowPurchase] = useState(false)

  const saleOpen = isOpenForPurchase(sale, regionId)
  const salePast = isSalePast(sale, regionId)

  const allEditionIds = (sale.editions ?? []).map(e => e.editionId)

  if (salePast) {
    return (
      <div className="mt-4">
        <AddToCollectionButton
          saleAnnouncementId={sale.id}
          editionIds={allEditionIds}
          basePrice={sale.basePrice ?? undefined}
          currency={sale.currency ?? 'USD'}
        />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 mt-4">
        <SaleInterestButton sale={sale} />
        {isInterested && saleOpen && (
          <button
            type="button"
            onClick={() => setShowPurchase(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-600 text-xs font-medium transition-colors"
          >
            <ShoppingBag size={13} />
            Confirm Purchase
          </button>
        )}
      </div>
      {showPurchase && (
        <ConfirmPurchaseModal
          sale={sale}
          preselectedTier={tier ?? 'GS'}
          onClose={() => setShowPurchase(false)}
        />
      )}
    </>
  )
}
