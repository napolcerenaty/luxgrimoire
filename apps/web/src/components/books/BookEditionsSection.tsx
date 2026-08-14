import { apiFetch } from '@/lib/api'
import { EditionCard } from './EditionCard'
import type { ApiBookEdition } from '@luxgrimoire/shared-types'
import { resolveEditionCoverRaw } from '@/lib/editionCover'

interface Props {
  bookSlug: string
}

export async function BookEditionsSection({ bookSlug }: Props) {
  const editions = await apiFetch<ApiBookEdition[]>(`/books/${bookSlug}/editions`)

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-serif font-semibold text-navy-100">
          Editions
          {editions.length > 0 && (
            <span className="ml-2 text-base font-sans font-normal text-navy-500">({editions.length})</span>
          )}
        </h2>
      </div>
      {editions.length === 0 ? (
        <p className="text-navy-600 text-sm mt-4">No editions in the database yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {editions.map(edition => (
            <EditionCard
              key={edition.id}
              href={`/editions/${edition.slug}`}
              coverImage={resolveEditionCoverRaw(edition)}
              companyName={edition.bookBoxCompany?.name}
              companySlug={edition.bookBoxCompany?.slug}
              companyBrandColors={(edition.bookBoxCompany as any)?.brandColors}
              unverified={!edition.verifiedAt}
              generalSaleDate={edition.resolvedSaleDate?.date ?? null}
              variantLabel={edition.variantLabel}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function BookEditionsSkeleton() {
  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <div className="h-8 w-32 bg-navy-800 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] rounded-xl bg-navy-800 animate-pulse" />
        ))}
      </div>
    </section>
  )
}
