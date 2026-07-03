import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'
import { ImageCarousel } from '@/components/ui/ImageCarousel'
import { brandGradientStyle } from '@/lib/brandGradient'
import { SaleAnnouncementContent } from '@/components/sales/SaleAnnouncementContent'

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
                <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer" className="hover:text-amber-400 transition-colors">
                  @{handle}
                </a>
              </p>
            )
          })()}
        </div>

        {/* Info */}
        <SaleAnnouncementContent sale={sale} showPageLink={false} />
      </div>
    </div>
  )
}
