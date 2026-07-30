'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { ApiSaleAnnouncement, ApiSaleTier } from '@luxgrimoire/shared-types'
import SaleDateSelector from '@/app/(public)/sale-announcements/[id]/SaleDateSelector'
import { SaleInterestSection } from '@/app/(public)/sale-announcements/[id]/SaleInterestSection'
import { SaleEditionsGrid } from '@/components/sales/SaleEditionsGrid'

const TYPE_LABELS: Record<string, string> = {
  LIMITED_PREORDER: '⏳ Limited Preorder',
  OPEN_PREORDER: '🔓 Open Preorder',
  OVERSTOCK: '📦 Overstock',
  SALE: '🏷️ Sale',
}
const TYPE_COLORS: Record<string, string> = {
  LIMITED_PREORDER: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  OPEN_PREORDER: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  OVERSTOCK: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  SALE: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
}

interface Props {
  sale: ApiSaleAnnouncement
  /** Compact mode — used inside the modal (smaller text, tighter spacing) */
  compact?: boolean
  /** Show "View full page" link — for modal use */
  showPageLink?: boolean
  /** Callback when an internal link is clicked — for closing modal */
  onLinkClick?: () => void
}

export function SaleAnnouncementContent({ sale, compact = false, showPageLink = false, onLinkClick }: Props) {
  const editions = sale.editions ?? []
  // The tier currently selected in SaleDateSelector below — passed to SaleInterestSection so
  // "Interested?" registers directly against it instead of opening its own region/tier picker
  // (that picker only makes sense when there's no on-page selector already, e.g. the bell icon
  // on a card in a list).
  const [selectedTier, setSelectedTier] = useState<ApiSaleTier | null>(null)

  const heading = compact
    ? <h2 className="text-lg sm:text-xl font-serif font-bold text-stone-100 leading-tight mb-2 pr-6">{sale.title}</h2>
    : <h1 className="text-4xl font-serif font-bold text-stone-100 mb-4 leading-tight">{sale.title}</h1>

  return (
    <div>
      {/* Badges */}
      <div className={`flex flex-wrap gap-1.5 ${compact ? 'mb-2' : 'mb-3'}`}>
        {sale.isBundle && (
          <span className={`font-semibold px-2 py-0.5 rounded-full border bg-amber-900/40 border-amber-700 text-amber-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            Bundle
          </span>
        )}
        {sale.saleType && (
          <span className={`font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLORS[sale.saleType] ?? 'bg-stone-700 border-stone-600 text-stone-300'} ${compact ? 'text-[10px]' : 'text-xs'}`}>
            {TYPE_LABELS[sale.saleType] ?? sale.saleType}
          </span>
        )}
        {sale.isSoldOut && (
          <span className={`font-semibold px-2 py-0.5 rounded-full border bg-red-500/15 border-red-500/30 text-red-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            Sold Out
          </span>
        )}
        {sale.availableForPurchase && !sale.isSoldOut && (
          <span className={`font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-green-900/40 border-green-700 text-green-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            Available Now
          </span>
        )}
      </div>

      {heading}

      {/* View full page / source links */}
      {(showPageLink || sale.sourceUrl) && (
        <div className={`flex flex-wrap items-center gap-3 ${compact ? 'mb-3' : 'mb-4'}`}>
          {showPageLink && (
            <Link
              href={`/sale-announcements/${sale.id}`}
              onClick={onLinkClick}
              className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 transition-colors"
            >
              View full page <ExternalLink size={11} />
            </Link>
          )}
          {sale.sourceUrl && (
            <a
              href={sale.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 transition-colors"
            >
              Original announcement <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {/* Expected shipping */}
      {sale.expectedShipping && (
        <p className={`text-stone-400 ${compact ? 'text-xs mb-2' : 'text-sm mb-4'}`}>
          <span className="text-stone-500">Expected shipping: </span>
          <span className="text-stone-300 font-medium">{sale.expectedShipping}</span>
        </p>
      )}

      {/* Ends at */}
      {sale.endsAt && (
        <p className={`text-stone-400 ${compact ? 'text-xs mb-2' : 'text-sm mb-4'}`}>
          <span className="text-stone-500">Sale ends: </span>
          <span className="text-stone-300 font-medium">
            {new Date(sale.endsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </p>
      )}

      {/* Notes */}
      {sale.notes && (
        <div
          className={`text-stone-300 prose prose-invert prose-sm max-w-none
            [&_a]:text-amber-400 [&_a:hover]:text-amber-300 [&_a]:underline [&_a]:underline-offset-2
            [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4
            ${compact ? 'text-xs mb-3' : 'text-sm mb-6'}`}
          dangerouslySetInnerHTML={{ __html: sale.notes }}
        />
      )}

      {/* Subscriber price callout */}
      {sale.subscriberBasePrice != null && sale.currency && (
        <div className={`flex items-center gap-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 ${compact ? 'px-2 py-1.5 mb-3' : 'px-3 py-2 mb-4'}`}>
          <span className={`text-emerald-400 ${compact ? 'text-xs' : 'text-sm'}`}>🏷</span>
          <span className={`text-emerald-300 ${compact ? 'text-xs' : 'text-sm'}`}>
            Subscriber price: <strong>
              {sale.currency === 'GBP' ? '£' : sale.currency === 'USD' ? '$' : sale.currency === 'EUR' ? '€' : sale.currency}
              {sale.subscriberBasePrice}
            </strong>
            <span className="text-emerald-500 text-xs ml-1">
              (vs {sale.currency === 'GBP' ? '£' : sale.currency === 'USD' ? '$' : sale.currency === 'EUR' ? '€' : sale.currency}{sale.basePrice} general)
            </span>
          </span>
        </div>
      )}

      {/* Date / region selector */}
      <div className={compact ? 'mb-3' : 'mb-6'}>
        <SaleDateSelector
          regions={sale.regions ?? []}
          tiers={sale.tiers ?? []}
          fallback={{
            saleTimezone: sale.saleTimezone,
            basePrice: sale.basePrice,
            currency: sale.currency,
          }}
          userCountry={null}
          onSelectionChange={setSelectedTier}
        />
      </div>

      {/* Interest / add to collection */}
      <SaleInterestSection sale={sale} compact={compact} directTier={selectedTier} />

      {/* Editions */}
      {editions.length > 0 && (
        <section className={compact ? 'mt-5' : 'mt-8'}>
          <h3 className={`font-semibold text-stone-400 uppercase tracking-wider mb-3 ${compact ? 'text-xs' : 'text-sm'}`}>
            Included Editions <span className="text-stone-600 normal-case font-normal">({editions.length})</span>
          </h3>
          <SaleEditionsGrid
            editions={editions}
            items={sale.items}
            saleBrandColors={sale.company?.brandColors}
            compact={compact}
            onLinkClick={onLinkClick}
          />
        </section>
      )}
    </div>
  )
}
