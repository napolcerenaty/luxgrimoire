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
    <section className="pt-4">
      <div className="container mx-auto px-4 text-center">
        <p className="mb-2 text-sm text-stone-400">Most followed upcoming sales</p>
      </div>
      <EditionCarousel
        title="Trending Sales ⚡"
        cards={cards}
        centered
      />
    </section>
  )
}
