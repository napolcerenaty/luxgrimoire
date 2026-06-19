import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
import type { ApiTrendingSaleAnnouncement } from '@luxgrimoire/shared-types'

interface Props {
  announcements: ApiTrendingSaleAnnouncement[]
}

function formatSaleDate(dateStr: string | null) {
  if (!dateStr) return 'Date TBA'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

export function HomeTrendingSales({ announcements }: Props) {
  if (announcements.length === 0) return null

  return (
    <section className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-serif font-semibold text-stone-100 tracking-wide sm:tracking-widest">
          Trending Sales ⚡
        </h2>
        <p className="text-sm text-stone-400">Most followed upcoming sales</p>
      </div>

      <div
        className="flex gap-4 overflow-x-auto scroll-smooth pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {announcements.map((sale) => {
          const firstEdition = sale.editions?.[0]?.edition
          const raw = sale.imageUrl ?? firstEdition?.additionalImages?.[0] ?? null
          const imgUrl = raw ? cloudinaryUrl(raw, 'w_320,h_480,c_fill,q_auto,f_auto') : null
          const brandColors = sale.company?.brandColors ?? firstEdition?.bookBoxCompany?.brandColors ?? null

          return (
            <Link
              key={sale.id}
              href={`/sale-announcements/${sale.id}`}
              className="group w-44 flex-shrink-0 overflow-hidden rounded-lg border border-stone-700 text-left transition-all duration-250 hover:border-amber-600/60"
              style={{ background: 'var(--bg-raised)' }}
            >
              <div className="relative w-full overflow-hidden" style={{ aspectRatio: '2/3', background: 'var(--bg-surface)' }}>
                {imgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imgUrl}
                    alt={sale.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="relative flex h-full w-full items-center justify-center">
                    <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(brandColors)} />
                    <span className="relative z-10 px-3 text-center font-serif text-xs leading-snug text-stone-300/80 line-clamp-4">
                      {sale.title}
                    </span>
                  </div>
                )}

                <span className="absolute right-1.5 top-1.5 rounded-full bg-stone-800/90 px-1.5 py-0.5 text-[9px] font-bold leading-tight text-stone-300 border border-stone-600">
                  {sale.interestCount} follows
                </span>

                {sale.company?.name && (
                  <div
                    className="absolute bottom-0 left-0 right-0 px-2 py-2 text-center"
                    style={{ background: 'rgba(5,10,18,0.88)', borderTop: '1px solid rgba(200,180,140,0.2)' }}
                  >
                    <span
                      className="line-clamp-1 font-serif font-semibold uppercase leading-none text-white"
                      style={{ fontSize: '10px', letterSpacing: '0.12em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
                    >
                      {sale.company.name}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col px-2.5 pb-2 pt-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600">
                  {formatSaleDate(sale.generalSaleDate)}
                </p>
                <div className="my-0.5 h-[2.25rem] overflow-hidden">
                  <p className="line-clamp-2 text-sm font-serif font-semibold leading-snug text-stone-200 transition-colors group-hover:text-amber-400">
                    {sale.title}
                  </p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
