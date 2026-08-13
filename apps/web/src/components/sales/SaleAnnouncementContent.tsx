'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, CalendarDays } from 'lucide-react'
import type { ApiSaleAnnouncement, ApiSaleTier } from '@luxgrimoire/shared-types'
import SaleDateSelector from '@/app/(public)/sale-announcements/[id]/SaleDateSelector'
import { SaleInterestSection } from '@/app/(public)/sale-announcements/[id]/SaleInterestSection'
import { SaleEditionsGrid } from '@/components/sales/SaleEditionsGrid'
import { useTheme } from '@/components/ThemeProvider'
import { strHue } from '@/lib/calendarPills'
import CalendarGrid, { type CalendarSaleItem } from '@/components/calendar/CalendarGrid'

/** This sale's tiers, grouped by region, numbered by their `order` — "2 of 3" stage badges so
 *  multiple tiers spread across different calendar days still read as one sale. */
function computeStageInfo(tiers: ApiSaleTier[]): Map<string, { index: number; total: number }> {
  const groups = new Map<string, ApiSaleTier[]>()
  for (const t of tiers) {
    const key = t.regionId ?? ''
    const arr = groups.get(key)
    if (arr) arr.push(t)
    else groups.set(key, [t])
  }
  const result = new Map<string, { index: number; total: number }>()
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.order - b.order)
    sorted.forEach((t, i) => result.set(t.id, { index: i + 1, total: sorted.length }))
  }
  return result
}

/** First month worth showing: the soonest upcoming tier's month, or the most recent past
 *  tier's month if every tier has already passed. */
function getNearestTierMonth(tiers: ApiSaleTier[]): Date {
  const now = new Date()
  if (tiers.length === 0) return new Date(now.getFullYear(), now.getMonth(), 1)
  const sorted = [...tiers].sort((a, b) => a.date.localeCompare(b.date))
  const upcoming = sorted.find(t => new Date(t.date) >= now)
  const d = new Date((upcoming ?? sorted[sorted.length - 1]).date)
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

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
  const { theme } = useTheme()
  const editions = sale.editions ?? []
  const tiers = sale.tiers ?? []
  // The tier currently selected in SaleDateSelector below — passed to SaleInterestSection so
  // "Interested?" registers directly against it instead of opening its own region/tier picker
  // (that picker only makes sense when there's no on-page selector already, e.g. the bell icon
  // on a card in a list).
  const [selectedTier, setSelectedTier] = useState<ApiSaleTier | null>(null)

  // Inline "Show calendar" panel — full page only (compact/modal use has no room for it).
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarViewDate, setCalendarViewDate] = useState(() => getNearestTierMonth(tiers))
  const regionNameById = new Map((sale.regions ?? []).map(r => [r.id, r.name]))
  const stageInfo = computeStageInfo(tiers)

  const calendarSalesForDay = (day: number): CalendarSaleItem[] => {
    const year = calendarViewDate.getFullYear()
    const month0 = calendarViewDate.getMonth()
    return tiers
      .filter(t => {
        const d = new Date(t.date)
        return d.getFullYear() === year && d.getMonth() === month0 && d.getDate() === day
      })
      .map(t => {
        const d = new Date(t.date)
        const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        const regionName = t.regionId ? regionNameById.get(t.regionId) ?? null : null
        const info = stageInfo.get(t.id)
        return {
          id: t.id,
          label: t.name,
          companyName: sale.company?.name ?? null,
          brandColors: sale.company?.brandColors ?? null,
          hue: strHue(sale.company?.slug ?? sale.id),
          tierName: regionName ?? 'All regions',
          time,
          href: `/sale-announcements/${sale.id}`,
          stageBadge: info && info.total > 1 ? `${info.index}/${info.total}` : null,
        }
      })
  }

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
          saleId={sale.id}
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

        {!compact && tiers.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowCalendar(v => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-amber-400 transition-colors"
            >
              <CalendarDays size={13} />
              {showCalendar ? 'Hide calendar' : 'Show calendar'}
            </button>
            {showCalendar && (
              <div className="mt-3">
                <CalendarGrid
                  year={calendarViewDate.getFullYear()}
                  month0={calendarViewDate.getMonth()}
                  monthLabel={calendarViewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                  lightMode={theme === 'light'}
                  onPrevMonth={() => setCalendarViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                  onNextMonth={() => setCalendarViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                  renewalsForDay={() => []}
                  salesForDay={calendarSalesForDay}
                />
              </div>
            )}
          </div>
        )}
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
