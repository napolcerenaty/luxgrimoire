'use client'

import { EditionCard } from './EditionCard'
import type { ApiBookEdition } from '@luxgrimoire/shared-types'
import { resolveEditionCoverRaw } from '@/lib/editionCover'

interface Props {
  editions: ApiBookEdition[]
}

export function BookEditionsSection({ editions }: Props) {
  if (editions.length === 0) {
    return (
      <p className="text-stone-600 text-sm mt-4">No editions in the database yet.</p>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {editions.map(edition => (
        <EditionCard
          key={edition.id}
          href={`/editions/${edition.slug}`}
          coverImage={resolveEditionCoverRaw(edition)}
          companyName={edition.bookBoxCompany?.name}
          companySlug={edition.bookBoxCompany?.slug}
          unverified={!edition.verifiedAt}
          generalSaleDate={edition.generalSaleDate}
        />
      ))}
    </div>
  )
}
