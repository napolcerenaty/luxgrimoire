import Link from 'next/link'
import { BarChart2, Bell, BookOpen } from 'lucide-react'

const features = [
  {
    title: 'Track Your Collection',
    description: 'Add editions, track ownership status (owned, preorder, shipping), condition and read status',
    icon: BookOpen,
  },
  {
    title: 'Sale Alerts',
    description: 'Get notified before FA, EA and GS sale windows close — never miss a drop',
    icon: Bell,
  },
  {
    title: 'Spending Statistics',
    description: 'See how much you spend per month and per year across subscriptions and purchases',
    icon: BarChart2,
  },
]

export function HomeFeaturesSection() {
  return (
    <section className="container mx-auto px-4 py-12">
      <h2 className="mb-8 text-center font-serif text-2xl text-stone-100">
        Everything you need to manage your collection
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {features.map(({ title, description, icon: Icon }) => (
          <div
            key={title}
            className="rounded-2xl border border-stone-800 bg-stone-900 p-6 transition-colors hover:border-amber-700/40"
          >
            <div className="mb-4 w-fit rounded-xl bg-stone-800 p-3">
              <Icon size={28} className="text-amber-400" />
            </div>
            <h3 className="mb-2 font-serif text-lg text-stone-100">{title}</h3>
            <p className="text-sm leading-relaxed text-stone-400">{description}</p>
            <Link
              href="/register"
              className="mt-4 inline-block text-sm font-serif text-amber-500 hover:text-amber-400"
            >
              Get started free →
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
