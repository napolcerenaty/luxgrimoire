'use client'

import { useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { SaleInterestButton } from '@/components/sales/SaleInterestButton'
import { ConfirmPurchaseModal } from '@/components/sales/ConfirmPurchaseModal'
import { useSaleInterest } from '@/hooks/useSaleInterest'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'

interface Props {
  sale: ApiSaleAnnouncement
}

export function SaleInterestSection({ sale }: Props) {
  const { isInterested, tier } = useSaleInterest(sale.id)
  const [showPurchase, setShowPurchase] = useState(false)

  return (
    <>
      <div className="flex items-center gap-2 mt-4">
        <SaleInterestButton sale={sale} />
        {isInterested && (
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
