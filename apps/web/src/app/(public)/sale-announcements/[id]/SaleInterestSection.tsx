'use client'

import { SaleInterestButton } from '@/components/sales/SaleInterestButton'
import { AddToCollectionButton } from './AddToCollectionButton'
import { useSaleInterest } from '@/hooks/useSaleInterest'
import { isOpenForPurchase, isSalePast } from '@/lib/saleDates'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'

interface Props {
  sale: ApiSaleAnnouncement
}

export function SaleInterestSection({ sale }: Props) {
  const { isInterested, regionId } = useSaleInterest(sale.id)

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
    <div className="flex items-center gap-2 mt-4">
      <SaleInterestButton sale={sale} />
      {isInterested && saleOpen && (
        <AddToCollectionButton
          saleAnnouncementId={sale.id}
          editionIds={allEditionIds}
          basePrice={sale.basePrice ?? undefined}
          currency={sale.currency ?? 'USD'}
          compact
          defaultOwnershipStatus="PREORDER"
          triggerLabel="Confirm Purchase"
        />
      )}
    </div>
  )
}
