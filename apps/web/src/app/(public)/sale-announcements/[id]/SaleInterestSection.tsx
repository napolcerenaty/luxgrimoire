'use client'

import { SaleInterestButton } from '@/components/sales/SaleInterestButton'
import { AddToCollectionButton } from './AddToCollectionButton'
import { useSaleInterest } from '@/hooks/useSaleInterest'
import { isOpenForPurchase, isSalePast, resolveSalePrice, resolveSubscriberPrice } from '@/lib/saleDates'
import type { ApiSaleAnnouncement, ApiSaleTier } from '@luxgrimoire/shared-types'

interface Props {
  sale: ApiSaleAnnouncement
  compact?: boolean
  /** The tier already selected via SaleDateSelector on this page — when present, "Interested?"
   *  registers directly against it instead of opening its own region/tier picker. */
  directTier?: ApiSaleTier | null
}

export function SaleInterestSection({ sale, compact = false, directTier }: Props) {
  const { isInterested, regionId, selectedPrice, selectedPriceCurrency } = useSaleInterest(sale.id)

  const saleOpen = isOpenForPurchase(sale, regionId)
  const salePast = isSalePast(sale, regionId)

  const allEditions = sale.editions ?? []
  const { basePrice: resolvedPrice, currency: resolvedCurrency } = resolveSalePrice(sale, regionId)
  const subscriberPrice = resolveSubscriberPrice(sale, regionId)

  // selectedPrice from hook = explicitly saved price (null = never saved / old record)
  // Fall back to resolved subscriber price since UI defaults to showing subscriber when price exists
  const effectiveSelectedPrice = selectedPrice ?? (subscriberPrice ?? undefined)
  const effectiveSelectedCurrency = selectedPriceCurrency ?? (subscriberPrice != null ? resolvedCurrency : undefined)


  if (salePast) {
    return (
      <div className={compact ? '' : 'mt-4'}>
        <AddToCollectionButton
          saleAnnouncementId={sale.id}
          editions={allEditions}
          basePrice={resolvedPrice ?? undefined}
          currency={resolvedCurrency}
          selectedPrice={effectiveSelectedPrice}
          selectedPriceCurrency={effectiveSelectedCurrency}
          compact={compact}
          defaultOwnershipStatus="PREORDER"
        />
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'mt-4'}`}>
      <SaleInterestButton
        sale={sale}
        subscriberBasePrice={sale.subscriberBasePrice ?? null}
        currency={sale.currency ?? null}
        directTier={directTier}
      />
      {isInterested && saleOpen && (
        <AddToCollectionButton
          saleAnnouncementId={sale.id}
          editions={allEditions}
          basePrice={resolvedPrice ?? undefined}
          currency={resolvedCurrency}
          selectedPrice={effectiveSelectedPrice}
          selectedPriceCurrency={effectiveSelectedCurrency}
          compact
          defaultOwnershipStatus="PREORDER"
          triggerLabel="Confirm Purchase"
        />
      )}
    </div>
  )
}
