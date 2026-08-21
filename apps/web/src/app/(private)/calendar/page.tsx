'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Bell, TrendingUp, Download } from 'lucide-react'
import Link from 'next/link'
import { useTheme } from '@/components/ThemeProvider'
import { useAuth } from '@/components/AuthProvider'
import { brandGradientStyle } from '@/lib/brandGradient'
import { useBrandColors } from '@/lib/useBrandColors'
import { resolveInterestDate } from '@/lib/saleTiers'
import { strHue, pillStyle } from '@/lib/calendarPills'
import { downloadIcsCalendar, type CalendarExportEvent } from '@/lib/ics'
import { trackEvent } from '@/lib/trackEvent'
import { renewalDayInMonth, type CalEntry } from '@/lib/renewalDayInMonth'
import CalendarGrid, { CalendarRenewalItem, CalendarSaleItem } from '@/components/calendar/CalendarGrid'

interface SaleInterest {
  announcementId: string
  selectedPrice: string | null
  selectedPriceCurrency: string | null
  /** The concrete tier this interest points at — its date IS the resolved date, no
   *  FA/EA/GS fallback-chain needed. Null for interests that predate the tier migration
   *  and haven't been backfilled. */
  saleTier: { id: string; name: string; date: string; regionId: string | null } | null
  announcement: {
    id: string
    title: string
    imageUrl: string | null
    basePrice: string | null
    currency: string | null
    company: { id: string; name: string; slug: string; logoUrl: string | null; brandColors?: string[] | null } | null
  }
}

