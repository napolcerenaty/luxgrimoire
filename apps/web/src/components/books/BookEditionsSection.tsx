'use client'

import { useState } from 'react'
import { EditionCard } from './EditionCard'
import type { ApiBookEdition } from '@luxgrimoire/shared-types'

interface Props {
  editions: ApiBookEdition[]
}

export function BookEditionsSection({ editions }: Props) {
  const [companyFilter, setCompanyFilter] = useState<string | null>(null)

  // Collect unique companies from editions
  const companies = Array.from(
    new Map(
      editions
        .filter(e => e.bookBoxCompany)
        .map(e => [e.bookBoxCompany!.slug, e.bookBoxCompany!])
    ).values()
  )

  const filtered = companyFilter
    ? editions.filter(e => e.bookBoxCompany?.slug === companyFilter)
    : editions

  if (editions.length === 0) {
    return (
      <p className="text-stone-600 text-sm mt-4">No editions in the database yet.</p>
    )
  }

  return (
    <div>
      {/* Company filter */}
      {companies.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setCompanyFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              companyFilter === null
                ? 'bg-amber-700 text-white'
                : 'bg-stone-800 text-stone-400 hover:text-stone-200'
            }`}
          >
            All ({editions.length})
          </button>
          {companies.map(c => {
            const count = editions.filter(e => e.bookBoxCompany?.slug === c.slug).length
            return (
              <button
                key={c.slug}
                onClick={() => setCompanyFilter(c.slug)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  companyFilter === c.slug
                    ? 'bg-amber-700 text-white'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                {c.name} ({count})
              </button>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {filtered.map(edition => (
          <EditionCard
            key={edition.id}
            href={`/editions/${edition.slug}`}
            coverImage={edition.additionalImages?.[0] ?? null}
            companyName={edition.bookBoxCompany?.name}
            companySlug={edition.bookBoxCompany?.slug}
            unverified={!edition.verifiedAt}
            generalSaleDate={edition.generalSaleDate}
          />
        ))}
      </div>
    </div>
  )
}
