'use client'
import Image from 'next/image'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle, brandTextClasses } from '@/lib/brandGradient'

interface Props {
  imageSource: string | null
  brandColors?: string[] | null
  name: string
}

export function SubListThumbnail({ imageSource, brandColors, name }: Props) {
  const blurBg = imageSource ? cloudinaryUrl(imageSource, 'w_200,h_200,c_fill,q_auto,f_auto') : null
  const logoThumb = imageSource ? cloudinaryUrl(imageSource, 'w_120,h_120,c_pad,q_auto,f_auto') : null
  const tc = brandTextClasses(brandColors)

  return (
    <div className="relative shrink-0 w-24 self-stretch" style={!blurBg ? brandGradientStyle(brandColors) : undefined}>
      {blurBg && (
        <Image src={blurBg} alt="" fill className="object-cover scale-110 blur-md opacity-50" aria-hidden unoptimized />
      )}
      {!blurBg && <div className="absolute inset-0" style={brandGradientStyle(brandColors)} />}
      <div className="absolute inset-0 flex items-center justify-center p-2">
        {logoThumb ? (
          <Image src={logoThumb} alt={name} fill className="object-contain drop-shadow-md" unoptimized />
        ) : (
          <span className={`text-[10px] font-semibold text-center leading-tight px-1 drop-shadow ${tc.primary}`}>{name.toUpperCase()}</span>
        )}
      </div>
    </div>
  )
}
