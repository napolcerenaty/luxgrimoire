import type { Metadata } from 'next'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiSaleAnnouncement, PaginatedResponse } from '@luxgrimoire/shared-types'
import { Megaphone } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Upcoming Sales & Announcements | LuxGrimoire',
  description: 'Browse all upcoming book box sale announcements and limited edition drops.',
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function SaleAnnouncementsPage() {
  const res = await apiFetch<PaginatedResponse<ApiSaleAnnouncement>>(
    '/announcements?upcoming=true&pageSize=50'
  ).catch(() => null)

  const announcements = res?.data ?? []

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Megaphone size={24} className="text-amber-400" />
          <h1 className="text-3xl font-serif font-bold text-stone-100">Upcoming Sales</h1>
        </div>
        <Link
          href="/sale-announcement-requests"
          className="text-xs text-amber-500 hover:text-amber-400 border border-stone-700 hover:border-amber-700 px-3 py-1.5 rounded-full transition-colors font-serif"
        >
          + Report a sale
        </Link>
      </div>

      {announcements.length === 0 ? (
        <div className="text-center py-20 text-stone-500">
          <Megaphone size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">No upcoming sales at the moment.</p>
          <p className="text-sm mt-2">
            Spotted one?{' '}
            <Link href="/sale-announcement-requests" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">
              Let us know!
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {announcements.map((a) => {
            const firstEdition = a.editions?.[0]?.edition
            const cover = firstEdition?.coverImage ?? a.imageUrl ?? null
            const imgUrl = cover
              ? cloudinaryUrl(cover, 'w_400,h_300,c_fill,q_auto,f_auto')
              : null
            const saleDate = formatDate(a.generalSaleDate)

            return (
              <Link
                key={a.id}
                href={`/sale-announcements/${a.id}`}
                className="group flex flex-col rounded-xl border border-stone-700 hover:border-amber-600/60 overflow-hidden transition-all"
                style={{ background: 'var(--bg-raised)' }}
              >
                {/* Cover image */}
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4/3', background: 'var(--bg-surface)' }}>
                  {imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imgUrl}
                      alt={a.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Megaphone size={32} className="text-amber-700/40" />
                    </div>
                  )}
                  {a.isBundle && (
                    <span className="absolute top-2 left-2 text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-900/80 border border-stone-600 text-amber-400">
                      Bundle
                    </span>
                  )}
                  {a.availableForPurchase && (
                    <span className="absolute top-2 right-2 text-[9px] font-serif uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-900/80 border border-green-700 text-green-400">
                      Live
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="px-4 py-3 flex flex-col gap-1">
                  <p className="text-sm font-serif font-semibold text-stone-200 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">
                    {a.title}
                  </p>
                  {saleDate && (
                    <p className="text-xs text-amber-500 font-sans">🗓 {saleDate}</p>
                  )}
                  {a.basePrice != null && a.currency && (
                    <p className="text-xs text-stone-400">
                      from {a.basePrice} {a.currency}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Report sale CTA */}
      <div className="mt-12 text-center text-stone-500 text-sm">
        Don&apos;t see a sale you know about?{' '}
        <Link href="/sale-announcement-requests" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">
          Let us know!
        </Link>
      </div>
    </div>
  )
}
