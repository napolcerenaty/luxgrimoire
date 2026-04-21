import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { BookCard } from '@/components/books/BookCard'
import type { ApiAuthor, ApiBook } from '@luxgrimoire/shared-types'

interface ApiAuthorDetail extends ApiAuthor {
  books?: ApiBook[]
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const author = await apiFetch<ApiAuthorDetail>(`/authors/${slug}`)
    return {
      title: author.name,
      description: author.bio ?? `Books by ${author.name} on LuxGrimoire`,
      openGraph: {
        title: author.name,
        description: author.bio ?? undefined,
      },
    }
  } catch {
    return { title: 'Author not found' }
  }
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params

  let author: ApiAuthorDetail
  try {
    author = await apiFetch<ApiAuthorDetail>(`/authors/${slug}`)
  } catch {
    notFound()
  }

  const photoUrl = cloudinaryUrl(author.photoUrl, 'w_400,h_400,c_fill,q_auto,f_auto')
  const books = author.books ?? []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: author.name,
    description: author.bio,
    ...(photoUrl ? { image: photoUrl } : {}),
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Author header */}
      <div className="flex flex-col sm:flex-row gap-8 items-start mb-12">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={author.name}
            className="w-32 h-32 rounded-full object-cover shadow-lg ring-2 ring-amber-700/30 shrink-0"
          />
        )}
        <div>
          <p className="text-xs text-amber-600 uppercase tracking-widest mb-2 font-medium">Author</p>
          <h1 className="text-4xl font-serif font-bold text-stone-100 mb-4">{author.name}</h1>
          {author.bio && (
            <p className="text-stone-300 leading-relaxed max-w-2xl">{author.bio}</p>
          )}
        </div>
      </div>

      {/* Books */}
      {books.length > 0 && (
        <section>
          <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">
            Books by {author.name}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {books.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
