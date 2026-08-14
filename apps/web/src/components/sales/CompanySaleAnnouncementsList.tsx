'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { authFetch } from '@/lib/authFetch'
import type { PaginatedResponse } from '@luxgrimoire/shared-types'
import { LayoutGrid, List, Search, Megaphone, CalendarDays, Download } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { useTheme } from '@/components/ThemeProvider'
import { useAuth } from '@/components/AuthProvider'
import { strHue } from '@/lib/calendarPills'
import { downloadIcsCalendar, type CalendarExportEvent } from '@/lib/ics'
import { trackEvent } from '@/lib/trackEvent'
import CalendarGrid, { type CalendarSaleItem } from '@/components/calendar/CalendarGrid'
import { AnnouncementCard, AnnouncementListRow, type ListSaleAnnouncement } from '@/components/sales/AnnouncementCard'

const PAGE_SIZE = 20

// A stable empty-array reference for useQuery's `data = []` fallback — a literal `[]` default
// creates a NEW array every render whenever `data` is undefined (e.g. a disabled query for
// guests), breaking referential equality for anything depending on it. myInterests feeding a
// useEffect dependency array with a fresh `[]` every render caused an infinite update loop for
// logged-out visitors on the sibling /sales-calendar page — same risk here.
const EMPTY_ARRAY: never[] = []

interface CalendarTier {
  tierId: string
  name: string
  date: string
  region: { id: string; name: string } | null
  announcement: {
    id: string
    title: string
    imageUrl: string | null
    saleType: string
    company: { id: string; name: string; slug: string; brandColors: string[] | null } | null
  }
  stageIndex: number
  stageTotal: number
  multiRegion: boolean
}

interface SaleInterest {
  announcementId: string
  saleTier: { id: string } | null
}

interface Props {
  companyId: string
  companyName?: string
}

