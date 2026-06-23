import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'
import { Badge } from '@/components/ui/Badge'
import { ImageCarousel } from '@/components/ui/ImageCarousel'
import SaleDateSelector from './SaleDateSelector'
import { SaleInterestSection } from './SaleInterestSection'
import { brandGradientStyle } from '@/lib/brandGradient'

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

  // Build full-res image URLs for carousel
  const extraImages: string[] = Array.isArray(sale.extraImagesJson) ? sale.extraImagesJson : []
  const carouselImages = [
    ...(sale.imageUrl ? [cloudinaryUrl(sale.imageUrl, 'w_560,q_auto,f_auto')!] : []),
    ...extraImages.map(img => cloudinaryUrl(img, 'w_560,q_auto,f_auto')!).filter(Boolean),
  ]

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      {/* Header */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-10 mb-12">
        {/* Image(s) */}
        <div>
          {carouselImages.length > 0 ? (
            <ImageCarousel images={carouselImages} alt={sale.title} />
          ) : (
            <div
              className="w-full aspect-[2/3] rounded-xl flex items-center justify-center relative overflow-hidden"
              style={brandGradientStyle(sale.company?.brandColors)}
            >
              <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(sale.company?.brandColors)} />
              <p className="relative z-10 font-serif font-semibold text-center px-4 text-stone-200 leading-snug line-clamp-5">
                {sale.title}
              </p>
            </div>
          )}
          {sale.photoCredit && (() => {
            const handle = sale.photoCredit.replace(/^@/, '')
            return (
              <p className="text-xs text-stone-500 mt-2 text-center">
                📷 photo by{' '}
                <a
                  href={`https://instagram.com/${handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-amber-400 transition-colors"
                >
                  @{handle}
                </a>
              </p>
            )
          })()}
        </div>

        {/* Info */}
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {sale.isBundle && (
              <Badge variant="default">Bundle</Badge>
            )}
            {(sale as any).saleType && (() => {
              const typeLabels: Record<string, string> = { LIMITED_PREORDER: '⏳ Limited Preorder', OPEN_PREORDER: '🔓 Open Preorder', OVERSTOCK: '📦 Overstock' }
              const typeColors: Record<string, string> = { LIMITED_PREORDER: 'bg-violet-500/15 text-violet-300 border-violet-500/30', OPEN_PREORDER: 'bg-sky-500/15 text-sky-300 border-sky-500/30', OVERSTOCK: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }
              const t = (sale as any).saleType
              return <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border ${typeColors[t] ?? 'bg-stone-700 text-stone-300 border-stone-600'}`}>{typeLabels[t] ?? t}</span>
            })()}
            {(sale as any).isSoldOut && (
              <span className="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/30">Sold Out</span>
            )}
            {sale.availableForPurchase && !(sale as any).isSoldOut && (
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

          {(sale as any).endsAt && (
            <p className="text-stone-400 text-sm mb-4">
              <span className="text-stone-500">Sale ends: </span>
              <span className="text-stone-300 font-medium">
                {new Date((sale as any).endsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          )}

          {(sale as any).notes && (
            <div className="mb-6 text-sm text-stone-300 prose prose-invert prose-sm max-w-none
              [&_a]:text-amber-400 [&_a:hover]:text-amber-300 [&_a]:underline [&_a]:underline-offset-2
              [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
              dangerouslySetInnerHTML={{ __html: (sale as any).notes }}
            />
          )}

          {/* Dates + Region Selector */}
          {sale.subscriberBasePrice != null && sale.currency && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40">
              <span className="text-emerald-400 text-sm">🏷</span>
              <span className="text-emerald-300 text-sm">
                Subscriber price: <strong>{sale.currency === 'GBP' ? '£' : sale.currency === 'USD' ? '$' : sale.currency === 'EUR' ? '€' : sale.currency}{sale.subscriberBasePrice}</strong>
                <span className="text-emerald-500 text-xs ml-1">(vs {sale.currency === 'GBP' ? '£' : sale.currency === 'USD' ? '$' : sale.currency === 'EUR' ? '€' : sale.currency}{sale.basePrice} general)</span>
              </span>
            </div>
          )}
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
      {editions.length > 0 && (() => {
        const items = sale.items ?? []
        // Build itemId → item map
        const itemMap = new Map(items.map(it => [it.id, it]))

        // Grouped editions (in an item group), keyed by itemId
        const grouped = new Map<string, typeof editions>()
        // Standalone: no item OR flagged isStandalone
        const standalone: typeof editions = []

        for (const ed of editions) {
          if (ed.itemId) {
            if (!grouped.has(ed.itemId)) grouped.set(ed.itemId, [])
            grouped.get(ed.itemId)!.push(ed)
            if ((ed as any).isStandalone) standalone.push(ed)
          } else {
            standalone.push(ed)
          }
        }

        const renderEditionCard = (ed: typeof editions[0]) => {
          const { edition, editionId } = ed
          if (!edition) return null
          const book = edition.book
          const authors = book?.authors ?? []
          const coverUrl = edition.additionalImages?.[0]
          const coverSrc = coverUrl ? cloudinaryUrl(coverUrl, 'w_200,h_300,c_fill,q_auto,f_auto') : null
          const displayTitle = book?.title ?? (edition as any).bookBoxCompany?.name ?? 'Edition'
          return (
            <Link
              key={`${editionId}-${ed.itemId ?? 'standalone'}`}
              href={`/editions/${edition.slug}`}
              className="group bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-amber-500/30 transition-colors"
            >
              {coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverSrc} alt={displayTitle} className="w-full aspect-[2/3] object-cover" />
              ) : (
                <div
                  className="w-full aspect-[2/3] relative flex items-center justify-center overflow-hidden"
                  style={brandGradientStyle((edition as any).bookBoxCompany?.brandColors ?? sale.company?.brandColors)}
                >
                  <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle((edition as any).bookBoxCompany?.brandColors ?? sale.company?.brandColors)} />
                  <p className="relative z-10 font-serif font-semibold text-center px-2 text-xs text-stone-200 leading-snug line-clamp-4">{displayTitle}</p>
                </div>
              )}
              <div className="p-3">
                <p className="text-stone-200 text-sm font-medium leading-tight line-clamp-2">{displayTitle}</p>
                {authors.length > 0 && (
                  <p className="text-stone-500 text-xs mt-1 line-clamp-1">
                    {(authors as any[]).map((a: any) => (a.author ?? a).name).join(', ')}
                  </p>
                )}
              </div>
            </Link>
          )
        }

        const hasGroups = grouped.size > 0
        const totalCount = editions.length

        return (
          <section className="space-y-8">
            <h2 className="text-2xl font-serif font-semibold text-stone-100">
              Included Editions
              <span className="ml-2 text-base font-sans font-normal text-stone-500">({totalCount})</span>
            </h2>

            {/* Groups */}
            {hasGroups && [...items].sort((a, b) => a.sortOrder - b.sortOrder).map(item => {
              const groupEditions = grouped.get(item.id) ?? []
              if (groupEditions.length === 0) return null
              return (
                <div key={item.id}>
                  {item.name && (
                    <h3 className="text-base font-semibold text-stone-300 mb-4 flex items-center gap-2">
                      <span className="h-px flex-1 bg-stone-800" />
                      <span>{item.name}</span>
                      <span className="h-px flex-1 bg-stone-800" />
                    </h3>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {groupEditions.map(renderEditionCard)}
                  </div>
                </div>
              )
            })}

            {/* Standalone / ungrouped */}
            {standalone.length > 0 && (
              <div>
                {hasGroups && (
                  <h3 className="text-base font-semibold text-stone-300 mb-4 flex items-center gap-2">
                    <span className="h-px flex-1 bg-stone-800" />
                    <span>Also available standalone</span>
                    <span className="h-px flex-1 bg-stone-800" />
                  </h3>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {standalone.map(renderEditionCard)}
                </div>
              </div>
            )}
          </section>
        )
      })()}
    </div>
  )
}
