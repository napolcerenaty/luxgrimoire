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
    const all: string[] = []
    for (const s of subscriptions) {
      if (Array.isArray(s.genres)) all.push(...s.genres)
      if (s.genre) all.push(s.genre)
    }
    return Array.from(new Set(all)).sort()
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
        if (!sGenres.includes(genreFilter)) return false
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
            const cover = cloudinaryUrl(sub.coverImage, 'w_600,h_400,c_fill,q_auto,f_auto')
            const subGenres: string[] = Array.isArray(sub.genres) && sub.genres.length > 0
              ? sub.genres
              : sub.genre ? [sub.genre] : []
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
                  {/* company → name → genres */}
                  {sub.company && (
                    <p className="text-xs text-amber-600 mb-1">{sub.company.name}</p>
                  )}
                  <h2 className="font-serif font-semibold text-stone-100 group-hover:text-amber-400 transition-colors mb-2">
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
