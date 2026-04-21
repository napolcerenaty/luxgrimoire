import type { Metadata } from 'next'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiBookBoxCompany, ApiSubscription, PaginatedResponse } from '@luxgrimoire/shared-types'

export const metadata: Metadata = {
  title: 'Luxury Book Editions & Subscription Boxes',
  description:
    'Discover luxury special editions, track your book collection, and follow subscription boxes from Illumicrate, FairyLoot, and more.',
}

async function getHomeData() {
  const [companiesRes, subscriptionsRes] = await Promise.all([
    apiFetch<PaginatedResponse<ApiBookBoxCompany>>('/companies?pageSize=6').catch(() => null),
    apiFetch<PaginatedResponse<ApiSubscription>>('/subscriptions?pageSize=6&isDiscontinued=false').catch(() => null),
  ])
  return {
    companies: companiesRes?.data ?? [],
    subscriptions: subscriptionsRes?.data ?? [],
  }
}

export default async function HomePage() {
  const { companies, subscriptions } = await getHomeData()

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-stone-900 to-stone-950 py-24 px-4 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900/20 via-transparent to-transparent" />
        <div className="relative container mx-auto max-w-3xl">
          <h1 className="text-6xl sm:text-7xl font-serif font-bold text-amber-400 mb-4 tracking-tight">
            LuxGrimoire
          </h1>
          <p className="text-xl text-stone-300 mb-10 leading-relaxed">
            Your home for luxury book editions &amp; subscription boxes
          </p>
          <form action="/search" method="get" className="flex items-center max-w-xl mx-auto gap-2">
            <input
              name="q"
              type="text"
              placeholder="Search books, authors, companies…"
              className="flex-1 bg-stone-800 border border-stone-700 rounded-full px-5 py-3 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-600 transition-colors"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-amber-700 hover:bg-amber-600 text-white rounded-full font-medium transition-colors"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      {/* Featured Companies */}
      {companies.length > 0 && (
        <section className="container mx-auto px-4 py-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-serif font-semibold text-stone-100">Featured Companies</h2>
            <Link href="/companies" className="text-sm text-amber-500 hover:text-amber-400 transition-colors">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {companies.map((company) => {
              const logo = cloudinaryUrl(company.logoUrl, 'w_200,h_200,c_fill,q_auto,f_auto')
              return (
                <Link
                  key={company.id}
                  href={`/companies/${company.slug}`}
                  className="flex flex-col items-center gap-3 p-4 rounded-xl bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors group"
                >
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-stone-800 flex items-center justify-center shrink-0">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt={company.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-serif text-amber-600">
                        {company.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-stone-100 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">
                      {company.name}
                    </p>
                    {company.subscriptions && (
                      <p className="text-xs text-stone-500 mt-0.5">
                        {company.subscriptions.length} sub{company.subscriptions.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Recent Subscriptions */}
      {subscriptions.length > 0 && (
        <section className="container mx-auto px-4 py-10 pb-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-serif font-semibold text-stone-100">Active Subscriptions</h2>
            <Link href="/subscriptions" className="text-sm text-amber-500 hover:text-amber-400 transition-colors">
              View all →
            </Link>
          </div>
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
                    <h3 className="font-serif font-semibold text-stone-100 group-hover:text-amber-400 transition-colors">
                      {sub.name}
                    </h3>
                    {sub.genre && (
                      <p className="text-xs text-stone-400 mt-1">{sub.genre}</p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
