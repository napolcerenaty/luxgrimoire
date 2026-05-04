'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Search } from 'lucide-react'
import type { ApiBookBoxCompany } from '@luxgrimoire/shared-types'

interface Props {
  companies: ApiBookBoxCompany[]
}

export function CompaniesClient({ companies }: Props) {
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')

  const countries = useMemo(() => {
    const set = new Set<string>()
    companies.forEach((c) => { if (c.country) set.add(c.country) })
    return Array.from(set).sort()
  }, [companies])

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      const matchName = search === '' || c.name.toLowerCase().includes(search.toLowerCase())
      const matchCountry = countryFilter === '' || c.country === countryFilter
      return matchName && matchCountry
    })
  }, [companies, search, countryFilter])

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <h1 className="text-4xl font-serif font-bold text-stone-100 mb-1">Book Boxes</h1>
      <p className="text-sm text-stone-400 mb-6">This is an independent directory of subscription box companies.</p>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-600 text-sm"
          />
        </div>
        {countries.length > 0 && (
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 focus:outline-none focus:border-amber-600 text-sm min-w-[160px]"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-stone-500">No companies found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((company) => {
            const bgImage = cloudinaryUrl(company.logoUrl, 'w_400,h_200,c_fill,q_auto,f_auto')
            const logoImage = cloudinaryUrl(company.logoUrl, 'w_300,h_160,c_fit,q_auto,f_auto')

            return (
              <Link
                key={company.id}
                href={`/companies/${company.slug}`}
                className="group rounded-xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-all hover:shadow-lg hover:shadow-amber-900/10 flex flex-col"
              >
                {/* Logo area with blur bg */}
                <div className="relative h-32 overflow-hidden bg-stone-800 flex items-center justify-center">
                  {bgImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bgImage}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 w-full h-full object-cover scale-110 blur-lg opacity-30"
                    />
                  )}
                  {logoImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoImage}
                      alt={company.name}
                      className="relative z-10 max-w-[80%] max-h-[80%] object-contain drop-shadow-xl group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <span className="relative z-10 text-4xl font-serif font-bold text-amber-600/60">
                      {company.name.charAt(0)}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 flex flex-col gap-1.5 flex-1">
                  <h2 className="font-serif font-semibold text-stone-100 group-hover:text-amber-400 transition-colors leading-snug line-clamp-2">
                    {company.name}
                  </h2>

                  {company.country && (
                    <p className="text-xs text-stone-500 flex items-center gap-1">
                      <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {company.country}
                    </p>
                  )}

                  {/* Counts removed */}
                </div>
              </Link>
            )
          })}
        </div>
      )}
      <p className="mt-10 text-center text-xs text-stone-400">
        LuxGrimoire is an independent, fan-made database and is not affiliated with any listed companies. All trademarks and images belong to their respective owners.
      </p>
    </div>
  )
}
