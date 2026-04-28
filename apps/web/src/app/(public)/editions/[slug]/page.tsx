import type { Metadata } from 'next'
import Link from 'next/link'
import { Fragment } from 'react'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import { ImageCarousel } from '@/components/ui/ImageCarousel'
import { WishlistButton } from '@/components/books/WishlistButton'
import type { ApiAuthor, ApiArtist } from '@luxgrimoire/shared-types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface EditionMonthBook {
  month: {
    id: string; year: number; month: number; theme: string | null
    subscription: { id: string; slug: string; name: string }
    series: { id: string; slug: string; name: string } | null
  }
}

interface EditionSaleEdition {
  announcement: { id: string; title: string; isBundle: boolean }
}

interface EditionArtist {
  artist: ApiArtist
  role: string
  artistName: string | null
}

interface EditionDetail {
  id: string
  slug: string
  bookId: string
  editionName: string | null
  bookBoxCompanyCustomName: string | null
  bookBoxCompanyId?: string | null
  publisher: string | null
  coverImage: string | null
  additionalImages: string[]
  isSpecial: boolean
  language?: string | null
  basePrice?: string | null
  currency?: string | null
  features?: string[]
  firstAccessDate?: string | null
  earlyAccessDate?: string | null
  generalSaleDate?: string | null
  verifiedAt: string | null
  submittedByUserId: string | null
  alternativeTitle?: string | null
  notes?: string | null
  subscriptionId?: string | null
  subscriptionMonthId?: string | null
  artists: EditionArtist[]
  monthBooks?: EditionMonthBook[]
  saleEditions?: EditionSaleEdition[]
  bookBoxCompany?: { id: string; slug: string; name: string; logoUrl: string | null } | null
  collection?: { id: string; slug: string; name: string; coverImage: string | null } | null
  book?: {
    id: string; slug: string; title: string; altTitle: string | null
    coverImage: string | null; seriesName: string | null; volumeNumber: number | null
    description: string | null; language: string; genres: string[]
    authors: ApiAuthor[]
  } | null
}

