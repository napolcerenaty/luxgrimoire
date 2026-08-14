import { EditionCarousel, type CarouselCard } from '@/components/ui/EditionCarousel'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { formatVolumeNumbers } from '@/lib/volumeNumbers'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'
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
    title: formatEditionDisplayTitle(edition.book, edition) || 'Unknown',
    subtitle: edition.book?.seriesName
      ? `${edition.book.seriesName}${edition.book.volumeNumbers?.length ? ` #${formatVolumeNumbers(edition.book.volumeNumbers)}` : ''}`
      : null,
    author: edition.book?.authors?.map((author) => author.name).join(', ') ?? null,
    ribbon: edition.bookBoxCompany?.name ?? null,
    brandColors: edition.bookBoxCompany?.brandColors ?? null,
    badge: `${edition.wishlistCount} ${edition.wishlistCount === 1 ? 'wishlist' : 'wishlists'}`,
  }))

  return (
    <EditionCarousel
      title="Trending This Week 🔥"
      cards={cards}
      centered
    />
  )
}
