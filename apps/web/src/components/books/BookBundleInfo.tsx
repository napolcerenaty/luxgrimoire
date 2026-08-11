'use client'

import { useQuery } from '@tanstack/react-query'
import { getPurchaseGroups } from '@/lib/api'
import Link from 'next/link'

interface Props {
  editionIds: string[]
}

export function BookBundleInfo({ editionIds }: Props) {
  const editionSet = new Set(editionIds)

  const { data: groups = [] } = useQuery({
    queryKey: ['purchase-groups'],
    queryFn: getPurchaseGroups,
  })

  const matchingBundles = groups.filter(g =>
    (g.bookEntries ?? []).some(e => e.editionId && editionSet.has(e.editionId))
  )

  if (matchingBundles.length === 0) return null

  return (
    <section className="mt-12">
      <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">Part of a Bundle</h2>
      <div className="flex flex-col gap-3">
        {matchingBundles.map(bundle => {
          // The specific book this info is being shown for — its own allocated price when
          // set, otherwise the same equal-split estimate perBookCost already provided.
          const thisEntry = (bundle.bookEntries ?? []).find(e => e.editionId && editionSet.has(e.editionId))
          const thisBookCost = thisEntry?.entryCost ?? bundle.perBookCost
          const isExact = thisEntry?.entryCost != null && bundle.priceDistribution === 'CUSTOM'
          return (
          <div
            key={bundle.id}
            className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex items-center justify-between gap-4"
          >
            <div>
              <p className="text-stone-200 font-medium">
                {bundle.title ?? new Date(bundle.purchasedAt).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}
              </p>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-stone-400">
                <span>{bundle.bookCount ?? 0} book{(bundle.bookCount ?? 0) !== 1 ? 's' : ''}</span>
                <span>Total: {bundle.totalAmount} {bundle.currency}</span>
                {thisBookCost != null && (bundle.bookCount ?? 0) > 1 && (
                  <span>{isExact ? '' : '~'}{thisBookCost} {bundle.currency}{isExact ? ' this book' : '/book'}</span>
                )}
              </div>
            </div>
            {bundle.saleAnnouncementId && (
              <Link
                href={`/sale-announcements/${bundle.saleAnnouncementId}`}
                className="text-xs text-brand-400 hover:text-brand-300 hover:underline whitespace-nowrap"
              >
                View Sale →
              </Link>
            )}
          </div>
          )
        })}
      </div>
    </section>
  )
}
