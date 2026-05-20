'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import { LayoutGrid, List } from 'lucide-react'
import { brandGradientStyle, brandTextClasses } from '@/lib/brandGradient'
import { useBrandColors } from '@/lib/useBrandColors'
import type { ApiSubscription } from '@luxgrimoire/shared-types'
import { SubCoverImage } from '@/components/subscriptions/SubCoverImage'
import { getSubscriptions } from '@/lib/api'

type Tab = 'active' | 'upcoming' | 'discontinued'

const TAB_LABELS: Record<Tab, string> = {
  active: 'Active',
  upcoming: '🔔 Upcoming',
  discontinued: 'Discontinued',
}

export default function SubscriptionList() {
  const [tab, setTab] = useState<Tab>('active')
  const [loadedTabs, setLoadedTabs] = useState<Set<Tab>>(new Set(['active']))
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [genreFilter, setGenreFilter] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const getBrandColors = useBrandColors()

  const { data: activeData, isLoading: activeLoading } = useQuery({
    queryKey: ['subscriptions', 'active'],
    queryFn: () => getSubscriptions({ status: 'active', pageSize: 200 }),
    enabled: loadedTabs.has('active'),
  })
  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ['subscriptions', 'upcoming'],
    queryFn: () => getSubscriptions({ status: 'upcoming', pageSize: 200 }),
    enabled: loadedTabs.has('upcoming'),
  })
  const { data: discontinuedData, isLoading: discontinuedLoading } = useQuery({
    queryKey: ['subscriptions', 'discontinued'],
    queryFn: () => getSubscriptions({ status: 'discontinued', pageSize: 200 }),
    enabled: loadedTabs.has('discontinued'),
  })

  const tabData = {
    active: activeData?.data,
    upcoming: upcomingData?.data,
    discontinued: discontinuedData?.data,
  }
  const tabLoading = {
    active: activeLoading,
    upcoming: upcomingLoading,
    discontinued: discontinuedLoading,
  }
  const subscriptions = tabData[tab] ?? []
  const isLoading = tabLoading[tab] && !tabData[tab]

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab)
    setSearch('')
    setCompanyFilter('')
    setGenreFilter('')
    if (!loadedTabs.has(nextTab)) {
      setLoadedTabs((prev) => new Set([...prev, nextTab]))
    }
  }

  const companies = useMemo(() => {
    const names = subscriptions.map((s) => s.company?.name).filter((n): n is string => Boolean(n))
    return Array.from(new Set(names)).sort()
  }, [subscriptions])

  const genres = useMemo(() => {
    const normalized = new Map<string, string>()
    for (const s of subscriptions) {
      const items: string[] = [...(Array.isArray(s.genres) ? s.genres : []), ...(s.genre ? [s.genre] : [])]
      for (const genre of items) {
        const key = genre.toLowerCase()
        if (!normalized.has(key)) normalized.set(key, genre)
      }
    }
    return Array.from(normalized.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, display]) => display)
  }, [subscriptions])

  const filtered = useMemo(() => {
    const query = search.toLowerCase()
    return subscriptions.filter((s) => {
      if (query && !s.name.toLowerCase().includes(query) && !s.company?.name.toLowerCase().includes(query)) return false
      if (companyFilter && s.company?.name !== companyFilter) return false
      if (genreFilter) {
        const subGenres = [...(Array.isArray(s.genres) ? s.genres : []), ...(s.genre ? [s.genre] : [])]
        if (!subGenres.some((genre) => genre.toLowerCase() === genreFilter.toLowerCase())) return false
      }
      return true
    })
  }, [subscriptions, search, companyFilter, genreFilter])

  const SELECT_CLASS = 'bg-stone-800 border border-stone-700 text-stone-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-600'

  return (
    <>
      <div className="flex gap-1 mb-6 border-b border-stone-800">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => handleTabChange(tabKey)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === tabKey ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            {TAB_LABELS[tabKey]}
            {tabData[tabKey] && <span className="ml-1.5 text-xs opacity-60">({tabData[tabKey]!.length})</span>}
          </button>
        ))}
      </div>

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
          {companies.map((company) => (
            <option key={company} value={company}>{company}</option>
          ))}
        </select>
        <select className={SELECT_CLASS} value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
          <option value="">All genres</option>
          {genres.map((genre) => (
            <option key={genre} value={genre}>{genre}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 bg-stone-800 border border-stone-700 rounded-lg p-1 self-start sm:self-auto">
          <button onClick={() => setView('grid')} className={`p-1.5 rounded transition-colors ${view === 'grid' ? 'bg-stone-700 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`} aria-label="Grid view">
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setView('list')} className={`p-1.5 rounded transition-colors ${view === 'list' ? 'bg-stone-700 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`} aria-label="List view">
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-stone-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <p className="text-stone-500">No subscriptions match your filters.</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((sub: ApiSubscription) => {
            const cover = cloudinaryUrl(sub.coverImage, 'w_600,q_auto,f_auto')
            const brandColors = getBrandColors(sub.company?.slug) ?? sub.company?.brandColors
            const subGenres = [...(Array.isArray(sub.genres) ? sub.genres : []), ...(sub.genre ? [sub.genre] : [])].filter((genre, index, arr) => arr.indexOf(genre) === index)
            return (
              <Link
                key={sub.id}
                href={`/subscriptions/${sub.slug}?from=subscriptions`}
                className="group rounded-xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors"
              >
                <SubCoverImage coverUrl={cover} name={sub.name} brandColors={brandColors} />
                <div className="p-4">
                  {sub.company && <p className="text-xs text-amber-600 mb-1">{sub.company.name}</p>}
                  <h2 className="font-serif font-bold text-lg text-stone-100 group-hover:text-amber-400 transition-colors mb-1">{sub.name}</h2>
                  {sub.isUpcoming && sub.upcomingNote && <p className="text-xs text-amber-400/80 mb-1.5">{sub.upcomingNote}</p>}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {subGenres.map((genre) => <Badge key={genre} variant="outline">{genre}</Badge>)}
                    {sub.isDiscontinued && <Badge variant="destructive">Discontinued</Badge>}
                    {sub.isUpcoming && <Badge variant="outline">🔔 Upcoming</Badge>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-stone-800">
          {filtered.map((sub: ApiSubscription) => {
            const thumb = cloudinaryUrl(sub.coverImage, 'w_80,h_80,c_fill,q_auto,f_auto')
            const brandColors = getBrandColors(sub.company?.slug) ?? sub.company?.brandColors
            const textColors = brandTextClasses(brandColors)
            const subGenres = [...(Array.isArray(sub.genres) ? sub.genres : []), ...(sub.genre ? [sub.genre] : [])].filter((genre, index, arr) => arr.indexOf(genre) === index)
            return (
              <Link
                key={sub.id}
                href={`/subscriptions/${sub.slug}?from=subscriptions`}
                className="group flex items-center gap-4 py-3 hover:bg-stone-900/50 px-2 -mx-2 rounded-lg transition-colors"
              >
                <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-stone-800 flex items-center justify-center">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={sub.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={brandGradientStyle(brandColors)}>
                      <span className={`font-serif text-lg font-bold ${textColors.primary}`}>{sub.name.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-stone-100 group-hover:text-amber-400 transition-colors truncate leading-tight">{sub.name}</p>
                  {sub.company && <p className="text-xs text-amber-600/80 truncate">{sub.company.name}</p>}
                  {sub.isUpcoming && sub.upcomingNote && <p className="text-xs text-amber-400/80 truncate">{sub.upcomingNote}</p>}
                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                    {subGenres.slice(0, 3).map((genre) => <Badge key={genre} variant="outline">{genre}</Badge>)}
                    {sub.isDiscontinued && <Badge variant="destructive">Discontinued</Badge>}
                    {sub.isUpcoming && <Badge variant="outline">🔔 Upcoming</Badge>}
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
