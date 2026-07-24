import { EditionCarousel, type CarouselCard } from '@/components/ui/EditionCarousel'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { formatVolumeNumbers } from '@/lib/volumeNumbers'
import type { ApiTrendingEdition } from '@luxgrimoire/shared-types'

interface Props {
  editions: ApiTrendingEdition[]
}

export function HomeTrendingEditions({ editions }: Props) {
  if (editions.length === 0) return null

  const cards: CarouselCard[] = editions.map((edition) => ({
    id: edition.id,
    href: `/editions/${edition.slug}`,
    coverImage: resolveEditionCoverRaw(edition),
    title: edition.book?.title ?? 'Unknown',
    subtitle: edition.book?.seriesName
      ? `${edition.book.seriesName}${edition.book.volumeNumbers?.length ? ` #${formatVolumeNumbers(edition.book.volumeNumbers)}` : ''}`
      : null,
    author: edition.book?.authors?.map((author) => author.name).join(', ') ?? null,
    ribbon: edition.bookBoxCompany?.name ?? null,
    brandColors: edition.bookBoxCompany?.brandColors ?? null,
    badge: `${edition.wishlistCount} wishlists`,
  }))

  return (
    <section className="pt-4">
      <div className="container mx-auto px-4 text-center">
        <p className="mb-2 text-sm text-stone-400">Most wishlisted editions in the last 7 days</p>
      </div>
      <EditionCarousel
        title="Trending This Week 🔥"
        cards={cards}
        centered
      />
    </section>
  )
}
