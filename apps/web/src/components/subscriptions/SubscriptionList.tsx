'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import { LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react'
import { brandGradientStyle, brandTextClasses } from '@/lib/brandGradient'
import { useBrandColors } from '@/lib/useBrandColors'
import { formatInterval } from '@/lib/formatInterval'
import { MultiSelect } from '@/components/ui/MultiSelect'
import type { ApiSubscription } from '@luxgrimoire/shared-types'
import { SubCoverImage } from '@/components/subscriptions/SubCoverImage'
import { getSubscriptions } from '@/lib/api'

type Tab = 'active' | 'upcoming' | 'discontinued'

const TAB_LABELS: Record<Tab, string> = {
  active: 'Active',
  upcoming: 'Upcoming',
  discontinued: 'Discontinued',
}

const SKIP_TYPE_SHORT: Record<string, string> = {
  NONE: 'No skips',
  UNLIMITED: 'Unlimited skips',
  UNLIMITED_MAX_CONSEC: 'Unlimited skips',
  CALENDAR_YEAR: 'Limited skips',
  FROM_FIRST_SKIP: 'Limited skips',
  FROM_SUB_START: 'Limited skips',
  PREPAID_WINDOW_SKIP: 'Prepaid window skip',
}

const BILLING_SHORT: Record<string, string> = {
  MONTHLY: 'Monthly',
  PREPAID: 'Prepaid',
}

const SKIP_POLICY_OPTIONS: { value: string; label: string }[] = [
  { value: 'NONE', label: 'No skips' },
  { value: 'UNLIMITED', label: 'Unlimited' },
  { value: 'UNLIMITED_MAX_CONSEC', label: 'Unlimited (max consecutive)' },
  { value: 'CALENDAR_YEAR', label: 'Calendar year' },
  { value: 'FROM_FIRST_SKIP', label: 'Rolling window from first skip' },
  { value: 'FROM_SUB_START', label: 'Rolling window from sub start' },
  { value: 'PREPAID_WINDOW_SKIP', label: 'Prepaid window skip' },
]

function SkipPolicyBadges({ policies }: { policies: { type: string; billingType?: string | null }[] }) {
  if (!policies || policies.length === 0) return null
  const isMulti = policies.length > 1
  return (
    <div className="flex items-center gap-1 flex-wrap pt-1.5 mt-1 border-t border-stone-700/60">
      {policies.map((p) => {
        const label = isMulti && p.billingType && p.billingType !== 'ALL'
          ? `${BILLING_SHORT[p.billingType] ?? p.billingType}: ${SKIP_TYPE_SHORT[p.type] ?? p.type}`
          : (SKIP_TYPE_SHORT[p.type] ?? p.type)
        const isNone = p.type === 'NONE'
        return (
          <Badge key={p.billingType ?? 'all'} variant={isNone ? 'destructive' : 'success'}>
            {label}
          </Badge>
        )
      })}
    </div>
  )
}

