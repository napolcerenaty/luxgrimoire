import Link from 'next/link'

interface ArtistLinkProps {
  artist: { name: string; slug: string }
  className?: string
  /** Show @ prefix (default true) */
  atPrefix?: boolean
}

export function ArtistLink({ artist, className = '', atPrefix = true }: ArtistLinkProps) {
  // Names may be stored with a leading @ already — strip it before adding prefix
  const cleanName = artist.name.startsWith('@') ? artist.name.slice(1) : artist.name
  return (
    <Link
      href={`/artists/${artist.slug}`}
      className={`text-brand-500 hover:text-brand-300 hover:underline font-medium transition-colors ${className}`}
    >
      {atPrefix ? `@${cleanName}` : cleanName}
    </Link>
  )
}
