'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
import { useBrandColors } from '@/lib/useBrandColors'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'
import SaleDateSelector from '@/app/(public)/sale-announcements/[id]/SaleDateSelector'
import { AddToCollectionButton } from '@/app/(public)/sale-announcements/[id]/AddToCollectionButton'
import { SaleInterestButton } from '@/components/sales/SaleInterestButton'
import { useSaleInterest } from '@/hooks/useSaleInterest'
import { isOpenForPurchase, isSalePast, resolveSalePrice, resolveSubscriberPrice } from '@/lib/saleDates'

interface Props {
  sale: ApiSaleAnnouncement | null
  onClose: () => void
}

export function SaleAnnouncementModal({ sale, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { isInterested, regionId, selectedPrice, selectedPriceCurrency } = useSaleInterest(sale?.id ?? null)
  const getBrandColors = useBrandColors()
  const saleOpen = sale ? isOpenForPurchase(sale, regionId) : false
  const salePast = sale ? isSalePast(sale, regionId) : false
  const [imgIndex, setImgIndex] = useState(0)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (!sale) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [sale])

  const editions = sale?.editions ?? []
  const { basePrice: resolvedPrice, currency: resolvedCurrency } = resolveSalePrice(sale ?? ({} as any), regionId)
  const subscriberPrice = resolveSubscriberPrice(sale ?? ({} as any), regionId)
  const effectiveSelectedPrice = selectedPrice ?? (subscriberPrice ?? undefined)
  const effectiveSelectedCurrency = selectedPriceCurrency ?? (subscriberPrice != null ? resolvedCurrency : undefined)
  const firstEditionCover = editions[0]?.edition?.additionalImages?.[0] ?? null

  const extraImages: string[] = Array.isArray(sale?.extraImagesJson) ? (sale!.extraImagesJson as string[]) : []
  const allImages = [
    ...(sale?.imageUrl ? [sale.imageUrl] : []),
    ...extraImages,
  ]
  const currentImgRaw = allImages[imgIndex] ?? firstEditionCover
  const coverImg = currentImgRaw ? cloudinaryUrl(currentImgRaw, 'w_300,q_auto,f_auto') : null
  const totalImages = allImages.length
  const prevImg = useCallback(() => setImgIndex(i => (i - 1 + totalImages) % totalImages), [totalImages])
  const nextImg = useCallback(() => setImgIndex(i => (i + 1) % totalImages), [totalImages])

  if (!sale) return null

  return (
    <>
    {/* Backdrop */}
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/*
        Mobile  : bottom sheet — rounded top corners, max-h-[90dvh], scrollable
        Desktop : centered dialog — rounded-2xl, max-w-2xl, max-h-[88vh]
      */}
      <div
        ref={panelRef}
        className="
          relative w-full bg-stone-900 shadow-2xl
          max-h-[90dvh] overflow-y-auto overscroll-contain
          rounded-t-2xl border-t border-stone-700
          sm:rounded-2xl sm:border sm:border-stone-700 sm:max-w-2xl sm:mx-4
        "
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-100 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-stone-600" />
        </div>

        <div className="p-5 sm:p-6">
          {/* Header: image + title */}
          <div className="flex gap-4 mb-5">
            {/* Cover */}
            <div className="shrink-0 w-20 sm:w-28">
              <div className="relative rounded-xl overflow-hidden border border-stone-700">
                {coverImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverImg} alt={sale.title} className="w-full h-auto block" />
                ) : (
                  <div
                    className="w-full aspect-[2/3] relative flex items-center justify-center p-3 overflow-hidden"
                    style={brandGradientStyle(getBrandColors(sale.company?.slug ?? null) ?? sale.company?.brandColors)}
                  >
                    <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(getBrandColors(sale.company?.slug ?? null) ?? sale.company?.brandColors)} />
                    <span className="relative z-10 text-xs font-serif text-stone-200 text-center leading-snug line-clamp-4">{sale.title}</span>
                  </div>
                )}
                {totalImages > 1 && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); prevImg() }} aria-label="Previous image"
                      className="absolute left-0.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-stone-950/70 text-stone-300 hover:text-amber-400 transition-colors">
                      <ChevronLeft size={14} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); nextImg() }} aria-label="Next image"
                      className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-stone-950/70 text-stone-300 hover:text-amber-400 transition-colors">
                      <ChevronRight size={14} />
                    </button>
                    <div className="absolute bottom-1 right-1 px-1 py-px rounded-full bg-stone-950/70 text-stone-400 text-[9px] leading-tight">
                      {imgIndex + 1}/{totalImages}
                    </div>
                  </>
                )}
              </div>
              {sale.photoCredit && (() => {
                const handle = sale.photoCredit.replace(/^@/, '')
                return (
                  <p className="text-[10px] text-stone-500 mt-1 text-center leading-tight">
                    📷 photo by{' '}
                    <a
                      href={`https://instagram.com/${handle}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-amber-400 transition-colors"
                    >
                      @{handle}
                    </a>
                  </p>
                )
              })()}
            </div>

            {/* Title + badges + link */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {sale.isBundle && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-700 text-amber-400">
                    Bundle
                  </span>
                )}
                {sale.availableForPurchase && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-900/40 border border-green-700 text-green-400">
                    Available Now
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-serif font-bold text-stone-100 leading-tight mb-3 pr-6">
                {sale.title}
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/sale-announcements/${sale.id}`}
                  className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 transition-colors"
                >
                  View full page <ExternalLink size={11} />
                </Link>
                {sale.sourceUrl && (
                  <a
                    href={sale.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-200 transition-colors"
                  >
                    Original announcement <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                {salePast ? (
                  <AddToCollectionButton
                    saleAnnouncementId={sale.id}
                    editions={editions}
                    basePrice={resolvedPrice ?? undefined}
                    currency={resolvedCurrency}
                    selectedPrice={effectiveSelectedPrice}
                    selectedPriceCurrency={effectiveSelectedCurrency}
                    compact
                  />
                ) : (
                  <>
                    <SaleInterestButton sale={sale} subscriberBasePrice={sale.subscriberBasePrice} currency={sale.currency} />
                    {isInterested && saleOpen && (
                      <AddToCollectionButton
                        saleAnnouncementId={sale.id}
                        editions={editions}
                        basePrice={resolvedPrice ?? undefined}
                        currency={resolvedCurrency}
                        selectedPrice={effectiveSelectedPrice}
                        selectedPriceCurrency={effectiveSelectedCurrency}
                        compact
                        defaultOwnershipStatus="PREORDER"
                        triggerLabel="Confirm Purchase"
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Date / countdown selector */}
          <div className="mb-5">
            <SaleDateSelector
              regions={sale.regions ?? []}
              fallback={{
                generalSaleDate: sale.generalSaleDate,
                firstAccessDate: sale.firstAccessDate,
                earlyAccessDate: sale.earlyAccessDate,
                saleTimezone: sale.saleTimezone,
                basePrice: sale.basePrice,
                currency: sale.currency,
              }}
              userCountry={null}
            />
          </div>

          {/* Expected shipping */}
          {sale.expectedShipping && (
            <p className="text-sm text-stone-400 mb-4">
              <span className="text-stone-500">Expected shipping: </span>
              <span className="text-stone-300 font-medium">{sale.expectedShipping}</span>
            </p>
          )}

          {/* Editions grid */}
          {editions.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-stone-400 uppercase tracking-wider mb-3">
                Included Editions <span className="text-stone-600 normal-case font-normal">({editions.length})</span>
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {editions.map(({ edition, editionId }) => {
                  if (!edition) return null
                  const book = edition.book
                  const authors = (book?.authors ?? []) as any[]
                  const raw = edition.additionalImages?.[0]
                  const imgSrc = raw ? cloudinaryUrl(raw, 'w_200,h_300,c_fill,q_auto,f_auto') : null
                  const editionTitle = book?.title ?? 'Unknown'
                  const editionColors = getBrandColors((edition as any).bookBoxCompany?.slug) ?? (edition as any).bookBoxCompany?.brandColors ?? sale.company?.brandColors

                  return (
                    <Link
                      key={editionId}
                      href={`/editions/${(edition as any).slug ?? editionId}`}
                      onClick={onClose}
                      className="group rounded-lg overflow-hidden border border-stone-700 hover:border-amber-500/40 transition-colors"
                      style={{ background: 'var(--bg-raised)' }}
                    >
                      {imgSrc ? (
                        <div className="relative w-full" style={{ aspectRatio: '2/3' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imgSrc} alt={editionTitle} className="object-cover group-hover:scale-105 transition-transform w-full h-full" />
                        </div>
                      ) : (
                        <div
                          className="w-full relative flex items-center justify-center overflow-hidden"
                          style={{ aspectRatio: '2/3', ...brandGradientStyle(editionColors) }}
                        >
                          <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(editionColors)} />
                          <p className="relative z-10 font-serif text-center text-[10px] leading-tight px-1.5 line-clamp-4 text-stone-200">{editionTitle}</p>
                        </div>
                      )}
                      <div className="px-2 py-1.5">
                        <p className="text-stone-200 text-xs font-medium leading-tight line-clamp-2">{editionTitle}</p>
                        {authors.length > 0 && (
                          <p className="text-stone-500 text-[10px] mt-0.5 line-clamp-1">
                            {authors.map((a: any) => (a.author ?? a).name).join(', ')}
                          </p>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  </>
  )
}
