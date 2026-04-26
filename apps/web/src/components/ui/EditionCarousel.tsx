'use client'

import { memo, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cloudinaryUrl } from '@/lib/cloudinary'

export interface CarouselCard {
  id: string
  href: string
  coverImage: string | null
  title: string
  subtitle?: string | null
  author?: string | null
  badge?: string | null
  ribbon?: string | null
}

interface Props {
  title: string
  viewAllHref?: string
  cards: CarouselCard[]
  centered?: boolean
}

const CARD_WIDTH = 160

const CarouselCardItem = memo(function CarouselCardItem({ card }: { card: CarouselCard }) {
  const imgUrl = card.coverImage
    ? cloudinaryUrl(card.coverImage, 'w_320,h_480,c_fill,q_auto,f_auto')
    : null

  return (
    <Link
      key={card.id}
      href={card.href}
      className="flex-shrink-0 w-40 group rounded-lg overflow-hidden border border-stone-700 hover:border-amber-600/60 transition-all duration-250"
      style={{ background: 'var(--bg-raised)' }}
    >
      {/* Cover */}
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: '2/3', background: 'var(--bg-surface)' }}
      >
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgUrl}
            alt={card.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl font-serif text-amber-700/50">{card.title.charAt(0)}</span>
          </div>
        )}

        {/* Top badge */}
        {card.badge && (
          <span
            className="absolute top-1.5 left-1.5 text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(5,10,18,0.85)',
              border: '1px solid var(--border)',
              color: 'var(--accent2)',
            }}
          >
            {card.badge}
          </span>
        )}

        {/* Bottom ribbon — book box company name */}
        {card.ribbon && (
          <div
            className="absolute bottom-0 left-0 right-0 px-2 py-2 text-center"
            style={{ background: 'rgba(5,10,18,0.88)', borderTop: '1px solid rgba(200,180,140,0.2)' }}
          >
            <span
              className="font-serif font-semibold uppercase tracking-widest leading-none line-clamp-1 text-white"
              style={{ fontSize: '10px', letterSpacing: '0.12em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
            >
              {card.ribbon}
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
        {/* Series / subtitle – always rendered for height consistency, amber like EditionCard */}
        <p className="text-[10px] text-amber-600 font-medium tracking-wide truncate leading-tight min-h-[1em]">
          {card.subtitle || '\u00A0'}
        </p>
        {/* Title – fixed 2-line slot so cards align regardless of title length */}
        <div className="h-[2.25rem] overflow-hidden my-0.5">
          <p className="text-xs font-serif font-semibold text-stone-200 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">
            {card.title}
          </p>
        </div>
        {/* Author – always rendered for height consistency */}
        <p className="text-[10px] text-stone-500 line-clamp-1 font-sans leading-tight">
          {card.author || '\u00A0'}
        </p>
      </div>
    </Link>
  )
})

export const EditionCarousel = memo(function EditionCarousel({ title, viewAllHref, cards, centered }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({
      left: dir === 'left' ? -(CARD_WIDTH * 3 + 32) : CARD_WIDTH * 3 + 32,
      behavior: 'smooth',
    })
  }

  if (cards.length === 0) return null

  return (
    <section className="container mx-auto px-4 py-10">
      {/* Header */}
      {centered ? (
        <div className="flex flex-col items-center mb-6 gap-3">
          <div className="flex items-center gap-4 w-full">
            <span className="flex-1 h-px bg-stone-700" />
            <h2 className="text-2xl font-serif font-semibold text-stone-100 tracking-widest text-center whitespace-nowrap">
              {title}
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
      ) : (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-serif font-semibold text-stone-100 tracking-widest">{title}</h2>
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="text-xs text-amber-500 hover:text-amber-400 transition-colors font-serif tracking-wide border border-stone-700 hover:border-amber-700 px-3 py-1 rounded-full"
            >
              View all →
            </Link>
          )}
        </div>
      )}

      {/* Scroll area with side arrows */}
      <div className="relative group/carousel">
        {/* Left arrow */}
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

        {/* Right arrow */}
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

        {/* Cards strip */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {cards.map((card) => <CarouselCardItem key={card.id} card={card} />)}
        </div>
      </div>
    </section>
  )
})
