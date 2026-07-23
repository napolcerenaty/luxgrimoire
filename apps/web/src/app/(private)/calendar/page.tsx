'use client'

import { useState, useMemo, useRef } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Bell, RefreshCw, X, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useTheme } from '@/components/ThemeProvider'
import { useAuth } from '@/components/AuthProvider'
import { brandGradientStyle } from '@/lib/brandGradient'
import { useBrandColors } from '@/lib/useBrandColors'

interface CalEntry {
  id: string
  active: boolean
  startDate: string | null
  renewalDay: number | null
  nextRenewalAmount: string | null
  nextRenewalCurrency: string | null
  skipRecords: { month: { year: number; month: number } }[]
  subscription: {
    slug: string
    name: string
    logoUrl: string | null
    coverImage: string | null
    intervalMonths: number
    startingMonth: number
    renewalDay: number | null
    renewalMonthOffset: number
    startDate: Date | string | null
    company: { name: string; slug: string; brandColors?: string[] | null }
  }
}

interface SaleInterest {
  announcementId: string
  tier: 'FA' | 'EA' | 'GS'
  regionId: string | null
  selectedPrice: string | null
  selectedPriceCurrency: string | null
  announcement: {
    id: string
    title: string
    imageUrl: string | null
    basePrice: string | null
    currency: string | null
    firstAccessDate: string | null
    earlyAccessDate: string | null
    generalSaleDate: string | null
    saleTimezone: string | null
    company: { id: string; name: string; slug: string; logoUrl: string | null; brandColors?: string[] | null } | null
    regions: Array<{
      id: string
      isDefault: boolean
      firstAccessDate: string | null
      earlyAccessDate: string | null
      generalSaleDate: string | null
      saleTimezone: string | null
    }>
  }
}

const TIER_LABELS: Record<'FA' | 'EA' | 'GS', string> = {
  FA: 'First Access',
  EA: 'Early Access',
  GS: 'General Sale',
}

// Deterministic hue from a string (same as old-approach)
function strHue(str?: string | null) {
  let h = 0
  for (let i = 0; i < (str?.length ?? 0); i++) h = (h * 31 + str!.charCodeAt(i)) & 0xffff
  return h % 360
}

