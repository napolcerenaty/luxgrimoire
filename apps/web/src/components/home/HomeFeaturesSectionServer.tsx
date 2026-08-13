import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { FeaturesCarousel, type HomepageFeature } from './HomeFeaturesSection'

const FALLBACK_FEATURES: HomepageFeature[] = [
  {
    id: '1',
    title: 'Track Your Collection',
    description: 'Add editions, track ownership status (owned, preorder, shipping), condition and read status',
    iconName: 'BookOpen',
    ctaLabel: 'Get started free',
    ctaHref: '/register',
  },
  {
    id: '2',
    title: 'Sale Alerts',
    description: 'Get notified before FA, EA and GS sale windows close — never miss a drop',
    iconName: 'Bell',
    ctaLabel: 'Get started free',
    ctaHref: '/register',
  },
  {
    id: '3',
    title: 'Spending Statistics',
    description: 'See how much you spend per month and per year across subscriptions and purchases',
    iconName: 'BarChart2',
    ctaLabel: 'Get started free',
    ctaHref: '/register',
  },
]

export async function HomeFeaturesSection() {
  let features: HomepageFeature[] = []

  try {
    features = await apiFetch<HomepageFeature[]>('/homepage-features')
  } catch {
    // ignore
  }

  if (features.length === 0) features = FALLBACK_FEATURES

  return (
    <section className="py-12">
      <div className="container mx-auto max-w-5xl px-4">
        <h2 className="mb-8 text-center font-serif text-2xl text-navy-100">
          Everything you need to manage your collection
        </h2>
      </div>
      <FeaturesCarousel features={features} />
      <div className="mt-6 flex justify-center">
        <Link
          href="/register"
          className="rounded-full bg-brand-600 px-8 py-3 font-serif text-sm font-semibold text-navy-950 transition-colors hover:bg-brand-500"
        >
          Get started free →
        </Link>
      </div>
    </section>
  )
}
