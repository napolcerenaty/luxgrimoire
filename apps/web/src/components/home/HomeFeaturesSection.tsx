import Link from 'next/link'
import * as Icons from 'lucide-react'
import type { ComponentType } from 'react'
import { apiFetch } from '@/lib/api'

interface HomepageFeature {
  id: string
  title: string
  description: string
  iconName: string
  ctaLabel: string | null
  ctaHref: string | null
}

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

function FeatureIcon({ name }: { name: string }) {
  const Icon = (Icons as Record<string, ComponentType<{ size?: number }>>)[name] ?? Icons.Star
  return <Icon size={26} />
}

function FeatureCard({ feature }: { feature: HomepageFeature }) {
  return (
    <div className="w-72 flex-shrink-0 snap-start rounded-2xl border border-stone-800 bg-stone-900 p-6 transition-colors hover:border-amber-700/40 sm:w-80">
      <div className="mb-3 flex items-center gap-3">
        <div className="shrink-0 rounded-xl bg-stone-800 p-3 text-amber-400">
          <FeatureIcon name={feature.iconName} />
        </div>
        <h3 className="font-serif text-lg leading-snug text-stone-100">{feature.title}</h3>
      </div>
      <p className={`text-sm leading-relaxed text-stone-400 ${feature.ctaHref ? 'mb-4' : ''}`}>
        {feature.description}
      </p>
      {feature.ctaHref && (
        <Link
          href={feature.ctaHref}
          className="text-sm font-serif text-amber-500 transition-colors hover:text-amber-400"
        >
          {feature.ctaLabel ?? 'Get started'} →
        </Link>
      )}
    </div>
  )
}

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
        <h2 className="mb-8 text-center font-serif text-2xl text-stone-100">
          Everything you need to manage your collection
        </h2>
      </div>
      <div className="container mx-auto max-w-5xl overflow-hidden px-4">
        <div className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
          {features.map((feature) => <FeatureCard key={feature.id} feature={feature} />)}
        </div>
      </div>
      <div className="mt-6 flex justify-center">
        <Link
          href="/register"
          className="rounded-full bg-amber-600 px-8 py-3 font-serif text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-500"
        >
          Get started free →
        </Link>
      </div>
    </section>
  )
}
