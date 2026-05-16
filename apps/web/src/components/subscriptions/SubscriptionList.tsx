'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import { LayoutGrid, List } from 'lucide-react'
import { brandGradientStyle, brandTextClasses } from '@/lib/brandGradient'
import type { ApiSubscription } from '@luxgrimoire/shared-types'

interface Props {
  subscriptions: ApiSubscription[]
}

export default function SubscriptionList({ subscriptions }: Props) {
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [genreFilter, setGenreFilter] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const companies = useMemo(() => {
    const names = subscriptions
      .map((s) => s.company?.name)
      .filter((n): n is string => Boolean(n))
    return Array.from(new Set(names)).sort()
  }, [subscriptions])

  const genres = useMemo(() => {
    const normalized = new Map<string, string>() // lowercase key → display value
    for (const s of subscriptions) {
      const items: string[] = [
        ...(Array.isArray(s.genres) ? s.genres : []),
        ...(s.genre ? [s.genre] : []),
      ]
      for (const g of items) {
        const key = g.toLowerCase()
        if (!normalized.has(key)) normalized.set(key, g)
      }
    }
    return Array.from(normalized.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, display]) => display)
  }, [subscriptions])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return subscriptions.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.company?.name.toLowerCase().includes(q)) return false
      if (companyFilter && s.company?.name !== companyFilter) return false
      if (genreFilter) {
        const sGenres: string[] = [
          ...(Array.isArray(s.genres) ? s.genres : []),
          ...(s.genre ? [s.genre] : []),
        ]
        if (!sGenres.some((g) => g.toLowerCase() === genreFilter.toLowerCase())) return false
      }
      return true
    })
  }, [subscriptions, search, companyFilter, genreFilter])

  const SELECT_CLASS =
    'bg-stone-800 border border-stone-700 text-stone-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-600'

  return (
    <>
      {/* Search + filters + view toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          type="text"
          placeholder="Search by name or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-stone-800 border border-stone-700 text-stone-200 text-sm rounded-lg px-3 py-2 placeholder:text-stone-500 focus:outline-none focus:border-amber-600"
        />
        <select className={SELECT_CLASS} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select className={SELECT_CLASS} value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-stone-800 border border-stone-700 rounded-lg p-1 self-start sm:self-auto">
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
        <p className="text-stone-500">No subscriptions match your filters.</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((sub) => {
            const cover = cloudinaryUrl(sub.coverImage, 'w_600,q_auto,f_auto')
            const brandColors = sub.company?.brandColors
            const tc = brandTextClasses(brandColors)
            const subGenres: string[] = [
              ...(Array.isArray(sub.genres) ? sub.genres : []),
              ...(sub.genre ? [sub.genre] : []),
            ].filter((g, i, arr) => arr.indexOf(g) === i)
            return (
              <Link
                key={sub.id}
                href={`/subscriptions/${sub.slug}?from=subscriptions`}
                className="group rounded-xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors"
              >
                <div className="aspect-[2/1] relative overflow-hidden bg-stone-950 flex items-center justify-center">
                  {cover ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cover} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cover} alt={sub.name} className="relative z-10 max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300" />
                    </>
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center px-4"
                      style={brandGradientStyle(brandColors)}
                    >
                      <span className={`font-serif text-lg text-center leading-snug ${tc.primary}`}>{sub.name}</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  {sub.company && (
                    <p className="text-xs text-amber-600 mb-1">{sub.company.name}</p>
                  )}
                  <h2 className="font-serif font-bold text-lg text-stone-100 group-hover:text-amber-400 transition-colors mb-2">
                    {sub.name}
                  </h2>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {subGenres.map((g) => (
                      <Badge key={g} variant="outline">{g}</Badge>
                    ))}
                    {sub.isDiscontinued && <Badge variant="destructive">Discontinued</Badge>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-stone-800">
          {filtered.map((sub) => {
            const thumb = cloudinaryUrl(sub.coverImage, 'w_80,h_80,c_fill,q_auto,f_auto')
            const brandColors = sub.company?.brandColors
            const tc = brandTextClasses(brandColors)
            const subGenres: string[] = [
              ...(Array.isArray(sub.genres) ? sub.genres : []),
              ...(sub.genre ? [sub.genre] : []),
            ].filter((g, i, arr) => arr.indexOf(g) === i)
            return (
              <Link
                key={sub.id}
                href={`/subscriptions/${sub.slug}?from=subscriptions`}
                className="group flex items-center gap-4 py-3 hover:bg-stone-900/50 px-2 -mx-2 rounded-lg transition-colors"
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-stone-800 flex items-center justify-center">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={sub.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={brandGradientStyle(brandColors)}
                    >
                      <span className={`font-serif text-lg font-bold ${tc.primary}`}>{sub.name.charAt(0)}</span>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-stone-100 group-hover:text-amber-400 transition-colors truncate leading-tight">
                    {sub.name}
                  </p>
                  {sub.company && (
                    <p className="text-xs text-amber-600/80 truncate">{sub.company.name}</p>
                  )}
                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                    {subGenres.slice(0, 3).map((g) => (
                      <Badge key={g} variant="outline">{g}</Badge>
                    ))}
                    {sub.isDiscontinued && <Badge variant="destructive">Discontinued</Badge>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