export default function CalendarPage() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const getBrandColors = useBrandColors()
  const lightMode = theme === 'light'
  const preferredCurrency = (user?.preferredCurrency ?? 'EUR').toUpperCase()
  const today = new Date()
  const [viewDate, setViewDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  )

  const { data: entries = [] } = useQuery<CalEntry[]>({
    queryKey: ['my-calendar-subscriptions'],
    queryFn: () => authFetch('/subscriptions/my/calendar'),
  })

  const { data: interests = [] } = useQuery<SaleInterest[]>({
    queryKey: ['sale-interests'],
    queryFn: () => authFetch('/sale-interests'),
  })

  const activeEntries = useMemo(
    () => entries.filter(e => e.active && (e.renewalDay ?? e.subscription.renewalDay)),
    [entries],
  )

  const year = viewDate.getFullYear()
  const month0 = viewDate.getMonth()

  const prevMonth = () => setViewDate(new Date(year, month0 - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month0 + 1, 1))

  const monthLabel = viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const renewalsForDay = (day: number): CalendarRenewalItem[] =>
    activeEntries
      .filter(e => renewalDayInMonth(e, year, month0) === day)
      .map(e => ({
        id: e.id,
        label: e.subscription.name,
        companyName: e.subscription.company?.name ?? null,
        brandColors: getBrandColors(e.subscription.company?.slug) ?? e.subscription.company?.brandColors ?? null,
        hue: strHue(e.subscription.company?.slug ?? e.subscription.slug),
        href: `/subscriptions/${e.subscription.slug}`,
      }))

  const salesForDay = (day: number): CalendarSaleItem[] =>
    interests
      .filter(i => {
        const dateStr = resolveInterestDate(i)
        if (!dateStr) return false
        const d = new Date(dateStr)
        return d.getFullYear() === year && d.getMonth() === month0 && d.getDate() === day
      })
      .map(i => {
        const dateStr = resolveInterestDate(i)
        let time: string | null = null
        if (dateStr) {
          try {
            const d = new Date(dateStr)
            const h = String(d.getHours()).padStart(2, '0')
            const m = String(d.getMinutes()).padStart(2, '0')
            time = `${h}:${m}`
          } catch { /* ignore */ }
        }
        return {
          id: i.announcementId,
          label: i.announcement.title,
          companyName: i.announcement.company?.name ?? null,
          brandColors: getBrandColors(i.announcement.company?.slug) ?? i.announcement.company?.brandColors ?? null,
          hue: strHue(i.announcement.company?.name ?? i.announcementId),
          tierName: i.saleTier?.name ?? 'General Sale',
          time,
          href: `/sale-announcements/${i.announcementId}`,
        }
      })

  // ─── Spending estimate for displayed month ───────────────────────────────
  const monthRenewals = useMemo(() => {
    const byCurrency: Record<string, { total: number; names: string[] }> = {}
    for (const entry of activeEntries) {
      if (renewalDayInMonth(entry, year, month0) === null) continue
      const amount = entry.nextRenewalAmount ? parseFloat(entry.nextRenewalAmount) : null
      const currency = entry.nextRenewalCurrency?.toUpperCase()
      if (amount == null || isNaN(amount) || !currency) continue
      if (!byCurrency[currency]) byCurrency[currency] = { total: 0, names: [] }
      byCurrency[currency].total += amount
      byCurrency[currency].names.push(entry.subscription.name)
    }
    return byCurrency
  }, [activeEntries, year, month0])

  const monthSales = useMemo(() => {
    const byCurrency: Record<string, { total: number; names: string[] }> = {}
    for (const i of interests) {
      const dateStr = resolveInterestDate(i)
      if (!dateStr) continue
      const d = new Date(dateStr)
      if (d.getFullYear() !== year || d.getMonth() !== month0) continue
      // Use selectedPrice (subscriber/custom price user chose) if available, otherwise fall back to announcement basePrice
      const rawPrice = i.selectedPrice ?? i.announcement.basePrice
      const rawCurrency = i.selectedPriceCurrency ?? i.announcement.currency
      if (rawPrice == null || !rawCurrency) continue
      const key = rawCurrency.toUpperCase()
      const price = parseFloat(String(rawPrice))
      if (isNaN(price)) continue
      if (!byCurrency[key]) byCurrency[key] = { total: 0, names: [] }
      byCurrency[key].total += price
      byCurrency[key].names.push(i.announcement.title)
    }
    return byCurrency
  }, [interests, year, month0])

  const foreignCurrencies = useMemo(() => {
    const set = new Set<string>()
    Object.keys(monthRenewals).forEach(c => set.add(c))
    Object.keys(monthSales).forEach(c => set.add(c))
    return Array.from(set).filter(c => c !== preferredCurrency)
  }, [monthRenewals, monthSales, preferredCurrency])

  const rateResults = useQueries({
    queries: foreignCurrencies.map(from => ({
      queryKey: ['fx-rate', from, preferredCurrency],
      queryFn: () => authFetch<{ rate: number }>(`/currency/rate?from=${from}&to=${preferredCurrency}`),
      staleTime: 1000 * 60 * 60,
    })),
  })

  const rates = useMemo(() => {
    const r: Record<string, number> = { [preferredCurrency]: 1 }
    foreignCurrencies.forEach((currency, i) => {
      const data = rateResults[i]?.data as { rate?: number } | undefined
      if (data?.rate) r[currency] = data.rate
    })
    return r
  }, [foreignCurrencies, rateResults, preferredCurrency])

  const fmt = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)

  const allRatesLoaded= foreignCurrencies.every((_, i) => rateResults[i]?.data != null)
  const hasSpending = Object.keys(monthRenewals).length > 0 || Object.keys(monthSales).length > 0

  const combinedByCurrency = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const [c, { total }] of Object.entries(monthRenewals)) acc[c] = (acc[c] ?? 0) + total
    for (const [c, { total }] of Object.entries(monthSales)) acc[c] = (acc[c] ?? 0) + total
    return acc
  }, [monthRenewals, monthSales])

  const grandTotal = useMemo(
    () => Object.entries(combinedByCurrency).reduce((sum, [c, total]) => {
      const rate = rates[c]
      return rate != null ? sum + total * rate : sum
    }, 0),
    [combinedByCurrency, rates],
  )

  const hasEventsThisMonth = activeEntries.some(e => renewalDayInMonth(e, year, month0) !== null)
    || interests.some(i => {
      const dateStr = resolveInterestDate(i)
      if (!dateStr) return false
      const d = new Date(dateStr)
      return d.getFullYear() === year && d.getMonth() === month0
    })

  function handleDownload() {
    const origin = window.location.origin
    const events: CalendarExportEvent[] = []

    for (const entry of activeEntries) {
      const day = renewalDayInMonth(entry, year, month0)
      if (day == null) continue
      events.push({
        id: `renewal-${entry.id}-${year}-${month0 + 1}`,
        title: `${entry.subscription.name} renewal`,
        description: entry.subscription.company?.name,
        url: `${origin}/subscriptions/${entry.subscription.slug}`,
        allDayDate: { year, month: month0 + 1, day },
      })
    }

    for (const i of interests) {
      const dateStr = resolveInterestDate(i)
      if (!dateStr) continue
      const d = new Date(dateStr)
      if (d.getFullYear() !== year || d.getMonth() !== month0) continue
      events.push({
        id: `sale-${i.saleTier?.id ?? i.announcementId}`,
        title: i.announcement.title,
        description: [i.saleTier?.name ?? 'General Sale', i.announcement.company?.name].filter(Boolean).join(' · '),
        url: `${origin}/sale-announcements/${i.announcementId}`,
        date: dateStr,
      })
    }

    downloadIcsCalendar(
      events,
      `My LuxGrimoire Calendar — ${monthLabel}`,
      `my-calendar-${year}-${String(month0 + 1).padStart(2, '0')}.ics`,
    )
    trackEvent('/analytics/calendar-ics-download')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-serif text-navy-100">Calendar</h1>
        <button
          onClick={handleDownload}
          disabled={!hasEventsThisMonth}
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
        lightMode={lightMode}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        renewalsForDay={renewalsForDay}
        salesForDay={salesForDay}
      />

      {/* Monthly spending estimate */}
      {hasSpending && (
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-brand-400/70" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-navy-400">
              Expected spending · {monthLabel}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Renewals */}
            {Object.keys(monthRenewals).length > 0 && (
              <div className="bg-navy-950/50 rounded-lg p-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-navy-500 font-semibold">Renewals</p>
                {Object.entries(monthRenewals).map(([currency, { total, names }]) => (
                  <div key={currency} className="flex items-center justify-between gap-2">
                    <p className="text-xs text-navy-400 truncate flex-1" title={names.join(', ')}>
                      {names.length === 1 ? names[0] : `${names.length} subscriptions`}
                    </p>
                    <p className="text-xs font-semibold text-navy-200 shrink-0">{fmt(total, currency)}</p>
                  </div>
                ))}
                {Object.keys(monthRenewals).length > 1 && (
                  <div className="border-t border-navy-800 pt-1.5 flex justify-between">
                    <p className="text-[10px] text-navy-500">subtotal</p>
                    <p className="text-[10px] text-navy-400">
                      {Object.entries(monthRenewals).map(([c, { total }]) => fmt(total, c)).join(' + ')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Sale announcements */}
            {Object.keys(monthSales).length > 0 && (
              <div className="bg-navy-950/50 rounded-lg p-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-navy-500 font-semibold">Sale Announcements</p>
                {Object.entries(monthSales).map(([currency, { total, names }]) => (
                  <div key={currency} className="flex items-center justify-between gap-2">
                    <p className="text-xs text-navy-400 truncate flex-1" title={names.join(', ')}>
                      {names.length === 1 ? names[0] : `${names.length} sales`}
                    </p>
                    <p className="text-xs font-semibold text-navy-200 shrink-0">{fmt(total, currency)}</p>
                  </div>
                ))}
                {Object.keys(monthSales).length > 1 && (
                  <div className="border-t border-navy-800 pt-1.5 flex justify-between">
                    <p className="text-[10px] text-navy-500">subtotal</p>
                    <p className="text-[10px] text-navy-400">
                      {Object.entries(monthSales).map(([c, { total }]) => fmt(total, c)).join(' + ')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Total in preferred currency */}
          {hasSpending && (
            <div className="border-t border-navy-800 pt-3 flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-widest text-navy-500">
                  Total in {preferredCurrency}
                  {!allRatesLoaded && foreignCurrencies.length > 0 && (
                    <span className="ml-1 text-navy-600">(loading rates…)</span>
                  )}
                </p>
                {Object.keys(combinedByCurrency).length > 1 && (
                  <p className="text-[10px] text-navy-600 mt-0.5">
                    {Object.entries(combinedByCurrency).map(([c, t]) => fmt(t, c)).join(' + ')}
                  </p>
                )}
              </div>
              {allRatesLoaded && (
                <p className="text-xl font-serif font-bold text-brand-400">
                  ~{fmt(grandTotal, preferredCurrency)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {activeEntries.length === 0 && interests.length === 0 && (
        <p className="text-center text-navy-500 py-8 text-sm">
          No active subscriptions.{' '}
          <Link href="/subscriptions" className="text-brand-400 underline">
            Browse subscriptions →
          </Link>
        </p>
      )}

      {/* Upcoming sales list */}
      {interests.length > 0 && (() => {
        const todayStr = today.toISOString().slice(0, 10)
        const sorted = [...interests]
          .map(i => ({ interest: i, dateStr: resolveInterestDate(i) }))
          .filter(({ dateStr }) => !!dateStr)
          .sort((a, b) => (a.dateStr! < b.dateStr! ? -1 : 1))
        const upcoming = sorted.filter(({ dateStr }) => dateStr! >= todayStr)
        return (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-navy-400">Sales you&apos;re interested in</h2>
            <div className="space-y-1">
              {upcoming.length === 0 && (
                <p className="text-sm text-navy-500 italic">No upcoming sales tracked.</p>
              )}
              {upcoming.map(({ interest: i, dateStr }) => {
                const d = new Date(dateStr!)
                const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                const hue = strHue(i.announcement.company?.name ?? i.announcementId)
                const bc = i.announcement.company?.brandColors ?? null
                const bStyle = pillStyle(bc, hue, 'sale', lightMode)
                return (
                  <Link
                    key={i.saleTier?.id ?? i.announcementId}
                    href={`/sale-announcements/${i.announcementId}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg border hover:opacity-90 transition-opacity group overflow-hidden min-w-0"
                    style={bStyle}
                  >
                    <Bell size={13} style={{ color: 'currentColor' }} className="shrink-0 opacity-80 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug" style={{ color: 'currentColor' }}>{i.announcement.title}</p>
                      {i.announcement.company && (
                        <p className="text-xs opacity-70">{i.announcement.company.name}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0 self-start max-w-[40%]">
                      <p className="text-xs font-semibold opacity-95 whitespace-normal break-words">{i.saleTier?.name ?? 'General Sale'}</p>
                      <p className="text-xs opacity-75 whitespace-nowrap">{label}{time !== '00:00' ? ` · ${time}` : ''}</p>
                    </div>
                  </Link>
                )
              })}

            </div>
          </div>
        )
      })()}
    </div>
  )
}
