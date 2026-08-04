import { EditionCarousel, type CarouselCard } from '@/components/ui/EditionCarousel'
import { getEarliestTierDate } from '@/lib/saleTiers'
import type { ApiTrendingSaleAnnouncement } from '@luxgrimoire/shared-types'

interface Props {
  announcements: ApiTrendingSaleAnnouncement[]
}

function formatSaleDate(dateStr: string | null) {
  if (!dateStr) return 'Date TBA'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

export function HomeTrendingSales({ announcements }: Props) {
  if (announcements.length === 0) return null

  const cards: CarouselCard[] = announcements.map((sale) => {
    const firstEdition = sale.editions?.[0]?.edition
    return {
      id: sale.id,
      href: `/sale-announcements/${sale.id}`,
      coverImage: sale.imageUrl ?? firstEdition?.additionalImages?.[0] ?? null,
      title: sale.title,
      subtitle: formatSaleDate(getEarliestTierDate(sale)),
      ribbon: sale.company?.name ?? null,
      brandColors: sale.company?.brandColors ?? firstEdition?.bookBoxCompany?.brandColors ?? null,
      badge: `${sale.interestCount} ${sale.interestCount === 1 ? 'follow' : 'follows'}`,
    }
  })

  return (
    <EditionCarousel
      title="Trending Sales ⚡"
      eyebrow="Most followed upcoming sales"
      cards={cards}
      centered
    />
  )
}
