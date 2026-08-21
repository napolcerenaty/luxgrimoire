export interface PhotoCredit {
  handle: string
  role: string | null
}

/** Normalizes a book box company's raw `instagram` field — which admins enter inconsistently
 *  as either a bare handle or a full profile URL — down to a bare lowercase handle (no `@`,
 *  no URL, no trailing slash/query string). Returns null for anything empty/unparseable. */
export function normalizeInstagramHandle(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const withoutUrl = trimmed.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
  const handle = withoutUrl.replace(/^@/, '').split(/[/?]/)[0].toLowerCase()
  return handle || null
}

/** Parses free-text photoCredit ("@handle1 (role1), @handle2") into individual entries. */
export function parsePhotoCredits(photoCredit: string | null | undefined): PhotoCredit[] {
  if (!photoCredit) return []
  const credits: PhotoCredit[] = []
  const regex = /@([\w.]+)(?:\s*\(([^)]+)\))?/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(photoCredit)) !== null) {
    credits.push({ handle: m[1], role: m[2] ?? null })
  }
  return credits
}

/** Merges the manually-entered photoCredit text with the book box company's own Instagram
 *  handle, so admins no longer have to type the company's own handle by hand on editions/sales
 *  with no dedicated photographer or artist. Dedupes case-insensitively against handles already
 *  present in photoCredit — some entries already have the company handle typed in manually from
 *  before this existed, and this must not show it twice. */
export function buildPhotoCredits(
  photoCredit: string | null | undefined,
  companyInstagram: string | null | undefined,
): PhotoCredit[] {
  const credits = parsePhotoCredits(photoCredit)
  const companyHandle = normalizeInstagramHandle(companyInstagram)
  if (companyHandle && !credits.some(c => c.handle.toLowerCase() === companyHandle)) {
    credits.push({ handle: companyHandle, role: null })
  }
  return credits
}
