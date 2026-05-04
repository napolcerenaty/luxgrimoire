'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import type { ApiSubscription } from '@luxgrimoire/shared-types'

interface Props {
  subscriptions: ApiSubscription[]
}

export default function SubscriptionList({ subscriptions }: Props) {
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [genreFilter, setGenreFilter] = useState('')

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
      {/* Search + filters */}
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
      </div>

      {filtered.length === 0 ? (
        <p className="text-stone-500">No subscriptions match your filters.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((sub) => {
            const cover = cloudinaryUrl(sub.coverImage, 'w_600,q_auto,f_auto')
            const subGenres: string[] = [
              ...(Array.isArray(sub.genres) ? sub.genres : []),
              ...(sub.genre ? [sub.genre] : []),
            ].filter((g, i, arr) => arr.indexOf(g) === i)
            return (
              <Link
                key={sub.id}
                href={`/subscriptions/${sub.slug}`}
                className="group rounded-xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors"
              >
                <div className="aspect-[2/1] relative overflow-hidden bg-stone-950 flex items-center justify-center">
                  {cover ? (
                    <>
                      {/* Blurred background fill */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={cover}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50"
                      />
                      {/* Contained main image */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={cover}
                        alt={sub.name}
                        className="relative z-10 max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
                      />
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center px-4">
                      <span className="font-serif text-stone-400 text-lg text-center leading-snug">{sub.name}</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  {/* company → name → genres */}
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
      )}
    </>
  )
}
