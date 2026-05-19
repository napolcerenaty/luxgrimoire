'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, memo } from 'react'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
import { useBrandColors } from '@/lib/useBrandColors'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'
import { SaleAnnouncementModal } from '@/components/sales/SaleAnnouncementModal'
import { SaleInterestButton } from '@/components/sales/SaleInterestButton'
import { resolveSaleDates } from '@/lib/saleDates'
import { apiFetch } from '@/lib/api'

const CARD_WIDTH = 160

interface Props {
  announcements: ApiSaleAnnouncement[]
  viewAllHref?: string
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const now = new Date()
  const target = new Date(dateStr)
  const diff = Math.ceil((target.getTime() - now.getTime()) / 86400000)
  return diff
}

function DaysBadge({ dateStr }: { dateStr: string | null | undefined }) {
  const days = daysUntil(dateStr)
  if (days === null) return null
  const label = days <= 0 ? 'Today!' : days === 1 ? '1 day' : `${days} days`
  const color = days <= 0
    ? 'bg-green-600/90 text-white'
    : days <= 3
    ? 'bg-amber-500/90 text-stone-900'
    : 'bg-stone-800/90 text-stone-300 border border-stone-600'
  return (
    <span className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight ${color}`}>
      {label}
    </span>
  )
}

const AnnouncementCardItem = memo(function AnnouncementCardItem({
  sale,
  onClick,
}: {
  sale: ApiSaleAnnouncement
  onClick: (sale: ApiSaleAnnouncement) => void
}) {
  const firstEdition = sale.editions?.[0]?.edition
  const raw = sale.imageUrl ?? firstEdition?.additionalImages?.[0] ?? null
  const imgUrl = raw ? cloudinaryUrl(raw, 'w_320,h_480,c_fill,q_auto,f_auto') : null

  const getBrandColors = useBrandColors()
  const companyName = (sale as any).company?.name ?? null
  const brandColors: string[] | null = getBrandColors((sale as any).company?.slug ?? null) ?? (sale as any).company?.brandColors ?? null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(sale)}
      onKeyDown={(e) => e.key === 'Enter' && onClick(sale)}
      className="flex-shrink-0 w-40 group rounded-lg overflow-hidden border border-stone-700 hover:border-amber-600/60 transition-all duration-250 text-left cursor-pointer"
      style={{ background: 'var(--bg-raised)' }}
    >
      {/* Cover */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '2/3', background: 'var(--bg-surface)' }}>
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgUrl}
            alt={sale.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(brandColors)} />
            <span className="relative z-10 text-xs font-serif text-stone-300/80 text-center leading-snug line-clamp-4 px-3">{sale.title}</span>
          </div>
        )}

        {/* Days badge */}
        <DaysBadge dateStr={sale.generalSaleDate} />

        {/* Company ribbon — same style as EditionCarousel */}
        {companyName && (
          <div
            className="absolute bottom-0 left-0 right-0 px-2 py-2 text-center"
            style={{ background: 'rgba(5,10,18,0.88)', borderTop: '1px solid rgba(200,180,140,0.2)' }}
          >
            <span
              className="font-serif font-semibold uppercase tracking-widest leading-none line-clamp-1 text-white"
              style={{ fontSize: '10px', letterSpacing: '0.12em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
            >
              {companyName}
            </span>
          </div>
        )}

        {/* Hover overlay */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-250 flex items-end"
          style={{ background: 'linear-gradient(to top, rgba(4,10,20,0.7) 0%, transparent 50%)' }}
        />
      </div>

      {/* Info */}
      <div className="px-2.5 pt-2 pb-2 flex flex-col">
        <div className="h-[2.25rem] overflow-hidden my-0.5">
          <p className="text-xs font-serif font-semibold text-stone-200 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">
            {sale.title}
          </p>
        </div>
        <div className="flex justify-end items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
          <SaleInterestButton
            sale={sale}
            subscriberBasePrice={sale.subscriberBasePrice}
            currency={sale.currency}
            compact
          />
        </div>
      </div>
    </div>
  )
})

export function HomeAnnouncementsSection({ announcements, viewAllHref }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<ApiSaleAnnouncement | null>(null)
  const [loading, setLoading] = useState(false)

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({
      left: dir === 'left' ? -(CARD_WIDTH * 3 + 32) : CARD_WIDTH * 3 + 32,
      behavior: 'smooth',
    })
  }

  const handleOpen = useCallback(async (sale: ApiSaleAnnouncement) => {
    setLoading(true)
    try {
      const full = await apiFetch<ApiSaleAnnouncement>(`/announcements/${sale.id}`)
      setSelected(full)
    } catch {
      // fallback to slim data if fetch fails
      setSelected(sale)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleClose = useCallback(() => setSelected(null), [])

  if (announcements.length === 0) return null

  return (
    <>
      <section className="container mx-auto px-4 py-10 max-w-5xl">
        {/* Centered header */}
        <div className="flex flex-col items-center mb-6 gap-3">
          <div className="flex items-center gap-4 w-full">
            <span className="flex-1 h-px bg-stone-700" />
            <h2 className="text-2xl font-serif font-semibold text-stone-100 tracking-widest text-center sm:whitespace-nowrap">
              Recent Announcements
            </h2>
            <span className="flex-1 h-px bg-stone-700" />
          </div>
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="text-xs text-amber-500 hover:text-amber-400 transition-colors font-serif tracking-wide border border-stone-700 hover:border-amber-700 px-3 py-1 rounded-full"
            >
              View all →
            </Link>
          )}
        </div>

        {/* Scroll area */}
        <div className="relative group/carousel overflow-hidden">
          <button
            onClick={() => scroll('left')}
            aria-label="Scroll left"
            className="absolute left-0 top-0 bottom-0 z-10 w-10 flex items-center justify-center
                       bg-gradient-to-r from-[var(--bg)] to-transparent
                       opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-200
                       text-stone-400 hover:text-amber-400"
          >
            <ChevronLeft size={24} />
          </button>

          <button
            onClick={() => scroll('right')}
            aria-label="Scroll right"
            className="absolute right-0 top-0 bottom-0 z-10 w-10 flex items-center justify-center
                       bg-gradient-to-l from-[var(--bg)] to-transparent
                       opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-200
                       text-stone-400 hover:text-amber-400"
          >
            <ChevronRight size={24} />
          </button>

          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scroll-smooth w-full"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {announcements.map((sale) => (
              <AnnouncementCardItem key={sale.id} sale={sale} onClick={handleOpen} />
            ))}
          </div>
        </div>
      </section>

      <SaleAnnouncementModal sale={selected} onClose={handleClose} />

      {/* Loading overlay while fetching full announcement */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-10 h-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        </div>
      )}
    </>
  )
}