interface Props { params: Promise<{ slug: string }> }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const edition = await apiFetch<EditionDetail>(`/editions/${slug}`)
    const book = edition.book
    const title = [edition.editionName ?? edition.bookBoxCompany?.name, book?.title].filter(Boolean).join(' · ')
    const coverUrl = cloudinaryUrl(edition.coverImage ?? book?.coverImage ?? null, 'w_800,c_fill,q_auto,f_auto')
    return {
      title: title || 'Edition',
      description: book?.description ?? undefined,
      openGraph: {
        title: title || 'Edition',
        description: book?.description ?? undefined,
        images: coverUrl ? [coverUrl] : [],
      },
    }
  } catch {
    return { title: 'Edition not found' }
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EditionPage({ params }: Props) {
  const { slug } = await params

  let edition: EditionDetail
  try {
    edition = await apiFetch<EditionDetail>(`/editions/${slug}`)
  } catch {
    notFound()
  }

  const book = edition.book
  const features = Array.isArray(edition.features) ? edition.features : []
  const artists = edition.artists ?? []
  // Only show editionLabel if it's a custom name distinct from the company name
  const editionLabel = edition.editionName ?? edition.bookBoxCompanyCustomName ?? null
  const monthBooks = edition.monthBooks ?? []
  const saleEditions = edition.saleEditions ?? []
  const bundles = saleEditions.filter(se => se.announcement.isBundle)

  // Build all carousel images: cover first, then additional
  const allImages: string[] = []
  const allLightboxImages: string[] = []
  const additionalSources = Array.isArray(edition.additionalImages) ? edition.additionalImages : []
  const coverSrc = edition.coverImage ?? book?.coverImage ?? null

  const coverUrl = cloudinaryUrl(coverSrc, 'w_600,c_fill,q_auto,f_auto')
  if (coverUrl) allImages.push(coverUrl)
  const coverUrlFull = cloudinaryUrl(coverSrc, 'w_1600,q_auto,f_auto')
  if (coverUrlFull) allLightboxImages.push(coverUrlFull)

  for (const img of additionalSources) {
    const url = cloudinaryUrl(img, 'w_600,c_fill,q_auto,f_auto')
    if (url) allImages.push(url)
    const urlFull = cloudinaryUrl(img, 'w_1600,q_auto,f_auto')
    if (urlFull) allLightboxImages.push(urlFull)
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book?.title,
    description: book?.description,
    inLanguage: edition.language ?? book?.language,
    ...(coverUrl ? { image: coverUrl } : {}),
  }

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-stone-800 bg-gradient-to-b from-stone-950 to-stone-900">
        <div className="container mx-auto px-4 py-10 max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-10 items-start">

            {/* ── Left: Company name + Carousel ── */}
            <div className="flex flex-col items-center md:items-start gap-3">
              {/* Book box company name above carousel */}
              {edition.bookBoxCompany && (
                <Link
                  href={`/companies/${edition.bookBoxCompany.slug}`}
                  className="text-center md:text-left w-full font-serif font-semibold uppercase tracking-widest text-stone-300 hover:text-amber-400 transition-colors text-base leading-snug"
                >
                  {edition.bookBoxCompany.name}
                </Link>
              )}

              {allImages.length > 0 ? (
                <ImageCarousel images={allImages} lightboxImages={allLightboxImages} alt={book?.title ?? 'Edition'} />
              ) : (
                <div className="w-full aspect-[2/3] rounded-xl bg-stone-800 flex items-center justify-center text-stone-600 ring-1 ring-stone-700/50">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
              )}
            </div>

            {/* ── Right: Info ── */}
            <div>
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-sm text-stone-500 mb-4 flex-wrap">
                <Link href="/books" className="hover:text-amber-400 transition-colors">Books</Link>
                <span>›</span>
                {book && (
                  <>
                    <Link href={`/books/${book.slug}`} className="hover:text-amber-400 transition-colors">
                      {book.title}
                    </Link>
                    <span>›</span>
                  </>
                )}
                <span className="text-stone-400">{editionLabel ?? 'Edition'}</span>
              </div>

              {/* Series */}
              {book?.seriesName && (
                <Link
                  href={`/books?series=${encodeURIComponent(book.seriesName)}`}
                  className="inline-block text-sm text-amber-500 hover:text-amber-400 mb-2 font-medium transition-colors hover:underline"
                >
                  {book.seriesName}{book.volumeNumber != null ? ` #${book.volumeNumber}` : ''}
                </Link>
              )}

              {/* Title */}
              {book && (
                <Link href={`/books/${book.slug}`} className="group">
                  <h1 className="text-4xl font-serif font-bold text-stone-100 mb-1 leading-tight group-hover:text-amber-400 transition-colors">
                    {book.title}
                  </h1>
                </Link>
              )}

              {/* Authors — directly below title */}
              {book?.authors && book.authors.length > 0 && (
                <p className="text-stone-400 text-sm mb-3">
                  by{' '}
                  {book.authors.map((author, i) => (
                    <span key={author.id}>
                      {i > 0 && ', '}
                      <Link href={`/authors/${author.slug}`} className="text-stone-300 hover:text-amber-400 hover:underline transition-colors">
                        {author.name}
                      </Link>
                    </span>
                  ))}
                </p>
              )}

              {/* Edition label — only if it's a custom name (not just company name) */}
              {editionLabel && editionLabel !== edition.bookBoxCompany?.name && (
                <p className="text-lg text-amber-500/90 font-medium mb-2">{editionLabel}</p>
              )}
              {edition.alternativeTitle && (
                <p className="text-stone-400 text-sm italic mb-3">{edition.alternativeTitle}</p>
              )}

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {!edition.verifiedAt && (
                  <Badge variant="warning">Pending verification</Badge>
                )}
                {edition.isSpecial && (
                  <Badge variant="default">Special Edition</Badge>
                )}
              </div>

              {/* Wishlist action */}
              <div className="mb-6">
                <WishlistButton editionId={edition.id} />
              </div>

              {/* Meta grid */}
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
                {edition.publisher && (
                  <>
                    <dt className="text-stone-500">Publisher</dt>
                    <dd className="text-stone-200">{edition.publisher}</dd>
                  </>
                )}
                {edition.collection && (
                  <>
                    <dt className="text-stone-500">Collection</dt>
                    <dd>
                      <Link href={`/collections/${edition.collection.slug}`} className="text-amber-400 hover:underline">
                        {edition.collection.name}
                      </Link>
                    </dd>
                  </>
                )}
                {edition.basePrice && (
                  <>
                    <dt className="text-stone-500">Price</dt>
                    <dd className="text-stone-200">{edition.basePrice} {edition.currency ?? ''}</dd>
                  </>
                )}
                {edition.language && (
                  <>
                    <dt className="text-stone-500">Language</dt>
                    <dd className="text-stone-200">{edition.language.charAt(0).toUpperCase() + edition.language.slice(1).toLowerCase()}</dd>
                  </>
                )}
                {edition.firstAccessDate && (
                  <>
                    <dt className="text-stone-500">First Access</dt>
                    <dd className="text-stone-200">{formatDate(edition.firstAccessDate)}</dd>
                  </>
                )}
                {edition.earlyAccessDate && (
                  <>
                    <dt className="text-stone-500">Early Access</dt>
                    <dd className="text-stone-200">{formatDate(edition.earlyAccessDate)}</dd>
                  </>
                )}
                {edition.generalSaleDate && (
                  <>
                    <dt className="text-stone-500">Sale Date</dt>
                    <dd className="text-stone-200">{formatDate(edition.generalSaleDate)}</dd>
                  </>
                )}
                {/* Subscription info */}
                {monthBooks.map((mb) => (
                  <Fragment key={mb.month.id}>
                    <dt className="text-stone-500">Subscription</dt>
                    <dd>
                      <Link
                        href={`/subscriptions/${mb.month.subscription.slug}`}
                        className="text-amber-400 hover:underline"
                      >
                        {mb.month.subscription.name}
                      </Link>
                      {mb.month.series && (
                        <span className="text-stone-400 ml-1">· {mb.month.series.name}</span>
                      )}
                      <span className="text-stone-500 ml-1 text-xs">
                        {new Date(mb.month.year, mb.month.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        {mb.month.theme ? ` · ${mb.month.theme}` : ''}
                      </span>
                    </dd>
                  </Fragment>
                ))}
                {/* Bundle info */}
                {bundles.map((se) => (
                  <Fragment key={se.announcement.id}>
                    <dt className="text-stone-500">Bundle</dt>
                    <dd>
                      <Link
                        href={`/sale-announcements?bundle=${se.announcement.id}`}
                        className="text-amber-400 hover:underline"
                      >
                        {se.announcement.title}
                      </Link>
                    </dd>
                  </Fragment>
                ))}
              </dl>

              {/* Notes */}
              {edition.notes && (
                <p className="mt-4 text-stone-400 text-sm leading-relaxed">{edition.notes}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-5xl space-y-12">

        {/* ── Features ─────────────────────────────────────────────────────── */}
        {features.length > 0 && (
          <section>
            <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">What&apos;s Included</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-stone-300">
                  <span className="text-amber-500 mt-0.5 shrink-0">✦</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Artists ──────────────────────────────────────────────────────── */}
        {artists.length > 0 && (
          <section>
            <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">Artists</h2>
            <div className="flex flex-wrap gap-4">
              {Object.values(
                artists.reduce<Record<string, { artist: EditionArtist['artist']; roles: string[] }>>((acc, c) => {
                  if (!acc[c.artist.id]) acc[c.artist.id] = { artist: c.artist, roles: [] }
                  acc[c.artist.id].roles.push(c.role)
                  return acc
                }, {})
              ).map(({ artist, roles }) => {
                const cleanName = artist.name.startsWith('@') ? artist.name.slice(1) : artist.name
                const photoUrl = cloudinaryUrl(artist.photoUrl ?? null, 'w_64,h_64,c_fill,q_auto,f_auto')
                return (
                  <Link
                    key={artist.id}
                    href={`/artists/${artist.slug}`}
                    className="flex items-center gap-3 group"
                  >
                    {/* Avatar */}
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl}
                        alt={cleanName}
                        className="w-10 h-10 rounded-full object-cover ring-1 ring-stone-700 group-hover:ring-amber-500/50 transition-all shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center text-stone-400 font-serif text-base shrink-0 ring-1 ring-stone-700 group-hover:ring-amber-500/50 transition-all">
                        {cleanName[0]?.toUpperCase()}
                      </div>
                    )}

                    {/* Name + roles */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-200 group-hover:text-amber-400 transition-colors leading-tight truncate max-w-[160px]">
                        {cleanName}
                      </p>
                      {roles.map((r) => (
                          <p key={r} className="text-sm text-stone-400">{r}</p>
                        ))}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Back link ────────────────────────────────────────────────────── */}
        {book && (
          <div>
            <Link
              href={`/books/${book.slug}`}
              className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-amber-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              All editions of &quot;{book.title}&quot;
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
