import type { Metadata } from 'next'
import { apiFetch } from '@/lib/api'
import type { ApiSubscription, PaginatedResponse } from '@luxgrimoire/shared-types'
import SubscriptionList from '@/components/subscriptions/SubscriptionList'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Subscriptions',
  description: 'Browse all luxury book subscription boxes on LuxGrimoire.',
}

export default async function SubscriptionsPage() {
  let subscriptions: ApiSubscription[] = []
  try {
    const res = await apiFetch<PaginatedResponse<ApiSubscription>>('/subscriptions?pageSize=100')
    subscriptions = res.data
  } catch {
    // show empty state
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <h1 className="text-4xl font-serif font-bold text-stone-100 mb-1">Subscriptions</h1>
      <p className="text-sm text-stone-400 mb-6">Explore active book subscription boxes and curated reading services. This is an independent database and not a storefront.</p>

      {subscriptions.length === 0 ? (
        <p className="text-stone-500">No subscriptions found.</p>
      ) : (
        <SubscriptionList subscriptions={subscriptions} />
      )}
    </div>
  )
}

