'use client'

import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Bell, X } from 'lucide-react'
import Link from 'next/link'
import { useTheme } from '@/components/ThemeProvider'

interface CalEntry {
  id: string
  active: boolean
  renewalDay: number | null
  subscription: {
    slug: string
    name: string
    logoUrl: string | null
    coverImage: string | null
    type: string
    startingMonth: number
    renewalDay: number | null
    company: { name: string; slug: string; brandColors?: string[] | null }
  }
}

interface SaleInterest {
  announcementId: string
  tier: 'FA' | 'EA' | 'GS'
  regionId: string | null
  announcement: {
    id: string
    title: string
    imageUrl: string | null
    firstAccessDate: string | null
    earlyAccessDate: string | null
    generalSaleDate: string | null
    saleTimezone: string | null
    company: { id: string; name: string; logoUrl: string | null; brandColors?: string[] | null } | null
    regions: Array<{
      id: string
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

/** Returns inline style for a calendar pill.
 *  variant='renewal' → solid border (warm hue offset +0)
 *  variant='sale'    → dashed border (cool hue offset -30), brand uses brandColors[1] if available
 *  lightMode: invert lightness so pills are visible on light background
 */
function pillStyle(
  brandColors: string[] | null | undefined,
  hue: number,
  variant: 'renewal' | 'sale',
  lightMode = false,
) {
  const isDashed = variant === 'sale'
  // Pick brand color: sales prefer second brand color if available
  const c = variant === 'sale'
    ? (brandColors?.[1] ?? brandColors?.[0])
    : brandColors?.[0]

  if (c) {
    // Use brand color with theme-aware opacity
    const bgAlpha = lightMode ? '28' : '1e'
    const borderAlpha = lightMode ? 'cc' : '66'
    return {
      background: `${c}${bgAlpha}`,
      color: c,
      border: `1px ${isDashed ? 'dashed' : 'solid'} ${c}${borderAlpha}`,
    }
  }

  // Fallback: hue-based — shift hue slightly for sales
  const h = isDashed ? (hue + 210) % 360 : hue
  if (lightMode) {
    return {
      background: `hsla(${h},60%,40%,0.12)`,
      color: `hsl(${h},80%,28%)`,
      border: `1px ${isDashed ? 'dashed' : 'solid'} hsla(${h},60%,35%,0.55)`,
    }
  }
  return {
    background: `hsla(${h},55%,45%,0.18)`,
    color: `hsl(${h},70%,70%)`,
    border: `1px ${isDashed ? 'dashed' : 'solid'} hsla(${h},55%,45%,0.40)`,
  }
}

// Returns the renewal day for a given (year, month0) if this is a renewal month, else null
// month0 is 0-indexed (JavaScript Date convention)
function renewalDayInMonth(entry: CalEntry, year: number, month0: number): number | null {
  const sub = entry.subscription
  const renewalDay = entry.renewalDay ?? sub.renewalDay
  if (!renewalDay) return null
  const type = sub.type ?? 'MONTHLY'
  if (type === 'MONTHLY') return renewalDay
  const step = type === 'BI_MONTHLY' ? 2 : 3
  const startMonthIdx = ((sub.startingMonth ?? 1) - 1) % step
  if (((month0 - startMonthIdx) % step + step) % step === 0) return renewalDay
  return null
}

/** Resolve tier date for a sale interest, using stored regionId if available */
function resolveInterestDate(interest: SaleInterest): string | null {
  const a = interest.announcement
  const region = interest.regionId
    ? a.regions?.find(r => r.id === interest.regionId) ?? null
    : null

  const FA = region?.firstAccessDate ?? a.firstAccessDate
  const EA = region?.earlyAccessDate ?? a.earlyAccessDate
  const GS = region?.generalSaleDate ?? a.generalSaleDate

  return interest.tier === 'FA' ? FA : interest.tier === 'EA' ? EA : GS
}

export default function CalendarPage() {
  const { theme } = useTheme()
  const lightMode = theme === 'light'
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
    queryKey: ['my-subscriptions'],
    queryFn: () => authFetch('/subscriptions/my/subscriptions'),
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
        brandColors: e.subscription.company?.brandColors ?? null,
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
          brandColors: i.announcement.company?.brandColors ?? null,
          hue: strHue(i.announcement.company?.name ?? i.announcementId),
          tier: i.tier,
          time,
          href: `/sale-announcements/${i.announcementId}`,
        }
      })

