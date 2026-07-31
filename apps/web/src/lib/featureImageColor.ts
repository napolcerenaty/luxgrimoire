import sharp from 'sharp'

// Matches --bg-surface in globals.css (dark theme) — used when a feature image can't be
// fetched/decoded, so the backdrop still looks intentional rather than a jarring fallback color.
const FALLBACK_COLOR = '#070f1c'

// Feature-image banners (blog hero, blog index hero panels) render the image with
// object-contain so nothing gets cropped, then need something to fill the leftover space
// around it when the image's aspect ratio doesn't match the panel. Sampling the image's own
// corner color (rather than a blurred copy of the whole image) gives a seamless edge for
// graphics that have their own solid/gradient background baked in — no blur artifact, and the
// image's background effectively "continues" to fill the panel regardless of crop ratio.
export async function getFeatureImageBackdropColor(imageUrl: string | null | undefined): Promise<string> {
  if (!imageUrl) return FALLBACK_COLOR
  try {
    const res = await fetch(imageUrl, { next: { revalidate: 3600 } })
    if (!res.ok) return FALLBACK_COLOR
    const buffer = Buffer.from(await res.arrayBuffer())
    const image = sharp(buffer)
    const { width, height } = await image.metadata()
    if (!width || !height) return FALLBACK_COLOR

    const cornerSize = Math.max(1, Math.floor(Math.min(width, height) * 0.05))
    const { data } = await image
      .extract({ left: 0, top: 0, width: cornerSize, height: cornerSize })
      .resize(1, 1)
      .raw()
      .toBuffer({ resolveWithObject: true })

    const [r, g, b] = data
    return `rgb(${r}, ${g}, ${b})`
  } catch {
    return FALLBACK_COLOR
  }
}
