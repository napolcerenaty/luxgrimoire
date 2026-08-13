'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { apiFetch } from '@/lib/api'
import type { CommunityImage } from '@/types/community'

interface MonthBook {
  slug: string
  title: string
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
  accentColors?: string[] | null
  editionSlug?: string | null
  // Company-wide skip (SubscriptionMonthSkip) — when set, short-circuits to a "Skipped: reason"
  // card instead of the normal cover/theme layout; there's no book to preview on hover.
  skipped?: { reason: string | null } | null
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
  accentColors,
  editionSlug,
  skipped,
}: MonthCardProps) {
  const [hovered, setHovered] = useState(false)
  const router = useRouter()

  if (skipped) {
    return (
      <div className="relative rounded-xl overflow-hidden bg-navy-900 border border-brand-800/40 select-none flex flex-col h-full">
        <div className="aspect-[2/3] overflow-hidden bg-brand-950/20 relative flex flex-col items-center justify-center gap-1.5 px-3">
          <span className="text-brand-400 font-serif text-xl">⏭</span>
          <span className="text-brand-400 font-serif text-xs tracking-widest uppercase text-center">Skipped</span>
          <div className="card-ribbon absolute bottom-0 left-0 right-0 px-2 py-2">
            <p
              className="card-ribbon-text text-center font-serif uppercase tracking-widest leading-none font-semibold text-white"
              style={{ fontSize: '10px', letterSpacing: '0.12em' }}
            >
              {monthName} {year}
            </p>
          </div>
        </div>
        <div className="p-3 pt-2 flex flex-col justify-start flex-1 min-h-[3.5rem]">
          <p className="text-brand-500/90 text-xs italic leading-snug">
            {skipped.reason || 'This month is skipped — no box this cycle.'}
          </p>
        </div>
      </div>
    )
  }

  // Lazy-load community images only when hovered
  const { data: communityImages } = useQuery<CommunityImage[]>({
    queryKey: ['community-images-hover', editionSlug],
    queryFn: () => apiFetch<CommunityImage[]>(`/editions/${editionSlug}/community-images`),
    enabled: hovered && !!editionSlug,
    staleTime: 1000 * 60 * 10,
  })

  const approvedCommunityImage = communityImages?.find((img) => img.status === 'APPROVED') ?? null

  const bookCoverImage = mainBook?.edition?.coverImage ?? null
  // Community photo takes priority over book cover on hover
  const hoverImageUrl = approvedCommunityImage
    ? (cloudinaryUrl(approvedCommunityImage.cloudinaryId, 'w_400,c_fill,q_auto,f_auto') ?? approvedCommunityImage.url)
    : cloudinaryUrl(bookCoverImage, 'w_400,c_fill,q_auto,f_auto')

  const thumbUrl = cloudinaryUrl(coverImage, 'w_400,c_fill,q_auto,f_auto')
  const bookSlug = mainBook?.slug

  const inner = (
    <div
      className="relative rounded-xl overflow-hidden bg-navy-900 border border-navy-800 hover:border-brand-700/50 transition-colors select-none flex flex-col h-full"
      style={{ cursor: bookSlug ? 'pointer' : 'default' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image area */}
      <div className="aspect-[2/3] overflow-hidden bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900 relative">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={`${monthName} ${year}`}
            className={`w-full h-full object-cover transition-opacity duration-300 ${hovered && hoverImageUrl ? 'opacity-0' : 'opacity-100'}`}
          />
        ) : (
          <div className="w-full h-full relative bg-navy-950 flex flex-col items-center justify-center gap-1.5 px-3">
            {/* Very subtle brand gradient overlay */}
            <div
              className="absolute inset-0 opacity-[0.18]"
              style={
                accentColors?.length
                  ? { background: `linear-gradient(135deg, ${accentColors[1] ?? '#1c1917'} 0%, ${accentColors[0] ?? '#292524'} 60%, ${accentColors[2] ?? '#1c1917'} 100%)` }
                  : { background: 'linear-gradient(135deg, #1c1917 0%, #0c0a09 60%, #1c1917 100%)' }
              }
            />
            <span className="relative z-10 text-navy-400 font-serif text-xs tracking-widest uppercase text-center">
              {monthName} {year}
            </span>
            {theme && (
              <span className="relative z-10 text-navy-500 text-xs italic uppercase text-center line-clamp-3">
                {theme}
              </span>
            )}
          </div>
        )}

        {/* Hover: community photo (preferred) or edition/book image */}
        {hoverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hoverImageUrl}
            alt={approvedCommunityImage ? 'Community photo' : (mainBook?.title ?? '')}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${hovered ? 'opacity-100' : 'opacity-0'}`}
          />
        )}

        {/* Hover overlay with book title — sits above the ribbon (ribbon ~28px) */}
        {hovered && (
          <div className="absolute inset-0 bg-navy-950/70 flex flex-col items-center justify-center pb-8 px-3 pointer-events-none">
            {mainBook?.edition ? (
              <p className="text-navy-100 text-xs font-serif font-semibold text-center leading-snug line-clamp-4">
                {mainBook.title}
              </p>
            ) : (
              <p className="text-navy-400 text-xs text-center italic">Book details coming soon</p>
            )}
          </div>
        )}

        {/* Month ribbon */}
        <div className="card-ribbon absolute bottom-0 left-0 right-0 px-2 py-2">
          <p
            className="card-ribbon-text text-center font-serif uppercase tracking-widest leading-none font-semibold text-white"
            style={{ fontSize: '10px', letterSpacing: '0.12em' }}
          >
            {monthName} {year}
          </p>
        </div>
      </div>

      {/* Theme below image */}
      <div className="p-3 pt-2 flex flex-col justify-start flex-1 min-h-[3.5rem]">
        <div className="flex flex-col gap-y-0.5">
          {/* Artist line — always rendered to keep cards aligned across a row */}
          {cardArtist ? (
            <Link
              href={`/artists/${cardArtist.slug}`}
              className="text-[10px] text-navy-500 hover:text-brand-400 transition-colors leading-none"
              onClick={(e) => e.stopPropagation()}
            >
              card art by {cardArtist.instagram ? `@${cardArtist.instagram.replace(/^@/, '')}` : cardArtist.name}
            </Link>
          ) : (
            <span className="text-[10px] leading-none invisible select-none">_</span>
          )}
          {/* Theme — single line, truncated */}
          {theme ? (
            <p className="text-navy-300 text-xs font-serif italic uppercase leading-snug">{theme}</p>
          ) : (
            <p className="text-navy-600 text-xs italic leading-snug">No theme yet</p>
          )}
        </div>
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
      <div
        role="link"
        tabIndex={0}
        className="block cursor-pointer h-full"
        onClick={() => router.push(bookHref)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push(bookHref) }}
      >
        {inner}
      </div>
    )
  }

  return inner
}
