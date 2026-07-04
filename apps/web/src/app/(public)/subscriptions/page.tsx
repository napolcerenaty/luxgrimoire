import type { Metadata } from 'next'
import SubscriptionList from '@/components/subscriptions/SubscriptionList'

export const metadata: Metadata = {
  title: 'Subscriptions',
  description: 'Browse all luxury book subscription boxes on LuxGrimoire.',
}

export default function SubscriptionsPage() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      <h1 className="text-4xl font-serif font-bold text-stone-100 mb-1">Subscriptions</h1>
      <p className="text-sm text-stone-400 mb-6">
        Explore active book subscription boxes and curated reading services. This is an independent database and not a storefront.
      </p>
      <SubscriptionList />
    </div>
  )
}

