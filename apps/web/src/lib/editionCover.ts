import { cloudinaryUrl } from './cloudinary'

type CoverSource = { additionalImages?: string[] | null; communityPhotoCover?: string | null }

/**
 * Returns the raw cover value (Cloudinary public ID or community photo full URL).
 * Use when passing to components that call cloudinaryUrl() internally (e.g. EditionCard).
 */
export function resolveEditionCoverRaw(edition: CoverSource): string | null {
  return edition.additionalImages?.[0] ?? edition.communityPhotoCover ?? null
}

/**
 * Returns a ready-to-use URL for direct use in <img src>.
 * Applies cloudinaryUrl() to the public ID; returns community photo URL as-is.
 */
export function resolveEditionCoverUrl(
  edition: CoverSource,
  transforms = 'w_400,c_fill,q_auto,f_auto',
): string | null {
  if (edition.additionalImages?.[0]) {
    return cloudinaryUrl(edition.additionalImages[0], transforms) ?? null
  }
  return edition.communityPhotoCover ?? null
}
