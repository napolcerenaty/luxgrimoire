'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { X, ExternalLink } from 'lucide-react'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'
import SaleDateSelector from '@/app/(public)/sale-announcements/[id]/SaleDateSelector'
import { AddToCollectionButton } from '@/app/(public)/sale-announcements/[id]/AddToCollectionButton'

interface Props {
  sale: ApiSaleAnnouncement | null
  onClose: () => void
}

export function SaleAnnouncementModal({ sale, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

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

  if (!sale) return null

  const editions = sale.editions ?? []
  const allEditionIds = editions.map(e => e.editionId)
  const firstEditionCover = editions[0]?.edition?.coverImage ?? null
  const coverImg = (sale.imageUrl ?? firstEditionCover)
    ? cloudinaryUrl((sale.imageUrl ?? firstEditionCover) as string, 'w_600,h_450,c_fill,q_auto,f_auto')
    : null

  return (
    /* Backdrop */
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
            <div className="shrink-0 w-20 sm:w-28 rounded-xl overflow-hidden border border-stone-700">
              {coverImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverImg} alt={sale.title} className="w-full object-cover" style={{ aspectRatio: '2/3' }} />
              ) : (
                <div className="w-full bg-stone-800 flex items-center justify-center text-stone-600 text-2xl font-serif" style={{ aspectRatio: '2/3' }}>
                  {sale.title.charAt(0)}
                </div>
              )}
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
              <Link
                href={`/sale-announcements/${sale.id}`}
                className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 transition-colors"
              >
                View full page <ExternalLink size={11} />
              </Link>
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

          {/* Add to collection */}
          {sale.availableForPurchase && allEditionIds.length > 0 && (
            <div className="mb-5">
              <AddToCollectionButton
                saleAnnouncementId={sale.id}
                editionIds={allEditionIds}
                basePrice={sale.basePrice ?? undefined}
                currency={sale.currency ?? 'USD'}
              />
            </div>
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
                  const raw = edition.coverImage ?? book?.coverImage
                  const imgSrc = raw ? cloudinaryUrl(raw, 'w_200,h_300,c_fill,q_auto,f_auto') : null

                  return (
                    <Link
                      key={editionId}
                      href={book?.slug ? `/books/${book.slug}` : `/editions/${(edition as any).slug ?? editionId}`}
                      onClick={onClose}
                      className="group rounded-lg overflow-hidden border border-stone-700 hover:border-amber-500/40 transition-colors"
                      style={{ background: 'var(--bg-raised)' }}
                    >
                      {imgSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imgSrc} alt={book?.title ?? 'Edition'} className="w-full object-cover group-hover:scale-105 transition-transform" style={{ aspectRatio: '2/3' }} />
                      ) : (
                        <div className="w-full bg-stone-800 flex items-center justify-center text-stone-600 text-xs" style={{ aspectRatio: '2/3' }}>No cover</div>
                      )}
                      <div className="px-2 py-1.5">
                        <p className="text-stone-200 text-xs font-medium leading-tight line-clamp-2">{book?.title ?? 'Unknown'}</p>
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
  )
}
