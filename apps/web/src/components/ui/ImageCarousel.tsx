'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ImageCarouselProps {
  images: string[]
  alt: string
}

export function ImageCarousel({ images, alt }: ImageCarouselProps) {
  const [current, setCurrent] = useState(0)
  const total = images.length

  if (total === 0) return null

  const prev = () => setCurrent((c) => (c - 1 + total) % total)
  const next = () => setCurrent((c) => (c + 1) % total)

  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-stone-800 ring-1 ring-stone-700/50 shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[current]}
          alt={`${alt} — ${current + 1} / ${total}`}
          className="w-full h-full object-cover"
        />

        {total > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-stone-950/70 text-stone-300 hover:bg-stone-950 hover:text-amber-400 transition-all"
              aria-label="Previous"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-stone-950/70 text-stone-300 hover:bg-stone-950 hover:text-amber-400 transition-all"
              aria-label="Next"
            >
              <ChevronRight size={18} />
            </button>

            {/* Counter */}
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-stone-950/70 text-stone-400 text-xs">
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
  )
}
