'use client'

import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Bell } from 'lucide-react'
import Link from 'next/link'

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
    company: { name: string; slug: string }
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
    company: { id: string; name: string; logoUrl: string | null } | null
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
        new Date(2024, 0, i + 1).toLocaleDateString('en-GB', { weekday: 'short' }),
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
        slug: e.subscription.slug,
        hue: strHue(e.subscription.slug),
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
    <div className="max-w-3xl mx-auto space-y-6">
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
            return (
              <div
                key={idx}
                className={[
                  'min-h-[80px] p-1.5 flex flex-col gap-0.5',
                  !cell.current ? 'bg-stone-950/40' : '',
                  cell.current && isToday(cell.day)
                    ? 'bg-amber-950/20 ring-1 ring-inset ring-amber-700/40'
                    : '',
                ].filter(Boolean).join(' ')}
              >
                <span
                  className={[
                    'text-xs leading-none mb-0.5 w-5 h-5 flex items-center justify-center rounded-full',
                    !cell.current
                      ? 'text-stone-700'
                      : isToday(cell.day)
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'text-stone-400',
                  ].join(' ')}
                >
                  {cell.day}
                </span>

                {renewals.map(r => {
                  const thumb = r.logoUrl
                    ? cloudinaryUrl(r.logoUrl, 'w_24,h_24,c_pad,q_auto,f_auto')
                    : null
                  return (
                    <Link
                      key={r.id}
                      href={`/subscriptions/${r.slug}`}
                      className="flex flex-col rounded px-1 py-0.5 text-[10px] leading-tight truncate transition-opacity hover:opacity-90"
                      style={{
                        background: `hsla(${r.hue},55%,45%,0.18)`,
                        color: `hsl(${r.hue},70%,70%)`,
                        border: `1px solid hsla(${r.hue},55%,45%,0.35)`,
                      }}
                      onMouseEnter={e => openTooltip(e, r.label, r.hue, 'renewal', r.companyName ?? undefined)}
                      onMouseLeave={scheduleClose}
                    >
                      <span className="flex items-center gap-1 truncate">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            className="w-3.5 h-3.5 rounded-sm object-contain shrink-0"
                          />
                        ) : (
                          <span className="shrink-0 text-[10px]">🔄</span>
                        )}
                        <span className="truncate">{r.label}</span>
                      </span>
                      {r.companyName && (
                        <span className="truncate opacity-60 pl-4">{r.companyName}</span>
                      )}
                    </Link>
                  )
                })}

                {sales.map(s => (
                  <Link
                    key={s.id}
                    href={s.href}
                    className="flex flex-col rounded px-1 py-0.5 text-[10px] leading-tight truncate transition-opacity hover:opacity-90"
                    style={{
                      background: 'rgba(109,40,217,0.18)',
                      color: 'rgb(196,168,255)',
                      border: '1px solid rgba(109,40,217,0.4)',
                    }}
                    onMouseEnter={e => openTooltip(
                      e,
                      s.label,
                      270,
                      'sale',
                      `${TIER_LABELS[s.tier]}${s.time ? ` · ${s.time}` : ''}${s.companyName ? ` · ${s.companyName}` : ''}`,
                    )}
                    onMouseLeave={scheduleClose}
                  >
                    <span className="flex items-center gap-1 truncate">
                      <Bell size={9} className="shrink-0" />
                      <span className="truncate">{s.label}</span>
                    </span>
                    {s.companyName && (
                      <span className="truncate opacity-60 pl-3">{s.companyName}</span>
                    )}
                  </Link>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {activeEntries.map(e => {
          const hue = strHue(e.subscription.slug)
          const src = e.subscription.logoUrl ?? e.subscription.coverImage
          const thumb = src ? cloudinaryUrl(src, 'w_24,h_24,c_pad,q_auto,f_auto') : null
          return (
            <Link
              key={e.id}
              href={`/subscriptions/${e.subscription.slug}`}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-opacity hover:opacity-80"
              style={{
                background: `hsla(${hue},55%,45%,0.18)`,
                color: `hsl(${hue},70%,70%)`,
                border: `1px solid hsla(${hue},55%,45%,0.35)`,
              }}
            >
              {thumb && (
                <Image src={thumb} alt="" width={14} height={14} className="rounded-sm object-contain" unoptimized />
              )}
              {e.subscription.name}
            </Link>
          )
        })}
        {interests.length > 0 && (
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
            style={{ background: 'rgba(109,40,217,0.18)', color: 'rgb(196,168,255)', border: '1px solid rgba(109,40,217,0.4)' }}
          >
            <Bell size={11} />
            Sale interest
          </span>
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

      {/* Floating tooltip */}
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

