'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cloudinaryUrl } from '@/lib/cloudinary'

export interface CarouselCard {
  id: string
  href: string
  coverImage: string | null
  title: string
  subtitle?: string | null
  badge?: string | null
  ribbon?: string | null
}

interface Props {
  title: string
  viewAllHref?: string
  cards: CarouselCard[]
}

const CARD_WIDTH = 160

export function EditionCarousel({ title, viewAllHref, cards }: Props) {
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-serif font-semibold text-stone-100 tracking-wide">{title}</h2>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-xs text-amber-500 hover:text-amber-400 transition-colors font-serif tracking-wide border border-stone-700 hover:border-amber-700 px-3 py-1 rounded-full"
          >
            View all →
          </Link>
        )}
      </div>

      {/* Scroll area with side arrows */}
      <div className="relative group/carousel">
        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          aria-label="Scroll left"
          className="absolute left-0 top-0 bottom-3 z-10 w-10 flex items-center justify-center
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
          className="absolute right-0 top-0 bottom-3 z-10 w-10 flex items-center justify-center
                     bg-gradient-to-l from-[var(--bg)] to-transparent
                     opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-200
                     text-stone-400 hover:text-amber-400"
        >
          <ChevronRight size={24} />
        </button>

        {/* Cards strip */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-3 scroll-smooth"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}
        >
          {cards.map((card) => {
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
                      className="absolute bottom-0 left-0 right-0 px-2 py-1 text-center"
                      style={{ background: 'rgba(5,10,18,0.82)', borderTop: '1px solid rgba(180,120,40,0.35)' }}
                    >
                      <span className="text-[9px] font-serif font-semibold uppercase tracking-widest text-amber-400 line-clamp-1">
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
                <div className="px-2.5 py-2">
                  <p className="text-xs font-serif font-semibold text-stone-200 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">
                    {card.title}
                  </p>
                  {card.subtitle && (
                    <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-1 font-sans">{card.subtitle}</p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
