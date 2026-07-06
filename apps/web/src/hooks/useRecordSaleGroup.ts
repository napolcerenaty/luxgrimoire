import { useCallback } from 'react'
import { authFetch } from '@/lib/authFetch'
import { parseDecimalInput } from '@/lib/parseDecimalInput'

export interface FeeEntry { key: number; templateId: string; amount: string; currency: string }
export interface DiscountEntry { key: number; name: string; amount: string; currency: string }
export interface FeeTemplate {
  id: string
  name: string
  category: string | null
  defaultAmount: number | null
  defaultCurrency: string | null
  isActive: boolean
}

export function useRecordSaleGroup() {
  const postFeesAndDiscounts = useCallback(async (
    purchaseGroupId: string | null,
    feeEntries: FeeEntry[],
    discountEntries: DiscountEntry[],
    feeTemplates: FeeTemplate[],
    feeDate: string,
  ) => {
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
          ...(purchaseGroupId ? { purchaseGroupId } : {}),
        }),
      })
    }

    for (const disc of discountEntries) {
      const amount = parseDecimalInput(disc.amount)
      if (amount <= 0) continue
      await authFetch('/fees/discounts', {
        method: 'POST',
        body: JSON.stringify({
          name: disc.name.trim() || undefined,
          amount,
          currency: disc.currency,
          date: feeDate,
          ...(purchaseGroupId ? { purchaseGroupId } : {}),
        }),
      })
    }
  }, [])

  return { postFeesAndDiscounts }
}