  const isToday = (day: number) =>
    day === today.getDate() && month0 === today.getMonth() && year === today.getFullYear()

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
                  'min-h-[48px] sm:min-h-[80px] p-1 sm:p-1.5 flex flex-col gap-0.5',
                  cell.current ? 'cursor-pointer sm:cursor-default' : '',
                  !cell.current ? 'bg-stone-950/40' : '',
                  cell.current && isToday(cell.day)
                    ? 'bg-amber-950/20 ring-1 ring-inset ring-amber-700/40'
                    : '',
                  isSelected
                    ? 'sm:bg-transparent sm:ring-0 bg-stone-700/40 ring-1 ring-inset ring-stone-500/50'
                    : '',
                ].filter(Boolean).join(' ')}
                onClick={() => cell.current && setSelectedDay(prev => prev === cell.day ? null : cell.day)}
              >
                <span
                  className={[
                    'text-xs leading-none mb-0.5 w-5 h-5 flex items-center justify-center rounded-full shrink-0',
                    !cell.current
                      ? 'text-stone-700'
                      : isToday(cell.day)
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'text-stone-400',
                  ].join(' ')}
                >
                  {cell.day}
                </span>

                {/* Desktop pills */}
                {renewals.map(r => {
                  const thumb = r.logoUrl
                    ? cloudinaryUrl(r.logoUrl, 'w_24,h_24,c_pad,q_auto,f_auto')
                    : null
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
                          {thumb ? (
                            <img src={thumb} alt="" className="w-3.5 h-3.5 rounded-sm object-contain shrink-0" />
                          ) : (
                            <span className="shrink-0 text-[10px]">🔄</span>
                          )}
                          <span className="truncate">{r.label}</span>
                        </span>
                        {r.companyName && (
                          <span className="truncate opacity-60 pl-4">{r.companyName}</span>
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
                        {s.companyName && (
                          <span className="truncate opacity-60 pl-3">{s.companyName}</span>
                        )}
                      </Link>
                    </span>
                  )
                })}

                {/* Mobile: colored dots */}
                {totalEvents > 0 && cell.current && (
                  <div className="sm:hidden flex flex-wrap gap-0.5 mt-auto pb-0.5">
                    {[
                      ...renewals.map(r => ({ color: r.brandColors?.[0] ?? `hsl(${r.hue},60%,55%)` })),
                      ...sales.map(s => ({ color: s.brandColors?.[0] ?? `hsl(${s.hue + 210},60%,55%)` })),
                    ].slice(0, 3).map((dot, i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: dot.color }}
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

      {/* Mobile agenda — shown below calendar grid on small screens */}
      <div className="sm:hidden">
        {selectedDay ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-stone-300">
                {new Date(year, month0, selectedDay).toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </h3>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1 text-stone-500 hover:text-stone-300 transition-colors"
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
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-opacity hover:opacity-80"
                      style={ps}
                    >
                      <span className="text-base shrink-0">🔄</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{r.label}</p>
                        {r.companyName && <p className="text-xs opacity-70 truncate">{r.companyName}</p>}
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
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-opacity hover:opacity-80"
                      style={ps}
                    >
                      <Bell size={15} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{s.label}</p>
                        <p className="text-xs opacity-70 truncate">
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
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-stone-900 border hover:opacity-90 transition-opacity group"
                    style={{ borderColor: bStyle.border.split(' ').pop() }}
                  >
                    <Bell size={13} style={{ color: bStyle.color }} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-200 group-hover:text-white truncate">{i.announcement.title}</p>
                      {i.announcement.company && (
                        <p className="text-xs text-stone-500 truncate">{i.announcement.company.name}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs" style={{ color: bStyle.color }}>{TIER_LABELS[i.tier]}</p>
                      <p className="text-xs text-stone-400">{label}{time !== '00:00' ? ` · ${time}` : ''}</p>
                    </div>
                  </Link>
                )
              })}
              {past.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-stone-500 cursor-pointer hover:text-stone-400 transition-colors select-none">
                    {past.length} past sale{past.length > 1 ? 's' : ''}
                  </summary>
                  <div className="mt-1 space-y-1 opacity-60">
                    {past.reverse().map(({ interest: i, dateStr }) => {
                      const d = new Date(dateStr!)
                      const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      return (
                        <Link
                          key={`${i.announcementId}-${i.tier}-past`}
                          href={`/sale-announcements/${i.announcementId}`}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-stone-900 border border-stone-800 hover:border-stone-700 transition-colors group"
                        >
                          <Bell size={13} className="text-stone-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-stone-400 truncate">{i.announcement.title}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-stone-500">{TIER_LABELS[i.tier]} · {label}</p>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </details>
              )}
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

