'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Bell, RefreshCw, X } from 'lucide-react'
import { hexLuminance, pillStyle, withHighlightGlow, highlightDotShadow } from '@/lib/calendarPills'
import { SalePillBell } from '@/components/calendar/SalePillBell'

export interface CalendarRenewalItem {
  id: string
  label: string
  companyName: string | null
  brandColors: string[] | null
  hue: number
  href: string
  /** 'mine' = user actively subscribed; 'skipped' = subscribed, but this particular occurrence
   *  won't happen for them (personal skip, or a differing personal renewal day). */
  highlight?: 'mine' | 'skipped' | null
}

export interface CalendarSaleItem {
  id: string
  label: string
  companyName: string | null
  brandColors: string[] | null
  hue: number
  tierName: string
  time: string | null
  href: string
  /** 'mine' = user has tracked interest in this exact tier. */
  highlight?: 'mine' | null
  /** e.g. "2/3" — this tier's position among its sale's same-region tiers. Omit when the sale
   *  only has one tier (no point badging a solo tier). */
  stageBadge?: string | null
  /** Both required to enable the inline interest bell (via the grid's `interestEnabled` prop) —
   *  omit on producers that don't support it (falls back to a static decorative bell icon). */
  announcementId?: string
  regionId?: string | null
}

interface CalendarGridProps {
  year: number
  /** 0-indexed month (JavaScript Date convention). */
  month0: number
  monthLabel: string
  lightMode: boolean
  onPrevMonth: () => void
  onNextMonth: () => void
  renewalsForDay: (day: number) => CalendarRenewalItem[]
  salesForDay: (day: number) => CalendarSaleItem[]
  /** Opt-in: renders an interactive "mark interested" bell on sale pills instead of the static
   *  decorative one. Only meaningful when producers also set announcementId/regionId on their
   *  CalendarSaleItems. Off by default so existing embeds (private calendar, single-sale mini
   *  calendar) are unaffected. */
  interestEnabled?: boolean
}

/** Shared month-nav + 7x6 day grid + mobile tap-agenda, reused by the private per-user
 *  calendar and the public global sales/renewals calendar so their visual language and
 *  responsive behavior can't drift apart. Deliberately excludes anything user-specific
 *  (spending estimates, "my tracked sales" list) — those stay in the pages that embed this. */
export default function CalendarGrid({
  year,
  month0,
  monthLabel,
  lightMode,
  onPrevMonth,
  onNextMonth,
  renewalsForDay,
  salesForDay,
  interestEnabled = false,
}: CalendarGridProps) {
  const today = new Date()

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
    <div className="space-y-6 min-w-0">
      {/* Month navigation */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onPrevMonth}
          className="p-2 rounded-lg text-stone-400 hover:text-brand-400 hover:bg-stone-800 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-lg font-serif text-stone-100 capitalize">{monthLabel}</h2>
        <button
          onClick={onNextMonth}
          className="p-2 rounded-lg text-stone-400 hover:text-brand-400 hover:bg-stone-800 transition-colors"
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
                    ? 'bg-brand-900/30 ring-1 ring-inset ring-brand-600/60'
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
                        ? 'bg-brand-500 text-stone-950 font-bold'
                        : 'text-stone-200',
                  ].join(' ')}
                >
                  {cell.day}
                </span>

                {/* Desktop pills */}
                {renewals.map(r => {
                  const ps = withHighlightGlow(pillStyle(r.brandColors, r.hue, 'renewal', lightMode), r.highlight)
                  return (
                    <span key={r.id} className="hidden sm:block">
                      <Link
                        href={r.href}
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
                  const ps = withHighlightGlow(pillStyle(s.brandColors, s.hue, 'sale', lightMode), s.highlight)
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
                          `${s.tierName}${s.stageBadge ? ` (${s.stageBadge})` : ''}${s.time ? ` · ${s.time}` : ''}${s.companyName ? ` · ${s.companyName}` : ''}`,
                        )}
                        onMouseLeave={scheduleClose}
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="flex items-center gap-1 truncate">
                          {interestEnabled && s.announcementId ? (
                            <SalePillBell announcementId={s.announcementId} tierId={s.id} tierName={s.tierName} tierRegionId={s.regionId ?? null} size={9} />
                          ) : (
                            <Bell size={9} className="shrink-0" />
                          )}
                          <span className="truncate">{s.label}</span>
                          {s.stageBadge && <span className="opacity-50 text-[8px] shrink-0">{s.stageBadge}</span>}
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
                        return { color: dotColor, outline: true, highlight: r.highlight }
                      }),
                      ...sales.map(s => ({ color: s.brandColors?.[0] ?? `hsl(${s.hue},60%,55%)`, outline: false, highlight: s.highlight })),
                    ].slice(0, 3).map((dot, i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full shrink-0"
                        style={dot.outline
                          ? { backgroundColor: 'transparent', outline: `1.5px solid ${dot.color}`, boxShadow: `0 0 0 1px rgba(255,255,255,0.2), 0 0 5px ${dot.color}88${highlightDotShadow(dot.highlight)}` }
                          : { backgroundColor: dot.color, boxShadow: `0 0 0 1.5px rgba(255,255,255,0.2), 0 0 5px ${dot.color}${highlightDotShadow(dot.highlight)}` }}
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
                  const ps = withHighlightGlow(pillStyle(r.brandColors, r.hue, 'renewal', lightMode), r.highlight)
                  return (
                    <Link
                      key={r.id}
                      href={r.href}
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
                  const ps = withHighlightGlow(pillStyle(s.brandColors, s.hue, 'sale', lightMode), s.highlight)
                  return (
                    <Link
                      key={s.id}
                      href={s.href}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-opacity hover:opacity-80 overflow-hidden min-w-0 w-full"
                      style={ps}
                    >
                      {interestEnabled && s.announcementId ? (
                        <SalePillBell announcementId={s.announcementId} tierId={s.id} tierName={s.tierName} tierRegionId={s.regionId ?? null} size={15} />
                      ) : (
                        <Bell size={15} className="shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">
                          {s.label}{s.stageBadge && <span className="opacity-50 text-xs ml-1">{s.stageBadge}</span>}
                        </p>
                        <p className="text-xs opacity-70">
                          {s.tierName}{s.time ? ` · ${s.time}` : ''}{s.companyName ? ` · ${s.companyName}` : ''}
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