export default function SubscriptionList() {
  const [tab, setTab] = useState<Tab>('active')
  const [loadedTabs, setLoadedTabs] = useState<Set<Tab>>(new Set(['active']))
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [genreFilters, setGenreFilters] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [skipPolicyFilter, setSkipPolicyFilter] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const getBrandColors = useBrandColors()

  const skipParam = skipPolicyFilter || undefined

  const { data: activeData, isLoading: activeLoading } = useQuery({
    queryKey: ['subscriptions', 'active', skipPolicyFilter],
    queryFn: () => getSubscriptions({ status: 'active', pageSize: 200, skipPolicyType: skipParam }),
    enabled: loadedTabs.has('active'),
  })
  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ['subscriptions', 'upcoming', skipPolicyFilter],
    queryFn: () => getSubscriptions({ status: 'upcoming', pageSize: 200, skipPolicyType: skipParam }),
    enabled: loadedTabs.has('upcoming'),
  })
  const { data: discontinuedData, isLoading: discontinuedLoading } = useQuery({
    queryKey: ['subscriptions', 'discontinued', skipPolicyFilter],
    queryFn: () => getSubscriptions({ status: 'discontinued', pageSize: 200, skipPolicyType: skipParam }),
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
    setGenreFilters([])
    setTypeFilter('')
    setCountryFilter('')
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

  const intervals = useMemo(() => {
    const values = new Set(subscriptions.map((s) => s.intervalMonths).filter((n): n is number => Boolean(n)))
    return Array.from(values).sort((a, b) => a - b)
  }, [subscriptions])

  const countries = useMemo(() => {
    const names = subscriptions.map((s) => s.company?.country).filter((n): n is string => Boolean(n))
    return Array.from(new Set(names)).sort()
  }, [subscriptions])

  const filtered = useMemo(() => {
    const query = search.toLowerCase()
    const genreFiltersLower = genreFilters.map((g) => g.toLowerCase())
    return subscriptions.filter((s) => {
      if (query && !s.name.toLowerCase().includes(query) && !s.company?.name.toLowerCase().includes(query)) return false
      if (companyFilter && s.company?.name !== companyFilter) return false
      if (genreFiltersLower.length > 0) {
        const subGenres = [...(Array.isArray(s.genres) ? s.genres : []), ...(s.genre ? [s.genre] : [])]
        if (!subGenres.some((genre) => genreFiltersLower.includes(genre.toLowerCase()))) return false
      }
      if (typeFilter && String(s.intervalMonths) !== typeFilter) return false
      if (countryFilter && s.company?.country !== countryFilter) return false
      return true
    })
  }, [subscriptions, search, companyFilter, genreFilters, typeFilter, countryFilter])

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = []
    if (companyFilter) chips.push({ key: 'company', label: companyFilter, onRemove: () => setCompanyFilter('') })
    if (typeFilter) chips.push({ key: 'type', label: formatInterval(Number(typeFilter)), onRemove: () => setTypeFilter('') })
    if (countryFilter) chips.push({ key: 'country', label: countryFilter, onRemove: () => setCountryFilter('') })
    if (skipPolicyFilter) {
      const opt = SKIP_POLICY_OPTIONS.find((o) => o.value === skipPolicyFilter)
      chips.push({ key: 'skipPolicy', label: opt?.label ?? skipPolicyFilter, onRemove: () => setSkipPolicyFilter('') })
    }
    for (const genre of genreFilters) {
      chips.push({ key: `genre-${genre}`, label: genre, onRemove: () => setGenreFilters((prev) => prev.filter((g) => g !== genre)) })
    }
    return chips
  }, [companyFilter, typeFilter, countryFilter, skipPolicyFilter, genreFilters])

  const clearAllFilters = () => {
    setCompanyFilter('')
    setGenreFilters([])
    setTypeFilter('')
    setCountryFilter('')
    setSkipPolicyFilter('')
  }

  const SELECT_CLASS = 'flex-1 min-w-0 sm:flex-none sm:w-auto bg-stone-800 border border-stone-700 text-stone-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-600'

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

      <div className="mb-8 space-y-2">
        {/* Row 1 — search is always visible; company/country sit next to it on desktop (the primary
            "narrow down what/where" filters) but collapse behind the Filters button on mobile along
            with row 2, same as everything else. */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search by name or company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-0 bg-stone-800 border border-stone-700 text-stone-200 text-sm rounded-lg px-3 py-2 placeholder:text-stone-500 focus:outline-none focus:border-amber-600"
            />
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className={`sm:hidden relative flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm shrink-0 transition-colors ${
                filtersOpen ? 'bg-stone-700 border-amber-600 text-amber-400' : 'bg-stone-800 border-stone-700 text-stone-300'
              }`}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterChips.length > 0 && (
                <span className="ml-0.5 min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center rounded-full bg-amber-600 text-[10px] font-semibold text-stone-950">
                  {activeFilterChips.length}
                </span>
              )}
            </button>
            <div className="flex items-center gap-1 bg-stone-800 border border-stone-700 rounded-lg p-1 shrink-0">
              <button onClick={() => setView('grid')} className={`p-1.5 rounded transition-colors ${view === 'grid' ? 'bg-stone-700 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`} aria-label="Grid view">
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setView('list')} className={`p-1.5 rounded transition-colors ${view === 'list' ? 'bg-stone-700 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`} aria-label="List view">
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className={`${filtersOpen ? 'flex' : 'hidden'} sm:flex gap-2`}>
            <select className={SELECT_CLASS} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
              <option value="">All companies</option>
              {companies.map((company) => (
                <option key={company} value={company}>{company}</option>
              ))}
            </select>
            <select className={SELECT_CLASS} value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
              <option value="">All countries</option>
              {countries.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2 — attribute filters: type, skip policy, genre. Collapsed behind the Filters button on
            mobile, always visible from sm: up. */}
        <div className={`${filtersOpen ? 'flex' : 'hidden'} sm:flex flex-col sm:flex-row gap-2`}>
          <select className={SELECT_CLASS} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {intervals.map((interval) => (
              <option key={interval} value={interval}>{formatInterval(interval)}</option>
            ))}
          </select>
          <select className={SELECT_CLASS} value={skipPolicyFilter} onChange={(e) => setSkipPolicyFilter(e.target.value)}>
            <option value="">All skip policies</option>
            {SKIP_POLICY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <MultiSelect label="genres" options={genres} selected={genreFilters} onChange={setGenreFilters} className="sm:w-64" />
        </div>

        {/* Active filter chips — quick visibility + one-tap removal, especially useful once selects are collapsed on mobile */}
        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.onRemove}
                className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs hover:bg-amber-950/70 transition-colors"
              >
                {chip.label}
                <X className="w-3 h-3" />
              </button>
            ))}
            <button onClick={clearAllFilters} className="text-xs text-stone-500 hover:text-stone-300 underline underline-offset-2 ml-1">
              Clear all
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-stone-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <p className="text-stone-500">No subscriptions match your filters.</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
                <SubCoverImage
                  coverUrl={cover}
                  name={sub.name}
                  brandColors={brandColors}
                  imageActions={
                    sub.company && (
                      <div className="card-ribbon absolute bottom-0 left-0 right-0 px-2 py-2 text-center">
                        <span
                          className="card-ribbon-text font-serif font-semibold uppercase tracking-widest leading-none line-clamp-1 text-white"
                          style={{ fontSize: '10px', letterSpacing: '0.12em' }}
                        >
                          {sub.company.name}
                        </span>
                      </div>
                    )
                  }
                />
                <div className="p-3">
                  <h2 className="font-serif font-bold text-sm text-stone-100 group-hover:text-amber-400 transition-colors mb-1 line-clamp-2 leading-snug">{sub.name}</h2>
                  {sub.isUpcoming && sub.upcomingNote && <p className="text-xs text-amber-400/80 mb-1 line-clamp-1">{sub.upcomingNote}</p>}
                  <div className="flex items-center gap-1 flex-wrap">
                    {subGenres.slice(0, 2).map((genre) => <Badge key={genre} variant="outline">{genre}</Badge>)}
                    {sub.isDiscontinued && <Badge variant="destructive">Discontinued</Badge>}
                    {sub.isUpcoming && <Badge variant="outline">🔔 Upcoming</Badge>}
                  </div>
                  {sub.skipPolicies && sub.skipPolicies.length > 0 && (
                    <SkipPolicyBadges policies={sub.skipPolicies} />
                  )}
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
                  {sub.skipPolicies && sub.skipPolicies.length > 0 && (
                    <SkipPolicyBadges policies={sub.skipPolicies} />
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
