const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''

export function cloudinaryUrl(
  publicId: string | null | undefined,
  transforms = 'w_400,c_fill,q_auto,f_auto',
): string | null {
  if (!publicId) return null
  return `https://res.cloudinary.com/${CLOUD}/image/upload/${transforms}/${publicId}`
}