export function CompanySaleAnnouncementsList({ companyId, companyName }: Props) {
  const { theme } = useTheme()
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'live' | 'past'>('live')
  const debouncedSearch = useDebounce(search, 300)

  // view + which month is showing live in the URL (not local state) so browser back/forward
  // after clicking through to a sale announcement restores exactly where you left off, instead
  // of resetting to the default grid view — see project memory for the bug this fixes.
  const rawView = searchParams.get('view')
  const view: 'grid' | 'list' | 'calendar' = rawView === 'list' || rawView === 'calendar' ? rawView : 'grid'

  useEffect(() => {
    if (view === 'calendar') {
      trackEvent('/analytics/public/company-calendar-view', { companyId, companyName: companyName ?? companyId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, companyId])

  // The selected day inside CalendarGrid isn't part of the restored URL state, so on browser
  // back the agenda panel comes back collapsed/shorter than it was — the browser's native
  // scroll-position restore then lands you on the now-empty space below it. Scoping
  // scrollRestoration to 'manual' while this page is mounted stops that (and restores whatever
  // the browser's default was again once you navigate away).
  useEffect(() => {
    const original = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = original
    }
  }, [])

  const today = new Date()
  const yearParam = parseInt(searchParams.get('year') ?? '', 10)
  const monthParam = parseInt(searchParams.get('month') ?? '', 10)
  const year = Number.isFinite(yearParam) ? yearParam : today.getFullYear()
  const month0 = Number.isFinite(monthParam) ? monthParam - 1 : today.getMonth()
  const month = month0 + 1
  const monthLabel = new Date(year, month0, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) params.set(key, value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function setView(newView: 'grid' | 'list' | 'calendar') {
    updateParams({ view: newView })
  }

  function setViewDate(newDate: Date) {
    updateParams({ year: String(newDate.getFullYear()), month: String(newDate.getMonth() + 1) })
  }

  const { data: tiers = EMPTY_ARRAY } = useQuery<CalendarTier[]>({
    queryKey: ['company-sales-calendar', companyId, year, month],
    queryFn: () => apiFetch(`/announcements/calendar?year=${year}&month=${month}&companyId=${companyId}`),
    enabled: view === 'calendar',
    staleTime: 5 * 60_000,
  })

  const { data: myInterests = EMPTY_ARRAY } = useQuery<SaleInterest[]>({
    queryKey: ['sale-interests'],
    queryFn: () => authFetch('/sale-interests'),
    enabled: view === 'calendar' && !!user,
  })
  // Local, instantly-mutable copy of the interest set — reseeded whenever the query refetches,
  // but also updated synchronously on bell toggle (see onSaleInterestToggle) so the "mine" glow
  // doesn't wait on a round-trip refetch to catch up with what the bell itself already shows.
  const [myInterestedTierIds, setMyInterestedTierIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    setMyInterestedTierIds(new Set(myInterests.map(i => i.saleTier?.id).filter((id): id is string => !!id)))
  }, [myInterests])

  function handleSaleInterestToggle(tierId: string, isInterested: boolean) {
    setMyInterestedTierIds(prev => {
      const next = new Set(prev)
      if (isInterested) next.add(tierId)
      else next.delete(tierId)
      return next
    })
  }

  const salesForDay = (day: number): CalendarSaleItem[] =>
    tiers
      .filter(t => {
        const d = new Date(t.date)
        return d.getFullYear() === year && d.getMonth() === month0 && d.getDate() === day
      })
      .map(t => {
        const d = new Date(t.date)
        const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        return {
          id: t.tierId,
          label: t.announcement.title,
          companyName: t.announcement.company?.name ?? null,
          brandColors: t.announcement.company?.brandColors ?? null,
          hue: strHue(t.announcement.company?.name ?? t.tierId),
          tierName: t.region ? `${t.name} · ${t.region.name}` : t.name,
          time,
          href: `/sale-announcements/${t.announcement.id}`,
          highlight: myInterestedTierIds.has(t.tierId) ? 'mine' : null,
          stageBadge: t.stageTotal > 1
            ? (t.multiRegion && t.region ? `${t.region.name} ${t.stageIndex}/${t.stageTotal}` : `${t.stageIndex}/${t.stageTotal}`)
            : null,
          announcementId: t.announcement.id,
          regionId: t.region?.id ?? null,
        }
      })

  function handleDownload() {
    const origin = window.location.origin
    const events: CalendarExportEvent[] = tiers.map(t => ({
      id: `sale-${t.tierId}`,
      title: t.announcement.title,
      description: [t.name, t.region?.name].filter(Boolean).join(' · '),
      url: `${origin}/sale-announcements/${t.announcement.id}`,
      date: t.date,
    }))
    downloadIcsCalendar(
      events,
      `${tiers[0]?.announcement.company?.name ?? 'Company'} — ${monthLabel}`,
      `sales-calendar-${year}-${String(month).padStart(2, '0')}.ics`,
    )
    trackEvent('/analytics/sales-calendar-ics-download', { companyId, companyName: companyName ?? companyId })
  }

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['company-sale-announcements', companyId, tab, debouncedSearch],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        companyId,
        pageSize: String(PAGE_SIZE),
        sort: 'date-desc',
        page: String(pageParam),
      })
      if (tab === 'live') params.set('upcoming', 'true')
      else params.set('pastOnly', 'true')
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      return apiFetch<PaginatedResponse<ListSaleAnnouncement>>(`/announcements?${params}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
    staleTime: 30_000,
    enabled: view !== 'calendar',
  })

  const announcements = data?.pages.flatMap((p) => p.data) ?? []
  const isEmpty = !isLoading && announcements.length === 0

  return (
    <div>
      {/* Filters row — same shape as the site-wide /sale-announcements toolbar */}
      <div className="flex flex-wrap gap-3 mb-6">
        {view !== 'calendar' && (
          <>
            <div className="relative flex-1 min-w-[180px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-500 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search announcements…"
                className="w-full bg-navy-800 border border-navy-700 rounded-xl pl-9 pr-4 py-2.5 text-navy-100 placeholder-navy-500 focus:outline-none focus:border-brand-500 text-sm"
              />
            </div>

            <div className="inline-flex items-center gap-1 rounded-xl border border-navy-700 bg-navy-800 p-1 shrink-0">
              <button
                onClick={() => setTab('live')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'live' ? 'bg-navy-700 text-brand-400' : 'text-navy-400 hover:text-navy-200'}`}
              >
                Live &amp; Upcoming
              </button>
              <button
                onClick={() => setTab('past')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'past' ? 'bg-navy-700 text-brand-400' : 'text-navy-400 hover:text-navy-200'}`}
              >
                Past
              </button>
            </div>
          </>
        )}

        <div className="flex items-center gap-1 bg-navy-800 border border-navy-700 rounded-xl px-1 shrink-0">
          <button
            onClick={() => setView('grid')}
            className={`p-1.5 rounded transition-colors ${view === 'grid' ? 'bg-navy-700 text-brand-400' : 'text-navy-500 hover:text-navy-300'}`}
            aria-label="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('list')}
            className={`p-1.5 rounded transition-colors ${view === 'list' ? 'bg-navy-700 text-brand-400' : 'text-navy-500 hover:text-navy-300'}`}
            aria-label="List view"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`p-1.5 rounded transition-colors ${view === 'calendar' ? 'bg-navy-700 text-brand-400' : 'text-navy-500 hover:text-navy-300'}`}
            aria-label="Calendar view"
          >
            <CalendarDays className="w-4 h-4" />
          </button>
        </div>
      </div>

      {view === 'calendar' ? (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={handleDownload}
              disabled={tiers.length === 0}
              title={`Includes only what's shown for ${monthLabel} — switch months and download again to get other periods.`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-navy-800 hover:bg-navy-700 border border-navy-700 text-navy-300 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Download size={13} />
              <span className="hidden sm:inline">Download {monthLabel}</span>
              <span className="sm:hidden">Download</span>
            </button>
          </div>
          <CalendarGrid
            year={year}
            month0={month0}
            monthLabel={monthLabel}
            lightMode={theme === 'light'}
            onPrevMonth={() => setViewDate(new Date(year, month0 - 1, 1))}
            onNextMonth={() => setViewDate(new Date(year, month0 + 1, 1))}
            renewalsForDay={() => []}
            salesForDay={salesForDay}
            interestEnabled
            onSaleInterestToggle={handleSaleInterestToggle}
          />
          {tiers.length === 0 && (
            <p className="text-center text-navy-500 py-8 text-sm">No sales for {monthLabel}.</p>
          )}
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-navy-800 bg-navy-900 animate-pulse aspect-[2/3]" />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="text-center py-20 text-navy-500">
          <Megaphone size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">{tab === 'past' ? 'No past announcements.' : 'No live or upcoming announcements.'}</p>
        </div>
      ) : (
        <>
          {view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {announcements.map((a) => <AnnouncementCard key={a.id} a={a} />)}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-navy-800">
              {announcements.map((a) => <AnnouncementListRow key={a.id} a={a} />)}
            </div>
          )}

          {hasNextPage && (
            <div className="flex justify-center pt-8">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-6 py-2.5 rounded-xl bg-navy-800 hover:bg-navy-700 text-navy-300 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading…' : 'Show more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
