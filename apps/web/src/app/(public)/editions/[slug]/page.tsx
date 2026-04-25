import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import { ArtistLink } from '@/components/ui/ArtistLink'
import type { ApiAuthor, ApiArtist } from '@luxgrimoire/shared-types'

// ─── Types ───────────────────────────────────────────────────────────────────

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
  publishYear: number | null
  format: string | null
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

const ROLE_COLORS: Record<string, string> = {
  cover: 'bg-amber-700/80 text-amber-100',
  illustration: 'bg-violet-700/80 text-violet-100',
  map: 'bg-teal-700/80 text-teal-100',
  typography: 'bg-sky-700/80 text-sky-100',
  design: 'bg-pink-700/80 text-pink-100',
}
function roleColor(role: string) {
  return ROLE_COLORS[role.toLowerCase()] ?? 'bg-stone-700/80 text-stone-100'
}

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
  const coverUrl = cloudinaryUrl(edition.coverImage ?? book?.coverImage ?? null, 'w_600,c_fill,q_auto,f_auto')
  const additionalImages = Array.isArray(edition.additionalImages) ? edition.additionalImages : []
  const features = Array.isArray(edition.features) ? edition.features : []
  const artists = edition.artists ?? []

  const editionLabel = edition.editionName ?? edition.bookBoxCompanyCustomName ?? edition.bookBoxCompany?.name ?? null

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
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-10 items-start">

            {/* Cover */}
            <div className="flex flex-col items-center md:items-start gap-4">
              <div className="relative w-full max-w-[240px]">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt={book?.title ?? 'Edition cover'}
                    className="rounded-xl shadow-2xl w-full object-cover ring-1 ring-stone-700/50"
                  />
                ) : (
                  <div className="w-full aspect-[2/3] rounded-xl bg-stone-800 flex items-center justify-center text-stone-600">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                )}

                {/* Book box company ribbon */}
                {edition.bookBoxCompany && (
                  <div
                    className="absolute bottom-0 left-0 right-0 px-2 py-2 rounded-b-xl text-center"
                    style={{ background: 'rgba(5,10,18,0.88)', borderTop: '1px solid rgba(200,180,140,0.2)' }}
                  >
                    <span
                      className="font-serif font-semibold uppercase tracking-widest leading-none text-white block"
                      style={{ fontSize: '10px', letterSpacing: '0.12em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
                    >
                      {edition.bookBoxCompany.name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
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
                  <span className="ml-1 text-xs text-stone-500">→ series</span>
                </Link>
              )}

              {/* Title */}
              {book && (
                <Link href={`/books/${book.slug}`} className="group">
                  <h1 className="text-4xl font-serif font-bold text-stone-100 mb-2 leading-tight group-hover:text-amber-400 transition-colors">
                    {book.title}
                  </h1>
                </Link>
              )}

              {/* Edition label */}
              {editionLabel && (
                <p className="text-lg text-amber-500/90 font-medium mb-3">{editionLabel}</p>
              )}
              {edition.alternativeTitle && (
                <p className="text-stone-400 text-sm italic mb-3">{edition.alternativeTitle}</p>
              )}

              {/* Authors */}
              {book?.authors && book.authors.length > 0 && (
                <p className="text-stone-300 mb-5">
                  by{' '}
                  {book.authors.map((author, i) => (
                    <span key={author.id}>
                      {i > 0 && ', '}
                      <Link href={`/authors/${author.slug}`} className="text-amber-400 hover:underline">
                        {author.name}
                      </Link>
                    </span>
                  ))}
                </p>
              )}

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-6">
                {!edition.verifiedAt && (
                  <Badge variant="warning">Pending verification</Badge>
                )}
                {edition.isSpecial && (
                  <Badge variant="default">Special Edition</Badge>
                )}
                {edition.format && (
                  <Badge variant="outline">{edition.format}</Badge>
                )}
                {edition.language && (
                  <Badge variant="outline">{edition.language.toUpperCase()}</Badge>
                )}
              </div>

              {/* Meta grid */}
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                {edition.publisher && (
                  <>
                    <dt className="text-stone-500">Publisher</dt>
                    <dd className="text-stone-200 col-span-2 sm:col-span-2">{edition.publisher}</dd>
                  </>
                )}
                {edition.publishYear && (
                  <>
                    <dt className="text-stone-500">Year</dt>
                    <dd className="text-stone-200 col-span-2 sm:col-span-2">{edition.publishYear}</dd>
                  </>
                )}
                {edition.bookBoxCompany && (
                  <>
                    <dt className="text-stone-500">Book Box</dt>
                    <dd className="col-span-2 sm:col-span-2">
                      <Link href={`/companies/${edition.bookBoxCompany.slug}`} className="text-amber-400 hover:underline">
                        {edition.bookBoxCompany.name}
                      </Link>
                    </dd>
                  </>
                )}
                {edition.collection && (
                  <>
                    <dt className="text-stone-500">Collection</dt>
                    <dd className="col-span-2 sm:col-span-2">
                      <Link href={`/collections/${edition.collection.slug}`} className="text-amber-400 hover:underline">
                        {edition.collection.name}
                      </Link>
                    </dd>
                  </>
                )}
                {edition.basePrice && (
                  <>
                    <dt className="text-stone-500">Base Price</dt>
                    <dd className="text-stone-200 col-span-2 sm:col-span-2">
                      {edition.basePrice} {edition.currency ?? ''}
                    </dd>
                  </>
                )}
              </dl>

              {/* Access dates */}
              {(edition.firstAccessDate || edition.earlyAccessDate || edition.generalSaleDate) && (
                <div className="mt-5 space-y-1.5">
                  {edition.firstAccessDate && (
                    <div className="flex gap-3 text-sm">
                      <span className="text-stone-500 w-36 shrink-0">First Access</span>
                      <span className="text-stone-200">{formatDate(edition.firstAccessDate)}</span>
                    </div>
                  )}
                  {edition.earlyAccessDate && (
                    <div className="flex gap-3 text-sm">
                      <span className="text-stone-500 w-36 shrink-0">Early Access</span>
                      <span className="text-stone-200">{formatDate(edition.earlyAccessDate)}</span>
                    </div>
                  )}
                  {edition.generalSaleDate && (
                    <div className="flex gap-3 text-sm">
                      <span className="text-stone-500 w-36 shrink-0">General Sale</span>
                      <span className="text-stone-200">{formatDate(edition.generalSaleDate)}</span>
                    </div>
                  )}
                </div>
              )}

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
            <div className="flex flex-wrap gap-3">
              {artists.map((c) => (
                <div
                  key={c.artist.id}
                  className="flex items-center gap-2.5 bg-stone-900 border border-stone-800 rounded-xl px-4 py-2.5"
                >
                  {c.artist.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cloudinaryUrl(c.artist.photoUrl, 'w_64,h_64,c_fill,q_auto,f_auto') ?? ''}
                      alt={c.artist.name}
                      className="w-8 h-8 rounded-full object-cover ring-1 ring-stone-700"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center text-stone-500 text-sm font-serif">
                      {c.artist.name[0]}
                    </div>
                  )}
                  <div>
                    <ArtistLink artist={c.artist} className="text-sm font-medium text-stone-200 hover:text-amber-400 transition-colors" />
                    <p className={`text-[10px] mt-0.5 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide inline-block ${roleColor(c.role)}`}>
                      {c.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Additional images ────────────────────────────────────────────── */}
        {additionalImages.length > 0 && (
          <section>
            <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">Gallery</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {additionalImages.map((img, i) => {
                const url = cloudinaryUrl(img, 'w_400,c_fill,q_auto,f_auto')
                return url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt={`${book?.title ?? 'Edition'} — image ${i + 1}`}
                    className="rounded-lg object-cover aspect-square w-full ring-1 ring-stone-800 hover:ring-amber-700/40 transition-all"
                  />
                ) : null
              })}
            </div>
          </section>
        )}

        {/* ── Book description (fallback info) ─────────────────────────────── */}
        {book?.description && (
          <section>
            <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">About the Book</h2>
            <p className="text-stone-300 leading-relaxed whitespace-pre-line">{book.description}</p>
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
