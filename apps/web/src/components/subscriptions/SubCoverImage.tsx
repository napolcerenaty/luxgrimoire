import { brandGradientStyle, brandTextClasses } from '@/lib/brandGradient'

interface Props {
  coverUrl: string | null
  name: string
  brandColors?: string[] | null
  aspectClass?: string
  hoverScale?: boolean
}

export function SubCoverImage({ coverUrl, name, brandColors, aspectClass = 'aspect-square', hoverScale = true }: Props) {
  const tc = brandTextClasses(brandColors)
  return (
    <div className={`${aspectClass} relative overflow-hidden bg-stone-950 flex items-center justify-center`}>
      {coverUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt={name} className={`relative z-10 max-w-full max-h-full object-contain ${hoverScale ? 'group-hover:scale-105 transition-transform duration-300' : ''}`} />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center px-4" style={brandGradientStyle(brandColors)}>
          <span className={`font-serif text-lg text-center leading-snug ${tc.primary}`}>{name.toUpperCase()}</span>
        </div>
      )}
    </div>
  )
}
