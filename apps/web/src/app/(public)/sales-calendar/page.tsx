'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { authFetch } from '@/lib/authFetch'
import { CalendarDays, Download } from 'lucide-react'
import { useTheme } from '@/components/ThemeProvider'
import { useAuth } from '@/components/AuthProvider'
import { useBrandColors } from '@/lib/useBrandColors'
import { strHue } from '@/lib/calendarPills'
import { downloadIcsCalendar, type CalendarExportEvent } from '@/lib/ics'
import { renewalDayInMonth, type CalEntry } from '@/lib/renewalDayInMonth'
import CalendarGrid, { CalendarRenewalItem, CalendarSaleItem } from '@/components/calendar/CalendarGrid'

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

interface CalendarRenewal {
  subscriptionId: string
  slug: string
  name: string
  logoUrl: string | null
  coverImage: string | null
  day: number
  company: { id: string; name: string; slug: string; brandColors: string[] | null }
}

interface SaleInterest {
  announcementId: string
  saleTier: { id: string } | null
}

type TypeFilter = 'all' | 'renewals' | 'sales'

export default function SalesCalendarPage() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const getBrandColors = useBrandColors()
  const lightMode = theme === 'light'

  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [companyId, setCompanyId] = useState('')

  const year = viewDate.getFullYear()
  const month0 = viewDate.getMonth()
  const month = month0 + 1

  const prevMonth = () => setViewDate(new Date(year, month0 - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month0 + 1, 1))
  const monthLabel = viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const { data: companies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['companies-names'],
    queryFn: () => apiFetch('/companies/names'),
    staleTime: 5 * 60_000,
  })

  const { data: tiers = [], isLoading: tiersLoading } = useQuery<CalendarTier[]>({
    queryKey: ['sales-calendar-tiers', year, month],
    queryFn: () => apiFetch(`/announcements/calendar?year=${year}&month=${month}`),
  })

  const { data: renewals = [], isLoading: renewalsLoading } = useQuery<CalendarRenewal[]>({
    queryKey: ['sales-calendar-renewals', year, month],
    queryFn: () => apiFetch(`/subscriptions/calendar?year=${year}&month=${month}`),
  })

  // Personal overlay — only fetched when logged in (never triggers authFetch's 401-redirect for
  // guests browsing this public page, since these queries stay disabled without a user).
  const { data: myEntries = [] } = useQuery<CalEntry[]>({
    queryKey: ['my-calendar-subscriptions'],
    queryFn: () => authFetch('/subscriptions/my/calendar'),
    enabled: !!user,
  })
  const { data: myInterests = [] } = useQuery<SaleInterest[]>({
    queryKey: ['sale-interests'],
    queryFn: () => authFetch('/sale-interests'),
    enabled: !!user,
  })

  const myActiveEntryBySubId = useMemo(() => {
    const map = new Map<string, CalEntry>()
    for (const e of myEntries) if (e.active) map.set(e.subscription.id, e)
    return map
  }, [myEntries])
  const myInterestedTierIds = useMemo(
    () => new Set(myInterests.map(i => i.saleTier?.id).filter((id): id is string => !!id)),
    [myInterests],
  )

  const filteredTiers = useMemo(
    () => tiers.filter(t => !companyId || t.announcement.company?.id === companyId),
    [tiers, companyId],
  )
  const filteredRenewals = useMemo(
    () => renewals.filter(r => !companyId || r.company.id === companyId),
    [renewals, companyId],
  )

  const renewalsForDay = (day: number): CalendarRenewalItem[] => {
    if (typeFilter === 'sales') return []
    return filteredRenewals
      .filter(r => r.day === day)
      .map(r => {
        const myEntry = myActiveEntryBySubId.get(r.subscriptionId)
        const highlight: CalendarRenewalItem['highlight'] = !myEntry
          ? null
          : renewalDayInMonth(myEntry, year, month0) === day ? 'mine' : 'skipped'
        return {
          id: r.subscriptionId,
          label: r.name,
          companyName: r.company.name,
          brandColors: getBrandColors(r.company.slug) ?? r.company.brandColors ?? null,
          hue: strHue(r.company.slug ?? r.slug),
          href: `/subscriptions/${r.slug}`,
          highlight,
        }
      })
  }

  const salesForDay = (day: number): CalendarSaleItem[] => {
    if (typeFilter === 'renewals') return []
    return filteredTiers
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
          brandColors: getBrandColors(t.announcement.company?.slug) ?? t.announcement.company?.brandColors ?? null,
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
  }

  const hasAnyEvents = filteredTiers.length > 0 || filteredRenewals.length > 0
  const isLoading = tiersLoading || renewalsLoading

  function handleDownload() {
    const origin = window.location.origin
    const events: CalendarExportEvent[] = []

    if (typeFilter !== 'sales') {
      for (const r of filteredRenewals) {
        events.push({
          id: `renewal-${r.subscriptionId}-${year}-${month}`,
          title: `${r.name} renewal`,
          description: r.company.name,
          url: `${origin}/subscriptions/${r.slug}`,
          allDayDate: { year, month, day: r.day },
        })
      }
    }
    if (typeFilter !== 'renewals') {
      for (const t of filteredTiers) {
        events.push({
          id: `sale-${t.tierId}`,
          title: t.announcement.title,
          description: [t.name, t.region?.name, t.announcement.company?.name].filter(Boolean).join(' · '),
          url: `${origin}/sale-announcements/${t.announcement.id}`,
          date: t.date,
        })
      }
    }

    downloadIcsCalendar(
      events,
      `LuxGrimoire — ${monthLabel}`,
      `luxgrimoire-sales-calendar-${year}-${String(month).padStart(2, '0')}.ics`,
    )
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <CalendarDays size={24} className="text-brand-400" />
        <h1 className="text-3xl font-serif font-bold text-navy-100">Sales &amp; Renewals Calendar</h1>
      </div>
      <p className="text-sm text-navy-500 mb-6">
        Every book box sale and subscription renewal, across every company, in one place.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1 bg-navy-800 border border-navy-700 rounded-xl px-1 py-1">
          {(['all', 'renewals', 'sales'] as TypeFilter[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                typeFilter === t ? 'bg-navy-700 text-brand-400' : 'text-navy-400 hover:text-navy-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <select
          value={companyId}
          onChange={e => setCompanyId(e.target.value)}
          className="bg-navy-800 border border-navy-700 rounded-xl px-3 py-2 text-sm text-navy-300 focus:outline-none focus:border-brand-500 min-w-[160px]"
        >
          <option value="">All companies</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <CalendarGrid
        year={year}
        month0={month0}
        monthLabel={monthLabel}
        lightMode={lightMode}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        renewalsForDay={renewalsForDay}
        salesForDay={salesForDay}
        interestEnabled
      />

      {!isLoading && !hasAnyEvents && (
        <p className="text-center text-navy-500 py-8 text-sm">
          No {typeFilter === 'all' ? 'events' : typeFilter} found for {monthLabel}
          {companyId ? ` from ${companies.find(c => c.id === companyId)?.name ?? 'this company'}` : ''}.
        </p>
      )}

      {/* Download */}
      <div className="mt-6 flex flex-col items-center gap-1.5">
        <button
          onClick={handleDownload}
          disabled={!hasAnyEvents}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-800 hover:bg-navy-700 border border-navy-700 text-navy-200 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={15} />
          Download {monthLabel} events
        </button>
        <p className="text-xs text-navy-600 text-center max-w-sm">
          Includes only what&apos;s shown above for {monthLabel} — switch months and download again to get other periods.
        </p>
      </div>
    </div>
  )
}
