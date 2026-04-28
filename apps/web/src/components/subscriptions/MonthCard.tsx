'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'

interface MonthBook {
  slug: string
  title: string
  coverImage?: string | null
  edition?: {
    slug?: string | null
    coverImage?: string | null
  } | null
}

interface CardArtist {
  slug: string
  name: string
  instagram: string | null
}

interface MonthCardProps {
  year: number
  month: number
  monthName: string
  theme?: string | null
  coverImage?: string | null
  mainBook?: MonthBook | null
  isSpoiler?: boolean
  cardArtist?: CardArtist | null
}

export default function MonthCard({
  year,
  month: _month,
  monthName,
  theme,
  coverImage,
  mainBook,
  isSpoiler,
  cardArtist,
}: MonthCardProps) {
  const [hovered, setHovered] = useState(false)

  const hoverImage = mainBook?.edition?.coverImage ?? mainBook?.coverImage ?? null
  const thumbUrl = cloudinaryUrl(coverImage, 'w_400,c_fill,q_auto,f_auto')
  const hoverThumbUrl = cloudinaryUrl(hoverImage, 'w_400,c_fill,q_auto,f_auto')
  const bookSlug = mainBook?.slug

  const inner = (
    <div
      className="relative rounded-xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors select-none"
      style={{ cursor: bookSlug ? 'pointer' : 'default' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image area */}
      <div className="aspect-[2/3] overflow-hidden bg-stone-800 relative">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={`${monthName} ${year}`}
            className={`w-full h-full object-cover transition-opacity duration-300 ${hovered && hoverThumbUrl ? 'opacity-0' : 'opacity-100'}`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 px-3
            bg-gradient-to-br from-stone-900 via-stone-950 to-stone-900">
            <span className="text-stone-400 font-serif text-xs tracking-widest uppercase text-center">
              {monthName} {year}
            </span>
            {theme && (
              <span className="text-stone-500 text-xs italic text-center line-clamp-3">
                {theme}
              </span>
            )}
          </div>
        )}

        {/* Hover: edition/book image */}
        {hoverThumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hoverThumbUrl}
            alt={mainBook?.title ?? ''}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${hovered ? 'opacity-100' : 'opacity-0'}`}
          />
        )}

        {/* Hover overlay with book title — sits above the ribbon (ribbon ~28px) */}
        {hovered && (
          <div className="absolute inset-0 bg-stone-950/70 flex flex-col items-center justify-center pb-8 px-3 pointer-events-none">
            {mainBook?.edition ? (
              <p className="text-stone-100 text-xs font-serif font-semibold text-center leading-snug line-clamp-4">
                {mainBook.title}
              </p>
            ) : (
              <p className="text-stone-400 text-xs text-center italic">Book details coming soon</p>
            )}
          </div>
        )}

        {/* Month ribbon */}
        <div
          className="absolute bottom-0 left-0 right-0 px-2 py-2"
          style={{
            background: 'rgba(5,10,18,0.88)',
            borderTop: '1px solid rgba(200,180,140,0.2)',
          }}
        >
          <p
            className="text-center font-serif uppercase tracking-widest leading-none font-semibold text-white"
            style={{ fontSize: '10px', letterSpacing: '0.12em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
          >
            {monthName} {year}
          </p>
        </div>
      </div>

      {/* Theme below image */}
      <div className="p-3 pt-2 min-h-[3rem] flex flex-col justify-start">
        {theme ? (
          <p className="text-stone-300 text-xs font-serif italic line-clamp-2">{theme}</p>
        ) : (
          <p className="text-stone-600 text-xs italic">No theme yet</p>
        )}
        {cardArtist && (
          <Link
            href={`/artists/${cardArtist.slug}`}
            className="text-[10px] text-stone-500 hover:text-amber-400 transition-colors mt-1 truncate"
            onClick={(e) => e.stopPropagation()}
          >
            card art by {cardArtist.instagram ? `@${cardArtist.instagram.replace(/^@/, '')}` : cardArtist.name}
          </Link>
        )}
        {isSpoiler && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-amber-950/60 text-amber-400 mt-1.5">
            Spoiler
          </span>
        )}
      </div>
    </div>
  )

  if (bookSlug) {
    const bookHref = mainBook?.edition?.slug
      ? `/editions/${mainBook.edition.slug}`
      : `/books/${bookSlug}`
    return (
      <Link href={bookHref} className="block">
        {inner}
      </Link>
    )
  }

  return inner
}
