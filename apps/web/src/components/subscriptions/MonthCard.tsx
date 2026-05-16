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
}: MonthCardProps) {
  const [hovered, setHovered] = useState(false)
  const router = useRouter()

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
      className="relative rounded-xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors select-none flex flex-col h-full"
      style={{ cursor: bookSlug ? 'pointer' : 'default' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image area */}
      <div className="aspect-[2/3] overflow-hidden bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 relative">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={`${monthName} ${year}`}
            className={`w-full h-full object-cover transition-opacity duration-300 ${hovered && hoverImageUrl ? 'opacity-0' : 'opacity-100'}`}
          />
        ) : (
          <div className="w-full h-full relative bg-stone-950 flex flex-col items-center justify-center gap-1.5 px-3">
            {/* Very subtle brand gradient overlay */}
            <div
              className="absolute inset-0 opacity-[0.18]"
              style={
                accentColors?.length
                  ? { background: `linear-gradient(135deg, ${accentColors[1] ?? '#1c1917'} 0%, ${accentColors[0] ?? '#292524'} 60%, ${accentColors[2] ?? '#1c1917'} 100%)` }
                  : { background: 'linear-gradient(135deg, #1c1917 0%, #0c0a09 60%, #1c1917 100%)' }
              }
            />
            <span className="relative z-10 text-stone-400 font-serif text-xs tracking-widest uppercase text-center">
              {monthName} {year}
            </span>
            {theme && (
              <span className="relative z-10 text-stone-500 text-xs italic uppercase text-center line-clamp-3">
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
      <div className="p-3 pt-2 flex flex-col justify-start flex-1 min-h-[3.5rem]">
        <div className="flex items-baseline gap-x-2 min-w-0">
          {theme ? (
            <p className="text-stone-300 text-xs font-serif italic uppercase truncate min-w-0 flex-1">{theme}</p>
          ) : (
            <p className="text-stone-600 text-xs italic flex-1">No theme yet</p>
          )}
          {cardArtist && (
            <Link
              href={`/artists/${cardArtist.slug}`}
              className="text-[10px] text-stone-500 hover:text-amber-400 transition-colors shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              card art by {cardArtist.instagram ? `@${cardArtist.instagram.replace(/^@/, '')}` : cardArtist.name}
            </Link>
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
