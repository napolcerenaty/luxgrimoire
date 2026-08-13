import { apiFetch } from '@/lib/api'
import type { ApiSubscriptionSeries } from '@luxgrimoire/shared-types'
import { SeriesHistoryCard } from './SeriesHistoryCard'

interface Props {
  subscriptionSlug: string
}

export async function SubscriptionSeriesSection({ subscriptionSlug }: Props) {
  let seriesList: ApiSubscriptionSeries[] = []
  try {
    seriesList = await apiFetch<ApiSubscriptionSeries[]>(`/subscription-series?subscriptionSlug=${subscriptionSlug}`)
  } catch {
    return null
  }

  if (seriesList.length === 0) return null

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-serif font-semibold text-navy-100 mb-6">
        Series ({seriesList.length})
      </h2>
      <div className="flex flex-col gap-4">
        {seriesList.map((s) => (
          <SeriesHistoryCard key={s.id} series={s} />
        ))}
      </div>
    </section>
  )
}