/** Relative luminance (0=black, 1=white) of a #rrggbb hex color. */
function hexLuminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0.5
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const r = lin(parseInt(hex.slice(1, 3), 16) / 255)
  const g = lin(parseInt(hex.slice(3, 5), 16) / 255)
  const b = lin(parseInt(hex.slice(5, 7), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Returns inline style for a calendar pill.
 *  variant='sale'    → filled background (brand primary color)
 *  variant='renewal' → outline only (transparent bg, border in brand primary color)
 *  lightMode: adapt for light calendar background
 *
 *  Text color is chosen via luminance so both light-brand (lavender) and dark-brand (near-black)
 *  pills stay readable in both themes.
 */
function pillStyle(
  brandColors: string[] | null | undefined,
  hue: number,
  variant: 'renewal' | 'sale',
  lightMode = false,
) {
  const isFilled = variant === 'sale'
  // Always use primary brand color (brandColors[0])
  const c = brandColors?.[0]

  if (c) {
    // lum > 0.25 → "light" brand (pastels, light teal) → needs dark text to contrast
    const isLightBrand = hexLuminance(c) > 0.25

    if (lightMode) {
      // Dilute the brand color heavily so even very dark brands produce a light enough background.
      // Always use near-black text — any 55%-diluted color will have sufficient contrast.
      const bg = `color-mix(in srgb, ${c} 55%, #dce8f4)`
      const borderColor = `color-mix(in srgb, ${c} 65%, #444444)`
      const outlineText = `color-mix(in srgb, ${c} 80%, #1a1a2e)`
      return isFilled
        ? { background: bg, color: '#1a1a2e', border: `1px solid ${borderColor}` }
        : { background: 'transparent', color: outlineText, border: `1px solid ${borderColor}` }
    }

    // Dark mode: light brands get a more transparent bg so the dark calendar bg bleeds through,
    // darkening the effective pill colour enough for dark text to contrast.
    const bgOpacity = isLightBrand ? '99' : 'cc' // 60% vs 80%
    const textColor = isLightBrand
      ? `color-mix(in srgb, ${c} 15%, #111111)` // dark text on light-brand pill
      : `color-mix(in srgb, ${c} 25%, #f0ece6)` // light text on dark-brand pill
    // Renewal (outline) colors: dark brands need a much lighter mix so they're visible on dark bg
    const outlineColor = isLightBrand
      ? `color-mix(in srgb, ${c} 55%, #c0b8d4)`
      : `color-mix(in srgb, ${c} 30%, #b0cce0)` // heavily diluted toward light for dark brands
    const outlineBorder = isLightBrand
      ? `${c}cc`
      : `color-mix(in srgb, ${c} 40%, #7ab0cc)` // ensure visible border for dark brands
    return isFilled
      ? { background: `${c}${bgOpacity}`, color: textColor, border: `1px solid ${c}` }
      : { background: 'transparent', color: outlineColor, border: `1px solid ${outlineBorder}` }
  }

  // Fallback: hue-based
  if (lightMode) {
    return isFilled
      ? { background: `hsla(${hue},60%,60%,0.55)`, color: `hsl(${hue},80%,15%)`, border: `1px solid hsla(${hue},60%,35%,0.9)` }
      : { background: 'transparent', color: `hsl(${hue},80%,28%)`, border: `1px solid hsla(${hue},60%,35%,0.55)` }
  }
  return isFilled
    ? { background: `hsla(${hue},55%,50%,0.80)`, color: `hsl(${hue},80%,95%)`, border: `1px solid hsla(${hue},55%,65%,0.90)` }
    : { background: 'transparent', color: `hsl(${hue},80%,75%)`, border: `1px solid hsla(${hue},55%,65%,0.55)` }
}

// month0 is 0-indexed (JavaScript Date convention)
function renewalDayInMonth(entry: CalEntry, year: number, month0: number): number | null {
  const sub = entry.subscription
  const renewalDay = entry.renewalDay ?? sub.renewalDay
  if (!renewalDay) return null

  // Don't show renewals before the user's join date
  if (entry.startDate) {
    const startYear = parseInt(entry.startDate.slice(0, 4))
    const startMonth0 = parseInt(entry.startDate.slice(5, 7)) - 1
    if (year < startYear || (year === startYear && month0 < startMonth0)) return null
  }

  // Don't show renewals before the subscription's own start date (e.g. future subscriptions)
  if (sub.startDate) {
    const sd = typeof sub.startDate === 'string' ? sub.startDate : (sub.startDate as Date).toISOString()
    const subStartYear = parseInt(sd.slice(0, 4))
    const subStartMonth0 = parseInt(sd.slice(5, 7)) - 1
    if (year < subStartYear || (year === subStartYear && month0 < subStartMonth0)) return null
  }

  const interval = sub.intervalMonths ?? 1
  if (interval > 1) {
    const step = interval
    const startMonthIdx = ((sub.startingMonth ?? 1) - 1) % step
    if (((month0 - startMonthIdx) % step + step) % step !== 0) return null
  }

  // A renewal in calendar month (year, month0) pays for box month = renewal month + offset.
  // If that box month is skipped, no renewal fires for this calendar month.
  const offset = sub.renewalMonthOffset ?? 0
  if (offset !== 0 || (entry.skipRecords?.length ?? 0) > 0) {
    const rawBox = month0 + 1 + offset  // 1-indexed, may exceed 12
    const boxYear = year + Math.floor((rawBox - 1) / 12)
    const boxMonth = ((rawBox - 1) % 12) + 1
    const isSkipped = (entry.skipRecords ?? []).some(
      r => r.month.year === boxYear && r.month.month === boxMonth,
    )
    if (isSkipped) return null
  }

  return renewalDay
}

/** Resolve tier date for a sale interest, using stored regionId if available.
 * Mirrors SaleInterestsService.resolveTierDate on the backend: falls back to the sale's default
 * region when no regionId is stored (not just when one is), and every tier falls back to *any*
 * other known date, not just "later" ones — otherwise a GS-tier interest with no generalSaleDate
 * set (only FA/EA known so far) would resolve to null and vanish from the calendar entirely. */
function resolveInterestDate(interest: SaleInterest): string | null {
  const a = interest.announcement
  const regions = a.regions ?? []
  const region = (interest.regionId ? regions.find(r => r.id === interest.regionId) : null)
    ?? (regions.length > 0 ? (regions.find(r => r.isDefault) ?? regions[0]) : null)

  const FA = region?.firstAccessDate ?? a.firstAccessDate
  const EA = region?.earlyAccessDate ?? a.earlyAccessDate
  const GS = region?.generalSaleDate ?? a.generalSaleDate

  if (interest.tier === 'FA') return FA ?? EA ?? GS
  if (interest.tier === 'EA') return EA ?? GS ?? FA
  return GS ?? EA ?? FA
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
  const [tooltip, setTooltip] = useState<{
    label: string
    subtitle?: string
    hue: number
    type: 'renewal' | 'sale'
    x: number
    y: number
  } | null>(null)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mobile tap-to-detail: selected day for agenda view
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

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

  // Mon–Sun header (2024-01-01 = Monday)
  const dayNames = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, i + 1).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2),
      ),
    [],
  )

  // 42-cell Mon-based grid
  const cells = useMemo(() => {
    const firstDow = new Date(year, month0, 1).getDay()
    const startPad = (firstDow + 6) % 7 // Mon=0
    const daysInMonth = new Date(year, month0 + 1, 0).getDate()
    const daysInPrev = new Date(year, month0, 0).getDate()
    const arr: { day: number; current: boolean }[] = []
    for (let i = startPad - 1; i >= 0; i--) arr.push({ day: daysInPrev - i, current: false })
    for (let d = 1; d <= daysInMonth; d++) arr.push({ day: d, current: true })
    let nd = 1
    while (arr.length < 42) arr.push({ day: nd++, current: false })
    return arr
  }, [year, month0])

  const renewalsForDay = (day: number) =>
    activeEntries
      .filter(e => renewalDayInMonth(e, year, month0) === day)
      .map(e => ({
        id: e.id,
        label: e.subscription.name,
        companyName: e.subscription.company?.name ?? null,
        brandColors: getBrandColors(e.subscription.company?.slug) ?? e.subscription.company?.brandColors ?? null,
        slug: e.subscription.slug,
        hue: strHue(e.subscription.company?.slug ?? e.subscription.slug),
        logoUrl: e.subscription.logoUrl ?? e.subscription.coverImage,
      }))

  const salesForDay = (day: number) =>
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
          tier: i.tier,
          time,
          href: `/sale-announcements/${i.announcementId}`,
        }
      })

  const isToday = (day: number) =>
    day === today.getDate() && month0 === today.getMonth() && year === today.getFullYear()

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

  const openTooltip = (e: React.MouseEvent, label: string, hue: number, type: 'renewal' | 'sale', subtitle?: string) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltip({ label, subtitle, hue, type, x: rect.left, y: rect.bottom + 6 })
  }
  const scheduleClose = () => {
    tooltipTimer.current = setTimeout(() => setTooltip(null), 150)
  }
  const cancelClose = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 min-w-0 overflow-x-hidden">
      <h1 className="text-2xl font-serif text-stone-100">Calendar</h1>

      {/* Month navigation */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg text-stone-400 hover:text-amber-400 hover:bg-stone-800 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-lg font-serif text-stone-100 capitalize">{monthLabel}</h2>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg text-stone-400 hover:text-amber-400 hover:bg-stone-800 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
        {/* Day name headers */}
        <div className="grid grid-cols-7 border-b border-stone-800">
          {dayNames.map(dn => (
            <div
              key={dn}
              className="py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-stone-500"
            >
              {dn}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-stone-800/60">
          {cells.map((cell, idx) => {
            const renewals = cell.current ? renewalsForDay(cell.day) : []
            const sales = cell.current ? salesForDay(cell.day) : []
            const totalEvents = renewals.length + sales.length
            const isSelected = cell.current && selectedDay === cell.day
            return (
              <div
                key={idx}
                className={[
                  'min-h-[48px] sm:min-h-[80px] p-0.5 sm:p-1.5 flex flex-col gap-0.5',
                  cell.current ? 'cursor-pointer sm:cursor-default' : '',
                  !cell.current ? 'bg-stone-950/40' : '',
                  cell.current && isToday(cell.day)
                    ? 'bg-amber-900/30 ring-1 ring-inset ring-amber-600/60'
                    : '',
                  isSelected
                    ? 'sm:bg-transparent sm:ring-0 bg-stone-700/40 ring-1 ring-inset ring-stone-500/50'
                    : '',
                ].filter(Boolean).join(' ')}
                onClick={() => cell.current && setSelectedDay(prev => prev === cell.day ? null : cell.day)}
              >
                <span
                  className={[
                    'text-[9px] sm:text-xs leading-none mb-0.5 w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full shrink-0',
                    !cell.current
                      ? 'text-stone-700'
                      : isToday(cell.day)
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'text-stone-200',
                  ].join(' ')}
                >
                  {cell.day}
                </span>

                {/* Desktop pills */}
                {renewals.map(r => {
                  const ps = pillStyle(r.brandColors, r.hue, 'renewal', lightMode)
                  return (
                    <span key={r.id} className="hidden sm:block">
                      <Link
                        href={`/subscriptions/${r.slug}`}
                        className="flex flex-col rounded px-1 py-0.5 text-[10px] leading-tight truncate transition-opacity hover:opacity-90"
                        style={ps}
                        onMouseEnter={e => openTooltip(e, r.label, r.hue, 'renewal', r.companyName ?? undefined)}
                        onMouseLeave={scheduleClose}
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="flex items-center gap-1 truncate">
                          <RefreshCw size={9} className="shrink-0" />
                          <span className="truncate">{r.label}</span>
                        </span>
                        {r.companyName && totalEvents <= 3 && (
                          <span className="truncate opacity-60 pl-3">{r.companyName}</span>
                        )}
                      </Link>
                    </span>
                  )
                })}

                {sales.map(s => {
                  const ps = pillStyle(s.brandColors, s.hue, 'sale', lightMode)
                  return (
                    <span key={s.id} className="hidden sm:block">
                      <Link
                        href={s.href}
                        className="flex flex-col rounded px-1 py-0.5 text-[10px] leading-tight truncate transition-opacity hover:opacity-90"
                        style={ps}
                        onMouseEnter={e => openTooltip(
                          e,
                          s.label,
                          s.hue,
                          'sale',
                          `${TIER_LABELS[s.tier]}${s.time ? ` · ${s.time}` : ''}${s.companyName ? ` · ${s.companyName}` : ''}`,
                        )}
                        onMouseLeave={scheduleClose}
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="flex items-center gap-1 truncate">
                          <Bell size={9} className="shrink-0" />
                          <span className="truncate">{s.label}</span>
                        </span>
                        {s.companyName && totalEvents <= 3 && (
                          <span className="truncate opacity-60 pl-3">{s.companyName}</span>
                        )}
                      </Link>
                    </span>
                  )
                })}

                {/* Mobile: colored dots — sales filled, renewals ring */}
                {totalEvents > 0 && cell.current && (
                  <div className="sm:hidden flex flex-wrap gap-0.5 mt-auto pb-0.5">
                    {[
                      ...renewals.map(r => {
                        const bc = r.brandColors?.[0]
                        const dotColor = bc && hexLuminance(bc) < 0.1
                          ? `color-mix(in srgb, ${bc} 35%, #7ab0cc)`
                          : (bc ?? `hsl(${r.hue},60%,55%)`)
                        return { color: dotColor, outline: true }
                      }),
                      ...sales.map(s => ({ color: s.brandColors?.[0] ?? `hsl(${s.hue},60%,55%)`, outline: false })),
                    ].slice(0, 3).map((dot, i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full shrink-0"
                        style={dot.outline
                          ? { backgroundColor: 'transparent', outline: `1.5px solid ${dot.color}`, boxShadow: `0 0 0 1px rgba(255,255,255,0.2), 0 0 5px ${dot.color}88` }
                          : { backgroundColor: dot.color, boxShadow: `0 0 0 1.5px rgba(255,255,255,0.2), 0 0 5px ${dot.color}` }}
                      />
                    ))}
                    {totalEvents > 3 && (
                      <span className="text-[7px] text-stone-500 leading-none self-center">+{totalEvents - 3}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Mobile agenda — shown below calendar grid, above spending, on small screens */}
      <div className="sm:hidden overflow-hidden min-w-0">
        {selectedDay ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 overflow-hidden">
            <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
              <h3 className="text-sm font-semibold text-stone-300 truncate min-w-0">
                {new Date(year, month0, selectedDay).toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </h3>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1 text-stone-500 hover:text-stone-300 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
            {renewalsForDay(selectedDay).length === 0 && salesForDay(selectedDay).length === 0 ? (
              <p className="text-sm text-stone-500 italic text-center py-4">No events this day</p>
            ) : (
              <div className="space-y-2">
                {renewalsForDay(selectedDay).map(r => {
                  const ps = pillStyle(r.brandColors, r.hue, 'renewal', lightMode)
                  return (
                    <Link
                      key={r.id}
                      href={`/subscriptions/${r.slug}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-opacity hover:opacity-80 overflow-hidden min-w-0 w-full"
                      style={ps}
                    >
                      <span className="text-base shrink-0">🔄</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{r.label}</p>
                        {r.companyName && <p className="text-xs opacity-70">{r.companyName}</p>}
                      </div>
                      <span className="text-xs opacity-50 shrink-0">Renewal</span>
                    </Link>
                  )
                })}
                {salesForDay(selectedDay).map(s => {
                  const ps = pillStyle(s.brandColors, s.hue, 'sale', lightMode)
                  return (
                    <Link
                      key={s.id}
                      href={s.href}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-opacity hover:opacity-80 overflow-hidden min-w-0 w-full"
                      style={ps}
                    >
                      <Bell size={15} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{s.label}</p>
                        <p className="text-xs opacity-70">
                          {TIER_LABELS[s.tier]}{s.time ? ` · ${s.time}` : ''}{s.companyName ? ` · ${s.companyName}` : ''}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-stone-500 text-center py-2">Tap a date to see events</p>
        )}
      </div>

      {/* Monthly spending estimate */}
      {hasSpending && (
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-amber-400/70" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
              Expected spending · {monthLabel}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Renewals */}
            {Object.keys(monthRenewals).length > 0 && (
              <div className="bg-stone-950/50 rounded-lg p-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Renewals</p>
                {Object.entries(monthRenewals).map(([currency, { total, names }]) => (
                  <div key={currency} className="flex items-center justify-between gap-2">
                    <p className="text-xs text-stone-400 truncate flex-1" title={names.join(', ')}>
                      {names.length === 1 ? names[0] : `${names.length} subscriptions`}
                    </p>
                    <p className="text-xs font-semibold text-stone-200 shrink-0">{fmt(total, currency)}</p>
                  </div>
                ))}
                {Object.keys(monthRenewals).length > 1 && (
                  <div className="border-t border-stone-800 pt-1.5 flex justify-between">
                    <p className="text-[10px] text-stone-500">subtotal</p>
                    <p className="text-[10px] text-stone-400">
                      {Object.entries(monthRenewals).map(([c, { total }]) => fmt(total, c)).join(' + ')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Sale announcements */}
            {Object.keys(monthSales).length > 0 && (
              <div className="bg-stone-950/50 rounded-lg p-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Sale Announcements</p>
                {Object.entries(monthSales).map(([currency, { total, names }]) => (
                  <div key={currency} className="flex items-center justify-between gap-2">
                    <p className="text-xs text-stone-400 truncate flex-1" title={names.join(', ')}>
                      {names.length === 1 ? names[0] : `${names.length} sales`}
                    </p>
                    <p className="text-xs font-semibold text-stone-200 shrink-0">{fmt(total, currency)}</p>
                  </div>
                ))}
                {Object.keys(monthSales).length > 1 && (
                  <div className="border-t border-stone-800 pt-1.5 flex justify-between">
                    <p className="text-[10px] text-stone-500">subtotal</p>
                    <p className="text-[10px] text-stone-400">
                      {Object.entries(monthSales).map(([c, { total }]) => fmt(total, c)).join(' + ')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Total in preferred currency */}
          {hasSpending && (
            <div className="border-t border-stone-800 pt-3 flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-widest text-stone-500">
                  Total in {preferredCurrency}
                  {!allRatesLoaded && foreignCurrencies.length > 0 && (
                    <span className="ml-1 text-stone-600">(loading rates…)</span>
                  )}
                </p>
                {Object.keys(combinedByCurrency).length > 1 && (
                  <p className="text-[10px] text-stone-600 mt-0.5">
                    {Object.entries(combinedByCurrency).map(([c, t]) => fmt(t, c)).join(' + ')}
                  </p>
                )}
              </div>
              {allRatesLoaded && (
                <p className="text-xl font-serif font-bold text-amber-400">
                  ~{fmt(grandTotal, preferredCurrency)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {activeEntries.length === 0 && interests.length === 0 && (
        <p className="text-center text-stone-500 py-8 text-sm">
          No active subscriptions.{' '}
          <Link href="/subscriptions" className="text-amber-400 underline">
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
        const past = sorted.filter(({ dateStr }) => dateStr! < todayStr)
        return (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400">Sales you&apos;re interested in</h2>
            <div className="space-y-1">
              {upcoming.length === 0 && (
                <p className="text-sm text-stone-500 italic">No upcoming sales tracked.</p>
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
                    key={`${i.announcementId}-${i.tier}`}
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
                    <div className="text-right shrink-0 self-start">
                      <p className="text-xs font-semibold opacity-95">{TIER_LABELS[i.tier]}</p>
                      <p className="text-xs opacity-75">{label}{time !== '00:00' ? ` · ${time}` : ''}</p>
                    </div>
                  </Link>
                )
              })}

            </div>
          </div>
        )
      })()}

      {/* Floating tooltip — desktop only */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg border border-stone-700 bg-stone-900 shadow-xl text-sm"
          style={{ top: tooltip.y, left: Math.max(8, tooltip.x) }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <span className="font-medium" style={{ color: `hsl(${tooltip.hue},70%,70%)` }}>
            {tooltip.type === 'sale' ? <Bell size={12} className="inline mr-1" /> : '🔄 '}
            {tooltip.label}
          </span>
          <p className="text-[10px] text-stone-400 mt-0.5">
            {tooltip.subtitle ?? (tooltip.type === 'sale' ? 'Sale' : 'Renewal')}
          </p>
        </div>
      )}
    </div>
  )
}

