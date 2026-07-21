'use client'

import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
import { useBrandColors } from '@/lib/useBrandColors'
import { SaleInterestButton } from '@/components/sales/SaleInterestButton'

export interface ListSaleAnnouncement {
  id: string
  title: string
  imageUrl: string | null
  basePrice: number | null
  subscriberBasePrice: number | null
  currency: string | null
  isBundle: boolean
  availableForPurchase: boolean
  isSoldOut: boolean
  saleType: string | null
  endsAt: string | null
  notes: string | null
  generalSaleDate: string | null
  firstAccessDate: string | null
  earlyAccessDate: string | null
  company: { name: string; slug?: string | null; brandColors?: string[] } | null
  regions: Array<{ id: string; name: string; isDefault: boolean; firstAccessDate: string | null; earlyAccessDate: string | null; generalSaleDate: string | null; countryCodes: string; currency: string | null }>
}

export function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isSaleLive(a: ListSaleAnnouncement): boolean {
  const now = Date.now()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const saleStarted = a.generalSaleDate != null && new Date(a.generalSaleDate).getTime() <= now
  const isOsOrSale = a.saleType === 'OVERSTOCK' || a.saleType === 'SALE'
  const isOsOrSaleLive = isOsOrSale && saleStarted && (
    a.endsAt ? new Date(a.endsAt).getTime() > now
             : a.generalSaleDate != null && new Date(a.generalSaleDate).getTime() >= todayStart.getTime()
  )
  const isLpLive = !isOsOrSale && saleStarted && (
    a.endsAt ? new Date(a.endsAt).getTime() > now
             : a.generalSaleDate != null && new Date(a.generalSaleDate).getTime() >= todayStart.getTime()
  )
  return isOsOrSaleLive || (
    a.saleType === 'OPEN_PREORDER' ? saleStarted && (!a.endsAt || new Date(a.endsAt).getTime() > now)
                                   : isLpLive
  )
}

export function AnnouncementCard({ a }: { a: ListSaleAnnouncement }) {
  const cover = a.imageUrl ?? null
  const imgUrl = cover ? cloudinaryUrl(cover, 'w_400,h_600,c_fill,q_auto,f_auto') : null
  const saleDate = formatDate(a.generalSaleDate)
  const getBrandColors = useBrandColors()
  const brandColors = getBrandColors(a.company?.slug ?? null) ?? a.company?.brandColors
  const isLive = isSaleLive(a)

  return (
    <div title={a.title} className="relative group flex flex-col rounded-2xl bg-stone-900 border border-stone-800 hover:border-amber-700/60 transition-all hover:shadow-xl hover:shadow-amber-900/10">
      {/* Image — same 2/3 portrait ratio as EditionCard */}
      <div className="relative aspect-[2/3] bg-stone-950 overflow-hidden rounded-t-2xl">
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgUrl}
            alt={a.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="relative w-full h-full flex items-center justify-center text-stone-600">
            <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(brandColors)} />
            <p className="relative z-10 font-serif font-semibold text-center px-3 text-sm leading-snug line-clamp-4 text-stone-300">
              {a.title}
            </p>
          </div>
        )}

        {/* Company ribbon — same style as EditionCarousel */}
        {a.company?.name && (
          <div className="card-ribbon absolute bottom-0 left-0 right-0 px-2 py-2 text-center pointer-events-none">
            <span
              className="card-ribbon-text font-serif font-semibold uppercase leading-none line-clamp-1 text-white"
              style={{ fontSize: '10px', letterSpacing: '0.12em' }}
            >
              {a.company.name}
            </span>
          </div>
        )}

        {a.isBundle && (
          <span className="absolute top-2 left-2 text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-950/80 border border-stone-600 text-amber-400">
            Bundle
          </span>
        )}
        {a.isSoldOut ? (
          <span className="absolute top-2 right-2 text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-900/80 border border-red-700 text-red-400">
            Sold Out
          </span>
        ) : isLive && (
          <span className="absolute top-2 right-2 text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-900/80 border border-green-700 text-green-400">
            Live
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col flex-1">
        <div className="flex-1 flex flex-col gap-1">
          <p className="font-serif font-semibold text-stone-100 text-sm leading-snug line-clamp-2 group-hover:text-amber-400 transition-colors">
            {a.title}
          </p>
          {saleDate && <p className="text-xs text-amber-500">🗓 {saleDate}</p>}
          {a.basePrice != null && a.currency && (
            <p className="text-xs text-stone-400">from {a.basePrice} {a.currency}</p>
          )}
          {a.subscriberBasePrice != null && (
            <p className="text-[10px] text-emerald-400/80">🏷 Subscriber price available</p>
          )}
        </div>
        {/* z-10 ensures the button sits above the link overlay */}
        <div className="mt-2 relative z-10">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <SaleInterestButton sale={a as any} />
        </div>
      </div>

      {/* Invisible link overlay — placed last in DOM so it sits on top of all non-interactive content.
          The button wrapper above has z-10, so it intercepts its own clicks. */}
      <Link
        href={`/sale-announcements/${a.id}`}
        className="absolute inset-0 rounded-2xl"
        aria-label={a.title}
      />
    </div>
  )
}

export function AnnouncementListRow({ a }: { a: ListSaleAnnouncement }) {
  const cover = a.imageUrl ?? null
  const thumb = cover ? cloudinaryUrl(cover, 'w_80,h_80,c_fill,q_auto,f_auto') : null
  const saleDate = formatDate(a.generalSaleDate)
  const getBrandColors = useBrandColors()
  const brandColors = getBrandColors(a.company?.slug ?? null) ?? a.company?.brandColors
  const isLive = isSaleLive(a)

  return (
    <Link
      href={`/sale-announcements/${a.id}`}
      title={a.title}
      className="group flex items-center gap-4 py-3 hover:bg-stone-900/50 px-2 -mx-2 rounded-lg transition-colors"
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-stone-800 flex items-center justify-center relative">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={a.title} className="w-full h-full object-cover" />
        ) : (
          <>
            <div className="absolute inset-0 opacity-20" style={brandGradientStyle(brandColors)} />
            <p className="relative z-10 font-serif text-center text-[10px] leading-tight px-1 line-clamp-3 text-stone-300">
              {a.title}
            </p>
          </>
        )}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-stone-100 group-hover:text-amber-400 transition-colors truncate leading-tight text-sm">
          {a.title}
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {a.company?.name && <span className="text-xs text-amber-600/80">{a.company.name}</span>}
          {saleDate && <span className="text-xs text-stone-400">🗓 {saleDate}</span>}
          {a.basePrice != null && a.currency && (
            <span className="text-xs text-stone-500">from {a.basePrice} {a.currency}</span>
          )}
          {a.subscriberBasePrice != null && (
            <span className="text-[10px] text-emerald-400/80">🏷 sub price</span>
          )}
        </div>
      </div>
      {/* Badges */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {a.isSoldOut ? (
          <span className="text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-900/80 border border-red-700 text-red-400">Sold Out</span>
        ) : isLive && (
          <span className="text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-900/80 border border-green-700 text-green-400">Live</span>
        )}
        {a.isBundle && (
          <span className="text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-800 border border-stone-600 text-amber-400">Bundle</span>
        )}
      </div>
    </Link>
  )
}
