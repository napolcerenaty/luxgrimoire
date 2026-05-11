'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Search, LayoutGrid, List } from 'lucide-react'
import type { ApiBookBoxCompany } from '@luxgrimoire/shared-types'

interface Props {
  companies: ApiBookBoxCompany[]
}

export function CompaniesClient({ companies }: Props) {
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')

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
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 mb-1">Independent directory of book box companies.</p>
      <p className="text-sm text-stone-400 mb-6">A curated overview of subscription box brands. Some listings may include content displayed with permission from the respective owners.</p>

      {/* Search + filter + view toggle */}
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
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-stone-900 border border-stone-700 rounded-lg p-1 self-start sm:self-auto">
          <button
            onClick={() => setView('grid')}
            className={`p-1.5 rounded transition-colors ${view === 'grid' ? 'bg-stone-700 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
            aria-label="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('list')}
            className={`p-1.5 rounded transition-colors ${view === 'list' ? 'bg-stone-700 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
            aria-label="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-stone-500">No companies found.</p>
      ) : view === 'grid' ? (
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
                <div className="relative h-24 overflow-hidden bg-stone-800 flex items-center justify-center">
                  {bgImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bgImage} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-lg opacity-30" />
                  )}
                  {logoImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoImage} alt={company.name} className="relative z-10 max-w-[60%] max-h-[60%] object-contain drop-shadow-xl group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <span className="relative z-10 text-3xl font-serif font-bold text-amber-600/60">{company.name.charAt(0)}</span>
                  )}
                </div>
                <div className="p-4 flex flex-col gap-1.5 flex-1">
                  <h2 className="font-serif font-bold text-lg text-stone-100 group-hover:text-amber-400 transition-colors leading-snug line-clamp-2">{company.name}</h2>
                  {company.country && (
                    <p className="text-xs text-stone-500 flex items-center gap-1">
                      <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {company.country}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-stone-800">
          {filtered.map((company) => {
            const thumb = cloudinaryUrl(company.logoUrl, 'w_80,h_80,c_fit,q_auto,f_auto')
            return (
              <Link
                key={company.id}
                href={`/companies/${company.slug}`}
                className="group flex items-center gap-4 py-3 hover:bg-stone-900/50 px-2 -mx-2 rounded-lg transition-colors"
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-stone-800 flex items-center justify-center">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={company.name} className="w-full h-full object-contain p-1" />
                  ) : (
                    <span className="font-serif text-stone-500 text-lg">{company.name.charAt(0)}</span>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-stone-100 group-hover:text-amber-400 transition-colors truncate leading-tight">
                    {company.name}
                  </p>
                  {company.country && (
                    <p className="text-xs text-stone-500 mt-0.5">{company.country}</p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
      <p className="mt-10 text-center text-xs text-stone-400 max-w-2xl mx-auto leading-relaxed">
        LuxGrimoire is an independent, fan-made database of book subscription boxes and special editions.
        We are not affiliated with, endorsed by, or sponsored by any listed companies unless explicitly stated as a Featured Partner.
        Some brands featured on LuxGrimoire are displayed with permission from their respective owners.
        All trademarks, cover images, logos, and brand materials belong to their respective owners.
      </p>
    </div>
  )
}
