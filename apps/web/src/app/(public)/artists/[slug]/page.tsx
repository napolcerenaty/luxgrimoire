import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import type { ApiArtist, ApiBookEdition, ApiBook } from '@luxgrimoire/shared-types'

interface ArtistEditionContribution {
  edition: ApiBookEdition & { book?: ApiBook }
  book: ApiBook
  role: string
}

interface ApiArtistDetail extends ApiArtist {
  editions?: ArtistEditionContribution[]
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const artist = await apiFetch<ApiArtistDetail>(`/artists/${slug}`)
    return {
      title: artist.name,
      description: artist.bio ?? `Artwork and illustrations by ${artist.name}`,
      openGraph: {
        title: artist.name,
        description: artist.bio ?? undefined,
      },
    }
  } catch {
    return { title: 'Artist not found' }
  }
}

export default async function ArtistPage({ params }: Props) {
  const { slug } = await params

  let artist: ApiArtistDetail
  try {
    artist = await apiFetch<ApiArtistDetail>(`/artists/${slug}`)
  } catch {
    notFound()
  }

  const photoUrl = cloudinaryUrl(artist.photoUrl, 'w_400,h_400,c_fill,q_auto,f_auto')
  const contributions = artist.editions ?? []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: artist.name,
    description: artist.bio,
    ...(photoUrl ? { image: photoUrl } : {}),
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Artist header */}
      <div className="flex flex-col sm:flex-row gap-8 items-start mb-12">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={artist.name}
            className="w-32 h-32 rounded-full object-cover shadow-lg ring-2 ring-amber-700/30 shrink-0"
          />
        )}
        <div>
          <p className="text-xs text-amber-600 uppercase tracking-widest mb-2 font-medium">Artist</p>
          <h1 className="text-4xl font-serif font-bold text-stone-100 mb-4">{artist.name}</h1>
          {artist.bio && (
            <p className="text-stone-300 leading-relaxed max-w-2xl">{artist.bio}</p>
          )}
        </div>
      </div>

      {/* Edition contributions */}
      {contributions.length > 0 && (
        <section>
          <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">
            Editions Illustrated
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {contributions.map((contribution) => {
              const editionCover = cloudinaryUrl(
                contribution.edition.coverImage,
                'w_300,c_fill,q_auto,f_auto',
              )
              return (
                <Link
                  key={contribution.edition.id}
                  href={`/books/${contribution.book.slug}`}
                  className="flex gap-4 p-4 rounded-xl bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors group"
                >
                  {editionCover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editionCover}
                      alt={contribution.book.title}
                      className="w-16 h-24 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-serif font-semibold text-stone-100 group-hover:text-amber-400 transition-colors line-clamp-2">
                      {contribution.book.title}
                    </p>
                    {contribution.edition.publisher && (
                      <p className="text-xs text-stone-400 mt-1">{contribution.edition.publisher}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {contribution.role && (
                        <Badge variant="outline">{contribution.role}</Badge>
                      )}
                      {contribution.edition.isSpecial && (
                        <Badge variant="warning">Special</Badge>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
