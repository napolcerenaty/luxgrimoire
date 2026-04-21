import type { Metadata } from 'next'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'

export const metadata: Metadata = {
  title: 'Book Box Companies',
  description: 'Browse all luxury book subscription box companies on LuxGrimoire.',
}

export default async function CompaniesPage() {
  let companies: ApiBookBoxCompany[] = []
  try {
    const res = await apiFetch<PaginatedResponse<ApiBookBoxCompany>>('/companies?pageSize=50')
    companies = res.data
  } catch {
    // show empty state
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <h1 className="text-4xl font-serif font-bold text-stone-100 mb-2">Companies</h1>
      <p className="text-stone-400 mb-10">All book subscription box companies on LuxGrimoire.</p>

      {companies.length === 0 ? (
        <p className="text-stone-500">No companies found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {companies.map((company) => {
            const logo = cloudinaryUrl(company.logoUrl, 'w_200,h_200,c_fill,q_auto,f_auto')
            const subCount = company.subscriptions?.length ?? 0
            return (
              <Link
                key={company.id}
                href={`/companies/${company.slug}`}
                className="flex items-start gap-4 p-5 rounded-xl bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors group"
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-stone-800 flex items-center justify-center shrink-0">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt={company.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-serif text-amber-600">
                      {company.name.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-serif font-semibold text-stone-100 group-hover:text-amber-400 transition-colors truncate">
                    {company.name}
                  </h2>
                  {company.country && (
                    <p className="text-xs text-stone-500 mt-0.5">{company.country}</p>
                  )}
                  {company.description && (
                    <p className="text-xs text-stone-400 mt-1 line-clamp-2 leading-relaxed">
                      {company.description}
                    </p>
                  )}
                  {subCount > 0 && (
                    <p className="text-xs text-amber-600/70 mt-2">
                      {subCount} subscription{subCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
