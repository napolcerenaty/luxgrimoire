import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import type { ApiArtist, ApiBook, ApiAuthor } from '@luxgrimoire/shared-types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookBoxCompanySnippet {
  id: string; slug: string; name: string; logoUrl: string | null
}

interface EditionSnippet {
  id: string; slug: string; coverImage: string | null; editionName: string | null
  publisher: string | null
  bookBoxCompany: BookBoxCompanySnippet | null
  book: (Pick<ApiBook, 'id' | 'slug' | 'title' | 'seriesName' | 'volumeNumber'> & { authors: ApiAuthor[] }) | null
}

interface Contribution {
  id: string; role: string
  edition: EditionSnippet
}

interface ApiArtistDetail extends ApiArtist {
  contributions: Contribution[]
}

interface Props { params: Promise<{ slug: string }> }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  cover:      'bg-amber-700/80 text-amber-100',
  illustration: 'bg-violet-700/80 text-violet-100',
  map:        'bg-teal-700/80 text-teal-100',
  typography: 'bg-sky-700/80 text-sky-100',
  design:     'bg-pink-700/80 text-pink-100',
}
function roleColor(role: string) {
  return ROLE_COLORS[role.toLowerCase()] ?? 'bg-stone-700/80 text-stone-100'
}

function SocialLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-amber-400 transition-colors border border-stone-700 hover:border-amber-700/60 rounded-full px-3 py-1"
    >
      {icon}
      <span>{label}</span>
    </a>
  )
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const artist = await apiFetch<ApiArtistDetail>(`/artists/${slug}`)
    return {
      title: `@${artist.name} · Artist`,
      description: artist.bio ?? `Artwork and illustrations by @${artist.name}`,
      openGraph: {
        title: `@${artist.name}`,
        description: artist.bio ?? undefined,
        ...(artist.photoUrl ? { images: [cloudinaryUrl(artist.photoUrl, 'w_800,h_800,c_fill,q_auto') ?? ''] } : {}),
      },
    }
  } catch {
    return { title: 'Artist not found' }
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ArtistPage({ params }: Props) {
  const { slug } = await params

  let artist: ApiArtistDetail
  try {
    artist = await apiFetch<ApiArtistDetail>(`/artists/${slug}`)
  } catch {
    notFound()
  }

  const photoUrl = cloudinaryUrl(artist.photoUrl, 'w_600,h_600,c_fill,q_auto,f_auto')
  const contributions = artist.contributions ?? []

  // Build social links list
  const socials: { href: string; label: string; icon: React.ReactNode }[] = []
  if (artist.instagram) socials.push({
    href: `https://instagram.com/${artist.instagram.replace('@', '')}`,
    label: `@${artist.instagram.replace('@', '')}`,
    icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>,
  })
  if (artist.twitter) socials.push({
    href: `https://twitter.com/${artist.twitter.replace('@', '')}`,
    label: `@${artist.twitter.replace('@', '')}`,
    icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.745l7.734-8.835L1.254 2.25H8.08l4.26 5.632 5.905-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  })
  if (artist.tiktok) socials.push({
    href: `https://tiktok.com/@${artist.tiktok.replace('@', '')}`,
    label: `@${artist.tiktok.replace('@', '')}`,
    icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.77a4.85 4.85 0 01-1.01-.08z"/></svg>,
  })
  if (artist.website) socials.push({
    href: artist.website.startsWith('http') ? artist.website : `https://${artist.website}`,
    label: artist.website.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>,
  })
  if (artist.facebook) socials.push({
    href: `https://facebook.com/${artist.facebook.replace('@', '')}`,
    label: artist.facebook,
    icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  })

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Person',
    name: artist.name,
    description: artist.bio,
    ...(photoUrl ? { image: photoUrl } : {}),
  }

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-stone-800 bg-gradient-to-b from-stone-950 to-stone-900">
        <div className="container mx-auto px-4 py-12 max-w-5xl">
          <div className="flex flex-col sm:flex-row gap-8 items-start">
            {/* Photo */}
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={artist.name}
                className="w-36 h-36 sm:w-48 sm:h-48 rounded-2xl object-cover shadow-2xl ring-2 ring-amber-700/40 shrink-0"
              />
            ) : (
              <div className="w-36 h-36 sm:w-48 sm:h-48 rounded-2xl bg-stone-800 flex items-center justify-center shrink-0 text-5xl font-serif text-stone-600">
                {artist.name[0]}
              </div>
            )}

            {/* Info */}
            <div className="flex-1">
              <p className="text-xs text-amber-600 uppercase tracking-widest mb-2 font-medium">Artist</p>
              <h1 className="text-4xl sm:text-5xl font-serif font-bold text-stone-100 leading-tight mb-1">
                {artist.name}
              </h1>
              <p className="text-lg text-amber-500/80 font-mono mb-3">@{artist.name}</p>

              {artist.specialty && (
                <Badge variant="outline" className="mb-4">{artist.specialty}</Badge>
              )}

              {artist.bio && (
                <p className="text-stone-300 leading-relaxed max-w-2xl mb-5">{artist.bio}</p>
              )}

              {/* Social links */}
              {socials.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {socials.map((s) => (
                    <SocialLink key={s.href} href={s.href} label={s.label} icon={s.icon} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Contributions ────────────────────────────────── */}
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        {contributions.length === 0 ? (
          <p className="text-stone-500 text-center py-20 font-serif text-lg">No editions listed yet.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-8">
              <h2 className="text-2xl font-serif font-semibold text-stone-100">Artwork & Contributions</h2>
              <span className="text-sm text-stone-500 bg-stone-800 rounded-full px-3 py-0.5">{contributions.length}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {contributions.map((c) => {
                const cover = cloudinaryUrl(c.edition.coverImage, 'w_400,h_600,c_fill,q_auto,f_auto')
                const book = c.edition.book
                const company = c.edition.bookBoxCompany

                return (
                  <Link
                    key={c.id}
                    href={`/editions/${c.edition.slug}`}
                    className="group flex flex-col rounded-2xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/60 transition-all hover:shadow-xl hover:shadow-amber-900/10"
                  >
                    {/* Cover image with overlays */}
                    <div className="relative aspect-[2/3] bg-stone-800 overflow-hidden">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt={book?.title ?? 'Edition cover'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-600">
                          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                        </div>
                      )}

                      {/* Role badge — top left */}
                      <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide backdrop-blur-sm ${roleColor(c.role)}`}>
                        {c.role}
                      </div>

                      {/* Bottom ribbon — book box company name */}
                      {company && (
                        <div
                          className="absolute bottom-0 left-0 right-0 px-2 py-2 text-center"
                          style={{ background: 'rgba(5,10,18,0.88)', borderTop: '1px solid rgba(200,180,140,0.2)' }}
                        >
                          <span
                            className="font-serif font-semibold uppercase tracking-widest leading-none line-clamp-1 text-white"
                            style={{ fontSize: '10px', letterSpacing: '0.12em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
                          >
                            {company.name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card body */}
                    <div className="p-3 flex flex-col gap-1 flex-1">
                      {/* Series */}
                      {book?.seriesName && (
                        <p className="text-[11px] text-amber-600 font-medium tracking-wide truncate">
                          {book.seriesName}{book.volumeNumber != null ? ` #${book.volumeNumber}` : ''}
                        </p>
                      )}

                      {/* Title */}
                      <p className="font-serif font-semibold text-stone-100 text-sm leading-snug line-clamp-2 group-hover:text-amber-400 transition-colors">
                        {book?.title ?? '—'}
                      </p>

                      {/* Authors */}
                      {book?.authors && book.authors.length > 0 && (
                        <p className="text-[11px] text-stone-500 truncate">
                          {book.authors.map(a => a.name).join(', ')}
                        </p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

