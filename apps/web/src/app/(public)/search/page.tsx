import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SearchContent } from './SearchContent'

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search for books, authors, artists, and subscription box companies on LuxGrimoire.',
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-10 max-w-3xl">
          <h1 className="text-4xl font-serif font-bold text-navy-100 mb-8">Search</h1>
          <div className="h-12 rounded-full bg-navy-800 animate-pulse" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  )
}
