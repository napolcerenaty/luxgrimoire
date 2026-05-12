import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'
import { Badge } from '@/components/ui/Badge'
import SaleDateSelector from './SaleDateSelector'
import { SaleInterestSection } from './SaleInterestSection'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const sale = await apiFetch<ApiSaleAnnouncement>(`/announcements/${id}`)
    return { title: sale.title }
  } catch {
    return { title: 'Sale not found' }
  }
}

export default async function SaleAnnouncementPage({ params }: Props) {
  const { id } = await params

  let sale: ApiSaleAnnouncement
  try {
    sale = await apiFetch<ApiSaleAnnouncement>(`/announcements/${id}`)
  } catch {
    notFound()
  }

  const editions = sale.editions ?? []
  const allEditionIds = editions.map(e => e.editionId)

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      {/* Header */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-10 mb-12">
        {/* Image */}
        <div>
          {sale.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cloudinaryUrl(sale.imageUrl, 'w_560,h_560,c_fill,q_auto,f_auto') ?? sale.imageUrl}
              alt={sale.title}
              className="rounded-xl shadow-2xl w-full object-cover"
            />
          ) : (
            <div className="w-full aspect-[4/3] rounded-xl bg-stone-800 flex items-center justify-center text-stone-500">
              No image
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {sale.isBundle && (
              <Badge variant="default">Bundle</Badge>
            )}
            {sale.availableForPurchase && (
              <Badge variant="success">Available Now</Badge>
            )}
          </div>

          <h1 className="text-4xl font-serif font-bold text-stone-100 mb-4 leading-tight">
            {sale.title}
          </h1>

          {/* description removed */}

          {sale.expectedShipping && (
            <p className="text-stone-400 text-sm mb-6">
              <span className="text-stone-500">Expected shipping: </span>
              <span className="text-stone-300 font-medium">{sale.expectedShipping}</span>
            </p>
          )}

          {(sale as any).sourceUrl && (
            <p className="text-sm mb-6">
              <a
                href={(sale as any).sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-amber-500 hover:text-amber-400 underline underline-offset-2 transition-colors"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View original announcement
              </a>
            </p>
          )}

          {/* Dates + Region Selector */}
          <div className="mb-6">
            <SaleDateSelector
              regions={sale.regions ?? []}
              fallback={{
                generalSaleDate: sale.generalSaleDate,
                firstAccessDate: sale.firstAccessDate,
                earlyAccessDate: sale.earlyAccessDate,
                saleTimezone: sale.saleTimezone,
                basePrice: sale.basePrice,
                currency: sale.currency,
              }}
              userCountry={null}
            />
          </div>

          {/* Interest / preorder / add to collection */}
          <SaleInterestSection sale={sale} />
        </div>
      </div>

      {/* Editions */}
      {editions.length > 0 && (
        <section>
          <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">
            Included Editions
            <span className="ml-2 text-base font-sans font-normal text-stone-500">({editions.length})</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {editions.map(({ edition, editionId }) => {
              if (!edition) return null
              const book = edition.book
              const authors = book?.authors ?? []
              const coverUrl = edition.additionalImages?.[0]
              const coverSrc = coverUrl ? cloudinaryUrl(coverUrl, 'w_200,h_300,c_fill,q_auto,f_auto') : null
              const displayTitle = book?.title ?? (edition as any).bookBoxCompany?.name ?? 'Edition'

              return (
                <Link
                  key={editionId}
                  href={`/editions/${edition.slug}`}
                  className="group bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-amber-500/30 transition-colors"
                >
                  {coverSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverSrc}
                      alt={displayTitle}
                      className="w-full aspect-[2/3] object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-[2/3] bg-stone-800 flex items-center justify-center text-stone-600 text-xs">
                      No cover
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-stone-200 text-sm font-medium leading-tight line-clamp-2">
                      {displayTitle}
                    </p>
                    {authors.length > 0 && (
                      <p className="text-stone-500 text-xs mt-1 line-clamp-1">
                        {(authors as any[]).map((a: any) => (a.author ?? a).name).join(', ')}
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
