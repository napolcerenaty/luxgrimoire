'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react'

interface ImageCarouselProps {
  images: string[]
  alt: string
}

export function ImageCarousel({ images, alt }: ImageCarouselProps) {
  const [current, setCurrent] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const total = images.length

  const prev = useCallback(() => setCurrent((c) => (c - 1 + total) % total), [total])
  const next = useCallback(() => setCurrent((c) => (c + 1) % total), [total])

  // Keyboard navigation + Escape to close lightbox
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false)
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox, prev, next])

  if (total === 0) return null

  return (
    <>
      <div className="flex flex-col gap-3 w-full">
        {/* Main image */}
        <div
          className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 ring-1 ring-stone-700/50 shadow-2xl cursor-zoom-in group"
          onClick={() => setLightbox(true)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[current]}
            alt={`${alt} — ${current + 1} / ${total}`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />

          {/* Zoom hint */}
          <div className="absolute top-2 right-2 p-1.5 rounded-full bg-stone-950/60 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <ZoomIn size={14} />
          </div>

          {total > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prev() }}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-stone-950/70 text-stone-300 hover:bg-stone-950 hover:text-amber-400 transition-all"
                aria-label="Previous"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); next() }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-stone-950/70 text-stone-300 hover:bg-stone-950 hover:text-amber-400 transition-all"
                aria-label="Next"
              >
                <ChevronRight size={18} />
              </button>

              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-stone-950/70 text-stone-400 text-xs pointer-events-none">
                {current + 1} / {total}
              </div>
            </>
          )}
        </div>

        {/* Thumbnails */}
        {total > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={img}
                alt={`${alt} thumbnail ${i + 1}`}
                onClick={() => setCurrent(i)}
                className={`w-14 h-20 rounded-lg object-cover shrink-0 cursor-pointer transition-all ${
                  i === current
                    ? 'ring-2 ring-amber-500 opacity-100'
                    : 'ring-1 ring-stone-700 opacity-50 hover:opacity-80'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/95 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-stone-800 text-stone-300 hover:text-white hover:bg-stone-700 transition-all z-10"
            onClick={() => setLightbox(false)}
            aria-label="Close"
          >
            <X size={22} />
          </button>

          {/* Counter */}
          {total > 1 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-stone-800/80 text-stone-400 text-sm">
              {current + 1} / {total}
            </div>
          )}

          {/* Image + arrows overlay */}
          <div
            className="relative flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[current]}
              alt={`${alt} — ${current + 1}`}
              className="max-h-[90vh] max-w-[90vw] w-auto h-auto rounded-lg shadow-2xl"
            />

            {/* Prev / Next — overlaid on image edges */}
            {total > 1 && (
              <>
                <button
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-stone-950/70 text-stone-300 hover:text-amber-400 hover:bg-stone-950 transition-all"
                  onClick={(e) => { e.stopPropagation(); prev() }}
                  aria-label="Previous"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-stone-950/70 text-stone-300 hover:text-amber-400 hover:bg-stone-950 transition-all"
                  onClick={(e) => { e.stopPropagation(); next() }}
                  aria-label="Next"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
