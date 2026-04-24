import type { Metadata } from 'next'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import type { ApiSubscription, PaginatedResponse } from '@luxgrimoire/shared-types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Subscriptions',
  description: 'Browse all luxury book subscription boxes on LuxGrimoire.',
}

export default async function SubscriptionsPage() {
  let subscriptions: ApiSubscription[] = []
  try {
    const res = await apiFetch<PaginatedResponse<ApiSubscription>>('/subscriptions?pageSize=50')
    subscriptions = res.data
  } catch {
    // show empty state
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <h1 className="text-4xl font-serif font-bold text-stone-100 mb-2">Subscriptions</h1>
      <p className="text-stone-400 mb-10">All book subscription boxes on LuxGrimoire.</p>

      {subscriptions.length === 0 ? (
        <p className="text-stone-500">No subscriptions found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {subscriptions.map((sub) => {
            const cover = cloudinaryUrl(sub.coverImage, 'w_600,h_400,c_fill,q_auto,f_auto')
            return (
              <Link
                key={sub.id}
                href={`/subscriptions/${sub.slug}`}
                className="group rounded-xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors"
              >
                <div className="aspect-[3/2] overflow-hidden bg-stone-800">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt={sub.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-600 text-sm">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-4">
                  {sub.company && (
                    <p className="text-xs text-amber-600 mb-1">{sub.company.name}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {sub.genre && <Badge variant="outline">{sub.genre}</Badge>}
                    {sub.isDiscontinued && <Badge variant="destructive">Discontinued</Badge>}
                  </div>
                  <h2 className="font-serif font-semibold text-stone-100 group-hover:text-amber-400 transition-colors">
                    {sub.name}
                  </h2>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
