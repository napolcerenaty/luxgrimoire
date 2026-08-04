'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
import { useBrandColors } from '@/lib/useBrandColors'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'
import { SaleAnnouncementContent } from '@/components/sales/SaleAnnouncementContent'

interface Props {
  sale: ApiSaleAnnouncement | null
  onClose: () => void
}

export function SaleAnnouncementModal({ sale, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const getBrandColors = useBrandColors()
  const [imgIndex, setImgIndex] = useState(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!sale) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [sale])

  const editions = sale?.editions ?? []
  const firstEditionCover = editions[0]?.edition?.additionalImages?.[0] ?? null
  const extraImages: string[] = Array.isArray(sale?.extraImagesJson) ? (sale!.extraImagesJson as string[]) : []
  const allImages = [...(sale?.imageUrl ? [sale.imageUrl] : []), ...extraImages]
  const currentImgRaw = allImages[imgIndex] ?? firstEditionCover
  const coverImg = currentImgRaw ? cloudinaryUrl(currentImgRaw, 'w_300,q_auto,f_auto') : null
  const totalImages = allImages.length
  const prevImg = useCallback(() => setImgIndex(i => (i - 1 + totalImages) % totalImages), [totalImages])
  const nextImg = useCallback(() => setImgIndex(i => (i + 1) % totalImages), [totalImages])

  if (!sale) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          ref={panelRef}
          className="
            relative w-full bg-stone-900 shadow-2xl
            max-h-[90dvh] overflow-y-auto overscroll-contain
            rounded-t-2xl border-t border-stone-700
            sm:rounded-2xl sm:border sm:border-stone-700 sm:max-w-2xl sm:mx-4
          "
        >
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-100 transition-colors"
          >
            <X size={18} />
          </button>

          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-stone-600" />
          </div>

          <div className="p-5 sm:p-6">
            {/* Image + content: stacked on mobile (side-by-side squeezes everything into a
                narrow column next to the cover), side by side from sm: up */}
            <div className="flex flex-col sm:flex-row gap-4 mb-5">
              {/* Cover */}
              <div className="shrink-0 w-28 mx-auto sm:mx-0">
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
                  const credits: { handle: string; role: string | null }[] = []
                  const regex = /@([\w.]+)(?:\s*\(([^)]+)\))?/g
                  let m: RegExpExecArray | null
                  while ((m = regex.exec(sale.photoCredit!)) !== null) {
                    credits.push({ handle: m[1], role: m[2] ?? null })
                  }
                  if (credits.length === 0) return null
                  const website = sale.company?.website
                  return (
                    <div className="text-[10px] text-stone-500 mt-1 text-center leading-4">
                      <span>📷 photo by</span>
                      {credits.map(({ handle, role }) => (
                        <div key={handle}>
                          <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-amber-600 hover:text-amber-400 transition-colors">
                            @{handle}<ExternalLink size={9} className="shrink-0" />
                          </a>
                          {role && <span> ({role})</span>}
                        </div>
                      ))}
                      {website && (
                        <div>
                          courtesy of{' '}
                          <a href={website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-amber-600 hover:text-amber-400 transition-colors">
                            {sale.company!.name}<ExternalLink size={9} className="shrink-0" />
                          </a>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Info (compact mode, with "View full page" link) */}
              <div className="flex-1 min-w-0 sm:pt-1">
                <SaleAnnouncementContent
                  sale={sale}
                  compact
                  showPageLink
                  onLinkClick={onClose}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}


