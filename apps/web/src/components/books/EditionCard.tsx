import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'

interface EditionCardProps {
  href: string
  coverImage: string | null
  companyName?: string | null
  seriesName?: string | null
  volumeNumber?: number | null
  title: string
  authors?: Array<{ name: string }>
  unverified?: boolean
  /** Rendered inside the image area (e.g. hover action buttons overlay) */
  imageActions?: React.ReactNode
  /** Rendered below authors */
  footer?: React.ReactNode
}

export function EditionCard({
  href,
  coverImage,
  companyName,
  seriesName,
  volumeNumber,
  title,
  authors,
  unverified,
  imageActions,
  footer,
}: EditionCardProps) {
  const cover = cloudinaryUrl(coverImage, 'w_400,h_600,c_fill,q_auto,f_auto')

  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl bg-stone-900 border hover:border-amber-700/60 transition-all hover:shadow-xl hover:shadow-amber-900/10 ${
        unverified ? 'border-amber-800/50' : 'border-stone-800'
      }`}
    >
      <div className="relative aspect-[2/3] bg-stone-800 overflow-hidden rounded-t-2xl">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-600">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}

        {unverified && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-700/50">
            <span className="text-[9px] text-amber-500 font-serif uppercase tracking-wide">Pending</span>
          </div>
        )}

        {/* Bottom ribbon — book box company name */}
        {companyName && (
          <div
            className="absolute bottom-0 left-0 right-0 px-2 py-2 text-center"
            style={{ background: 'rgba(5,10,18,0.88)', borderTop: '1px solid rgba(200,180,140,0.2)' }}
          >
            <span
              className="font-serif font-semibold uppercase tracking-widest leading-none line-clamp-1 text-white"
              style={{ fontSize: '10px', letterSpacing: '0.12em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
            >
              {companyName}
            </span>
          </div>
        )}

        {imageActions}
      </div>

      <div className="p-3 flex flex-col flex-1">
        <div className="flex-1 flex flex-col gap-1">
          {seriesName && (
            <p className="text-[11px] text-amber-600 font-medium tracking-wide truncate">
              {seriesName}{volumeNumber != null ? ` #${volumeNumber}` : ''}
            </p>
          )}
          <p className="font-serif font-semibold text-stone-100 text-sm leading-snug line-clamp-2 group-hover:text-amber-400 transition-colors">
            {title}
          </p>
          {authors && authors.length > 0 && (
            <p className="text-[11px] text-stone-500 truncate">
              {authors.map(a => a.name).join(', ')}
            </p>
          )}
        </div>
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    </Link>
  )
}
