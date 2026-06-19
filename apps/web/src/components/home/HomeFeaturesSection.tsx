'use client'

import { useRef } from 'react'
import Link from 'next/link'
import * as Icons from 'lucide-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ComponentType } from 'react'

export interface HomepageFeature {
  id: string
  title: string
  description: string
  iconName: string
  ctaLabel: string | null
  ctaHref: string | null
}

function FeatureIcon({ name }: { name: string }) {
  const Icon = (Icons as Record<string, ComponentType<{ size?: number }>>)[name] ?? Icons.Star
  return <Icon size={26} />
}

function FeatureCard({ feature }: { feature: HomepageFeature }) {
  return (
    <div className="w-72 flex-shrink-0 snap-start rounded-2xl border border-stone-800 bg-stone-900 p-6 transition-colors hover:border-amber-700/40 sm:w-80">
      <div className="mb-3 flex items-center gap-3">
        <div className="shrink-0 rounded-xl bg-stone-800 p-3 text-amber-400">
          <FeatureIcon name={feature.iconName} />
        </div>
        <h3 className="font-serif text-lg leading-snug text-stone-100">{feature.title}</h3>
      </div>
      <p className={`text-sm leading-relaxed text-stone-400 ${feature.ctaHref ? 'mb-4' : ''}`}>
        {feature.description}
      </p>
      {feature.ctaHref && (
        <Link href={feature.ctaHref} className="text-sm font-serif text-amber-500 transition-colors hover:text-amber-400">
          {feature.ctaLabel ?? 'Get started'} →
        </Link>
      )}
    </div>
  )
}

export function FeaturesCarousel({ features }: { features: HomepageFeature[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' })
  }

  return (
    <div className="container mx-auto max-w-5xl px-4">
      <div className="group/carousel relative overflow-hidden">
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

        {/* Scrollable track */}
        <div
          ref={scrollRef}
          className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4"
        >
          {features.map((feature) => <FeatureCard key={feature.id} feature={feature} />)}
        </div>

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
      </div>
    </div>
  )
}

