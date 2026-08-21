'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
import { formatVolumeNumbers } from '@/lib/volumeNumbers'

interface EditionCardProps {
  href: string
  coverImage: string | null
  companyName?: string | null
  companySlug?: string | null
  companyBrandColors?: string[] | null
  seriesName?: string | null
  volumeNumbers?: number[] | null
  title?: string
  authors?: Array<{ name: string }>
  unverified?: boolean
  generalSaleDate?: string | null
  variantLabel?: string | null
  /** Rendered inside the image area (e.g. hover action buttons overlay) */
  imageActions?: React.ReactNode
  /** Rendered below authors */
  footer?: React.ReactNode
  /** 'mine'/'skipped' = books-by-month subscription highlight (gold/red).
   *  'have-it'/'coming'/'gone' = company-page ownership-status glow (gold/amber/slate). */
  highlight?: 'mine' | 'skipped' | 'have-it' | 'coming' | 'gone' | null
}

const HIGHLIGHT_CLASS: Record<string, string> = {
  mine: 'edition-glow-gold',
  'have-it': 'edition-glow-gold',
  skipped: 'edition-glow-red',
  coming: 'edition-glow-amber',
  gone: 'edition-glow-slate',
}

export function EditionCard({
  href,
  coverImage,
  companyName,
  companySlug,
  companyBrandColors,
  seriesName,
  volumeNumbers,
  title,
  authors,
  unverified,
  generalSaleDate,
  imageActions,
  footer,
  highlight,
  variantLabel,
}: EditionCardProps) {
  const cover = cloudinaryUrl(coverImage, 'w_400,h_600,c_fill,q_auto,f_auto')
  const altText = title ?? companyName ?? 'Edition'
  const fullTitle = title && variantLabel ? `${title} (${variantLabel})` : title
  const highlightClass = highlight ? (HIGHLIGHT_CLASS[highlight] ?? '') : ''

  // Computed post-mount, not during render: comparing generalSaleDate against
  // `new Date()` at render time diverges between the SSR pass and the client
  // hydration pass (different "now"), which flips this badge in/out and
  // triggers hydration mismatches (Sentry: Hydration Error on book pages).
  const [isUpcoming, setIsUpcoming] = useState(false)
  useEffect(() => {
    setIsUpcoming(generalSaleDate ? new Date(generalSaleDate) > new Date() : false)
  }, [generalSaleDate])

  return (
    <Link
      href={href}
      className={`group flex flex-col h-full rounded-2xl bg-navy-900 border hover:border-brand-700/60 transition-all hover:shadow-xl hover:shadow-brand-900/10 ${highlightClass} ${
        unverified ? 'border-brand-800/50' : 'border-navy-800'
      }`}
    >
      <div className="relative aspect-[2/3] bg-navy-950 overflow-hidden rounded-t-2xl">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={altText}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="relative w-full h-full flex items-center justify-center text-navy-600 p-3">
            {/* Brand gradient overlay */}
            <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(companyBrandColors)} />
            <span className="relative z-10 text-xs font-serif text-navy-300/80 text-center leading-snug line-clamp-4">{title ?? altText}</span>
          </div>
        )}

        {unverified && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-700/50">
            <span className="text-[9px] text-amber-500 font-serif uppercase tracking-wide">Pending</span>
          </div>
        )}

        {isUpcoming && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-navy-950/80 border border-navy-600/50">
            <span className="text-[9px] text-navy-300 font-medium uppercase tracking-wide">Upcoming</span>
          </div>
        )}

        {variantLabel && (
          <span className="absolute bottom-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight bg-navy-800/90 text-navy-300 border border-navy-600 max-w-[calc(100%-0.75rem)] truncate">
            {variantLabel}
          </span>
        )}

        {imageActions}
      </div>

      <div className="p-3 flex flex-col flex-1">
        <div className="flex-1 flex flex-col gap-1">
          {title ? (
            <>
              {/* Always reserve series line height so title aligns across cards */}
              <p className="text-[11px] text-brand-600 font-medium tracking-wide truncate min-h-[1em]">
                {seriesName ? `${seriesName}${volumeNumbers?.length ? ` #${formatVolumeNumbers(volumeNumbers)}` : ''}` : '\u00A0'}
              </p>
              <p title={fullTitle} className="font-serif font-semibold text-navy-100 text-sm leading-snug line-clamp-2 group-hover:text-brand-400 transition-colors">
                {title}
              </p>
              {authors && authors.length > 0 && (
                <p className="text-[11px] text-navy-500 truncate">
                  {authors.map(a => a.name).join(', ')}
                </p>
              )}
              {companyName && (
                <p className="text-[10px] text-brand-700 font-medium leading-tight line-clamp-2 mt-0.5">
                  {companySlug ? (
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.href = `/companies/${companySlug}` }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); window.location.href = `/companies/${companySlug}` } }}
                      className="hover:text-brand-500 transition-colors cursor-pointer"
                    >{companyName}</span>
                  ) : companyName}
                </p>
              )}
            </>
          ) : (
            /* No title mode: only show company/edition name prominently */
            <p className="font-serif font-semibold text-navy-100 text-sm leading-snug group-hover:text-brand-400 transition-colors line-clamp-2">
              {companySlug ? (
                <span
                  role="link"
                  tabIndex={0}
                  onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.href = `/companies/${companySlug}` }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); window.location.href = `/companies/${companySlug}` } }}
                  className="hover:text-brand-500 transition-colors cursor-pointer"
                >{companyName}</span>
              ) : (companyName ?? 'Edition')}
            </p>
          )}
        </div>
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    </Link>
  )
}
