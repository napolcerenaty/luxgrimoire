const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

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

/**
 * Reads a file as a data URI, then POSTs it to the API upload endpoint.
 * Returns the Cloudinary publicId on success.
 */
export async function uploadImage(file: File, folder: string): Promise<string> {
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const res = await fetch(`${API_BASE}/upload/image`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: dataUri, folder }),
  })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json() as { publicId: string; url: string }
  return json.publicId
}

