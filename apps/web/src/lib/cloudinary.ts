const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''

/**
 * Strips any Cloudinary-injected prefix from a stored publicId.
 * Some records may have been saved with 'image/upload/v{version}/' or even
 * the full URL prefix — normalise to a bare public_id before building URLs.
 */
function normalizePublicId(id: string): string {
  // Full URL: https://res.cloudinary.com/{cloud}/image/upload/...
  let n = id.replace(/^https?:\/\/res\.cloudinary\.com\/[^/]+\//, '')
  // image/upload/v123456/ or image/upload/
  n = n.replace(/^image\/upload\/(v\d+\/)?/, '')
  return n
}

export function cloudinaryUrl(
  publicId: string | null | undefined,
  transforms = 'w_400,c_fill,q_auto,f_auto',
): string | null {
  if (!publicId) return null
  const id = normalizePublicId(publicId)
  return `https://res.cloudinary.com/${CLOUD}/image/upload/${transforms}/${id}`
}
