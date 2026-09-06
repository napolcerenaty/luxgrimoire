import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'
import { ImageCarousel } from '@/components/ui/ImageCarousel'
import { brandGradientStyle } from '@/lib/brandGradient'
import { SaleAnnouncementContent } from '@/components/sales/SaleAnnouncementContent'
import { ExternalLink } from 'lucide-react'
import { buildPhotoCredits } from '@/lib/photoCredit'

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

  const extraImages: string[] = Array.isArray(sale.extraImagesJson) ? sale.extraImagesJson : []
  const carouselImages = [
    ...(sale.imageUrl ? [cloudinaryUrl(sale.imageUrl, 'w_560,q_auto,f_auto')!] : []),
    ...extraImages.map(img => cloudinaryUrl(img, 'w_560,q_auto,f_auto')!).filter(Boolean),
  ]

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-10 mb-12">
        {/* Image(s) */}
        <div>
          {/* Company name above the image — links to the company page (same as the edition view) */}
          {sale.company?.slug && (
            <Link
              href={`/companies/${sale.company.slug}`}
              className="block mb-3 text-center md:text-left font-serif font-semibold uppercase tracking-widest text-navy-300 hover:text-brand-400 transition-colors text-base leading-snug"
            >
              {sale.company.name}
            </Link>
          )}

          {carouselImages.length > 0 ? (
            <ImageCarousel images={carouselImages} alt={sale.title} />
          ) : (
            <div
              className="w-full aspect-[2/3] rounded-xl flex items-center justify-center relative overflow-hidden"
              style={brandGradientStyle(sale.company?.brandColors)}
            >
              <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(sale.company?.brandColors)} />
              <p className="relative z-10 font-serif font-semibold text-center px-4 text-navy-200 leading-snug line-clamp-5">
                {sale.title}
              </p>
            </div>
          )}
          {(() => {
            // Only auto-credit the company's IG handle when we're showing its own official
            // sale images and it has granted permission to use them.
            const hasOfficialPhotos = carouselImages.length > 0 && !!sale.company?.hasOfficialImagePermission
            const credits = buildPhotoCredits(sale.photoCredit, hasOfficialPhotos ? sale.company?.instagram : null)
            const website = hasOfficialPhotos ? sale.company?.website : null
            if (credits.length === 0 && !website) return null
            return (
              <div className="text-xs text-navy-500 mt-2 text-center leading-5">
                {credits.length > 0 && (
                  <>
                    <span>📷 photo by</span>
                    {credits.map(({ handle, role }) => (
                      <div key={handle}>
                        <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand-600 hover:text-brand-400 transition-colors">
                          @{handle}<ExternalLink size={10} className="shrink-0" />
                        </a>
                        {role && <span className="text-navy-600"> ({role})</span>}
                      </div>
                    ))}
                  </>
                )}
                {website && (
                  <div>
                    courtesy of{' '}
                    <a href={website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand-600 hover:text-brand-400 transition-colors">
                      {sale.company!.name}<ExternalLink size={10} className="shrink-0" />
                    </a>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Info */}
        <SaleAnnouncementContent sale={sale} showPageLink={false} />
      </div>
    </div>
  )
}
