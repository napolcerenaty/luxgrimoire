'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import StatsSettingsPanel from '@/components/stats/StatsSettingsPanel'
import {
  TrendingUp, BookOpen, DollarSign, Truck, Receipt, Tag, BarChart2, Award,
  Calendar, ShoppingBag, TrendingDown, Library, Sparkles, ChevronLeft, ChevronRight,
  RefreshCw, Layers, Scale, Info, Settings,
} from 'lucide-react'
import { CURRENCIES } from '@/lib/currencies'

// ─── Tab config ───────────────────────────────────────────────────────────────
type TabId = 'collection' | 'spending' | 'sales' | 'pl' | 'features' | 'reading'
const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'collection', label: 'Collection', icon: Library },
  { id: 'spending',   label: 'Spending',   icon: DollarSign },
  { id: 'sales',      label: 'Sales',      icon: ShoppingBag },
  { id: 'pl',         label: 'P&L',        icon: Scale },
  { id: 'features',   label: 'Features',   icon: Sparkles },
  { id: 'reading',    label: 'Reading',    icon: BookOpen },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface CollectionStats {
  totalBooks: number
  ownedCount: number
  preorderCount: number
  shippingCount: number
  soldCount: number
  toSellCount: number
  wishlistCount: number
  signedCount: number
  signedPercent: number
  unreadCount: number
  readCount: number
  readingCount: number
  dnfCount: number
  unreadPercent: number
  unreadShelfValue: number
  preorderValue: number
  shippingValue: number
  acquisitionBreakdown: { subscription: number; direct: number; unknown: number }
  firstHandCount: number
  secondHandCount: number
  bySubscriptionAll: Array<{ name: string; slug: string; books: number }>
  byCompanyAll: Array<{ name: string; slug: string; books: number; primaryColor?: string | null }>
  readingBySubscription: Array<{ name: string; slug: string; read: number; reading: number; unread: number; dnf: number }>
  readingByCompany: Array<{ name: string; slug: string; read: number; reading: number; unread: number; dnf: number; primaryColor?: string | null }>
}

interface FeaturesStats {
  totalBooksAnalyzed: number
  booksWithAnyFeature: number
  booksWithAnyFeaturePercent: number
  byCategory: Array<{ slug: string; label: string; group: string; count: number; percent: number }>
  byGroup: Record<string, Array<{ slug: string; label: string; count: number; percent: number }>>
}

interface SpendingData {
  currency: string
  totalAllTime: number
  totalThisYear: number
  totalThisMonth: number
  avgCostPerBook: number
  booksWithCost: number
  booksThisYear: number
  booksThisMonth: number
  totalBasePrice: number
  totalShipping: number
  totalForwarding: number
  totalTax: number
  totalOtherFees: number
  totalDiscounts: number
  totalRefunds: number
  byYear: Array<{ year: number; amount: number }>
  byYearBooks: Array<{ year: number; count: number }>
  salesByYear: Array<{ year: number; amount: number }>
  salesByYearCount: Array<{ year: number; count: number }>
  byMonth: Array<{ month: string; amount: number }>
  byMonthBooks: Array<{ month: string; count: number }>
  bySubscription: Array<{ name: string; slug: string; amount: number; books: number }>
  byCompany: Array<{ name: string; slug: string; amount: number; books: number; primaryColor?: string | null }>
  topExpensive: Array<{ title: string; author: string; amount: number; currency: string; date: string; editionSlug: string | null }>
  salesByMonth: Array<{ month: string; amount: number }>
  salesByMonthCount: Array<{ month: string; count: number }>
}

interface SalesData {
  totalSalesRevenue: number
  totalSalesProfit: number | null
  totalBooksSold: number
  byYear: Array<{ year: number; amount: number }>
  salesByYear: Array<{ year: number; amount: number }>
  salesByMonth: Array<{ month: string; amount: number }>
  salesByPlatform: Array<{ platform: string; amount: number; count: number }>
  salesByCompany: Array<{ name: string; slug: string; amount: number; count: number; primaryColor?: string | null }>
  topSalePrice: Array<{ title: string; author: string; amount: number; currency: string; date: string; editionSlug: string | null }>
  topProfit: Array<{ title: string; author: string; amount: number; currency: string; cost: number; date: string; editionSlug: string | null }>
  topLoss: Array<{ title: string; author: string; amount: number; currency: string; cost: number; date: string; editionSlug: string | null }>
  plByMonth: Array<{ month: string; pl: number }>
  plByCompany: Array<{ name: string; slug: string; pl: number; revenue: number; cost: number; count: number; primaryColor?: string | null }>
  salesWithROI: Array<{ title: string; author: string; roi: number; holdDays: number; pl: number; editionSlug: string | null }>
}

interface ModuleResponse<T> {
  data: T
  currency: string
  computedAt: string
  isStale: boolean
}

interface StatsSettings {
  spending: boolean
  sales: boolean
  reading: boolean
  features: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  return 'just now'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, accent, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; accent?: boolean; color?: string
}) {
  return (
    <div className={`rounded-2xl p-5 border flex flex-col gap-2 ${accent ? 'bg-brand-950/30 border-brand-700/40' : 'bg-stone-900 border-stone-800'}`}>
      <div className="flex items-center gap-2">
        <Icon size={14} className={color ?? (accent ? 'text-brand-400' : 'text-stone-500')} />
        <span className="text-xs uppercase tracking-wider text-stone-500">{label}</span>
      </div>
      <p className={`text-base sm:text-xl font-serif font-bold leading-tight ${color ?? (accent ? 'text-brand-400' : 'text-stone-100')}`}>{value}</p>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
    </div>
  )
}

function TabLoading() {
  return <div className="text-center py-20 text-stone-500 animate-pulse">Loading…</div>
}

function MonthBarChart({ data, currency }: { data: Array<{ month: string; amount: number }>; currency: string }) {
  const TOTAL_H = 120
  const LABEL_H = 18
  const BAR_MAX = TOTAL_H - LABEL_H
  const max = Math.max(...data.map(d => d.amount), 1)
  return (
    <div className="flex items-end gap-0.5 w-full" style={{ height: TOTAL_H }}>
      {data.map((d, i) => {
        const barH = d.amount > 0 ? Math.max((d.amount / max) * BAR_MAX, 4) : 0
        const monthName = new Date(d.month + '-01').toLocaleString('en', { month: 'short' })
        return (
          <div key={i} className="relative flex-1 group" style={{ height: TOTAL_H }}>
            {d.amount > 0 && (
              <div
                className="absolute z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] text-stone-200 whitespace-nowrap"
                style={{ bottom: LABEL_H + barH + 4, left: '50%', transform: 'translateX(-50%)' }}
              >
                {fmt(d.amount, currency)}
              </div>
            )}
            <div
              className="absolute left-0.5 right-0.5 rounded-t-sm transition-all"
              style={{ bottom: LABEL_H, height: barH, background: barH > 0 ? 'rgba(245,158,11,0.8)' : 'transparent' }}
            />
            <span
              className="absolute left-0 right-0 text-center text-[9px] text-stone-600 bottom-0"
              style={{ height: LABEL_H, lineHeight: LABEL_H + 'px' }}
            >
              {monthName}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function MonthBooksChart({ data }: { data: Array<{ month: string; count: number }> }) {
  const TOTAL_H = 96
  const LABEL_H = 18
  const BAR_MAX = TOTAL_H - LABEL_H
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="flex items-end gap-0.5 w-full" style={{ height: TOTAL_H }}>
      {data.map((d, i) => {
        const barH = d.count > 0 ? Math.max((d.count / max) * BAR_MAX, 4) : 0
        const monthName = new Date(d.month + '-01').toLocaleString('en', { month: 'short' })
        return (
          <div key={i} className="relative flex-1 group" style={{ height: TOTAL_H }}>
            {d.count > 0 && (
              <div
                className="absolute z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] text-stone-200 whitespace-nowrap"
                style={{ bottom: LABEL_H + barH + 4, left: '50%', transform: 'translateX(-50%)' }}
              >
                {d.count} book{d.count !== 1 ? 's' : ''}
              </div>
            )}
            <div
              className="absolute left-0.5 right-0.5 rounded-t-sm transition-all"
              style={{ bottom: LABEL_H, height: barH, background: barH > 0 ? 'rgba(99,102,241,0.75)' : 'transparent' }}
            />
            <span
              className="absolute left-0 right-0 text-center text-[9px] text-stone-600 bottom-0"
              style={{ height: LABEL_H, lineHeight: LABEL_H + 'px' }}
            >
              {monthName}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function YearBarChart({ data, currency }: { data: Array<{ year: number; amount: number }>; currency: string }) {
  const TOTAL_H = 96
  const LABEL_H = 18
  const BAR_MAX = TOTAL_H - LABEL_H
  const max = Math.max(...data.map(d => d.amount), 1)
  return (
    <div className="flex items-end gap-2 w-full" style={{ height: TOTAL_H }}>
      {data.map((d, i) => {
        const barH = d.amount > 0 ? Math.max((d.amount / max) * BAR_MAX, 4) : 0
        return (
          <div key={i} className="relative flex-1 group" style={{ height: TOTAL_H }}>
            <div
              className="absolute z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] text-stone-200 whitespace-nowrap"
              style={{ bottom: LABEL_H + barH + 4, left: '50%', transform: 'translateX(-50%)' }}
            >
              {fmt(d.amount, currency)}
            </div>
            <div
              className="absolute left-0.5 right-0.5 rounded-t-sm bg-brand-600/70 transition-all"
              style={{ bottom: LABEL_H, height: barH }}
            />
            <span
              className="absolute left-0 right-0 text-center text-[9px] text-stone-500 bottom-0"
              style={{ height: LABEL_H, lineHeight: LABEL_H + 'px' }}
            >
              {d.year}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function YearBooksChart({ data }: { data: Array<{ year: number; count: number }> }) {
  const TOTAL_H = 80
  const LABEL_H = 18
  const BAR_MAX = TOTAL_H - LABEL_H
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="flex items-end gap-2 w-full" style={{ height: TOTAL_H }}>
      {data.map((d, i) => {
        const barH = d.count > 0 ? Math.max((d.count / max) * BAR_MAX, 4) : 0
        return (
          <div key={i} className="relative flex-1 group" style={{ height: TOTAL_H }}>
            {d.count > 0 && (
              <div
                className="absolute z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] text-stone-200 whitespace-nowrap"
                style={{ bottom: LABEL_H + barH + 4, left: '50%', transform: 'translateX(-50%)' }}
              >
                {d.count} book{d.count !== 1 ? 's' : ''}
              </div>
            )}
            <div
              className="absolute left-0.5 right-0.5 rounded-t-sm bg-indigo-500/60 transition-all"
              style={{ bottom: LABEL_H, height: barH }}
            />
            <span
              className="absolute left-0 right-0 text-center text-[9px] text-stone-500 bottom-0"
              style={{ height: LABEL_H, lineHeight: LABEL_H + 'px' }}
            >
              {d.year}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CategoryBar({ label, amount, total, currency, color }: {
  label: string; amount: number; total: number; currency: string; color: string
}) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-stone-400">{label}</span>
        <span className="text-stone-300 font-medium">
          {fmt(amount, currency)} <span className="text-stone-600">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function CountBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-stone-400">{label}</span>
        <span className="text-stone-300 font-medium">
          {count} <span className="text-stone-600">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

/** Dual bar chart — spending (brand blue) vs sales revenue (green) per month */
function DualMonthChart({
  spending, sales, currency,
}: {
  spending: Array<{ month: string; amount: number }>
  sales: Array<{ month: string; amount: number }>
  currency: string
}) {
  const TOTAL_H = 128
  const LABEL_H = 18
  const BAR_MAX = TOTAL_H - LABEL_H
  const salesMap = new Map(sales.map(s => [s.month, s.amount]))
  const max = Math.max(...spending.map(d => Math.max(d.amount, salesMap.get(d.month) ?? 0)), 1)
  return (
    <div className="flex items-end gap-0.5 w-full" style={{ height: TOTAL_H }}>
      {spending.map((d, i) => {
        const saleAmt = salesMap.get(d.month) ?? 0
        const spH = d.amount > 0 ? Math.max((d.amount / max) * BAR_MAX, 4) : 0
        const saleH = saleAmt > 0 ? Math.max((saleAmt / max) * BAR_MAX, 4) : 0
        const monthName = new Date(d.month + '-01').toLocaleString('en', { month: 'short' })
        return (
          <div key={i} className="relative flex-1 group" style={{ height: TOTAL_H }}>
            {(d.amount > 0 || saleAmt > 0) && (
              <div
                className="absolute z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] whitespace-nowrap space-y-0.5"
                style={{ bottom: LABEL_H + Math.max(spH, saleH) + 4, left: '50%', transform: 'translateX(-50%)' }}
              >
                {d.amount > 0 && <div className="text-brand-400">📚 {fmt(d.amount, currency)}</div>}
                {saleAmt > 0 && <div className="text-green-400">💰 {fmt(saleAmt, currency)}</div>}
              </div>
            )}
            <div
              className="absolute rounded-t-sm bg-brand-500/70 transition-all"
              style={{ bottom: LABEL_H, left: 1, right: '50%', height: spH }}
            />
            <div
              className="absolute rounded-t-sm bg-green-500/70 transition-all"
              style={{ bottom: LABEL_H, left: '50%', right: 1, height: saleH }}
            />
            <span
              className="absolute left-0 right-0 text-center text-[9px] text-stone-600 bottom-0"
              style={{ height: LABEL_H, lineHeight: LABEL_H + 'px' }}
            >
              {monthName}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function YearSwitcher({ years, selected, onChange }: { years: number[]; selected: number; onChange: (y: number) => void }) {
  const idx = years.indexOf(selected)
  const prev = idx < years.length - 1 ? years[idx + 1] : null
  const next = idx > 0 ? years[idx - 1] : null
  return (
    <div className="flex items-center gap-3 justify-between flex-wrap pt-1">
      <div className="flex items-center gap-2">
        <button
          onClick={() => prev && onChange(prev)}
          disabled={!prev}
          className="p-1.5 rounded-lg border border-stone-700 text-stone-400 hover:text-stone-100 hover:border-stone-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-lg font-semibold text-stone-200 min-w-[4ch] text-center">{selected}</span>
        <button
          onClick={() => next && onChange(next)}
          disabled={!next}
          className="p-1.5 rounded-lg border border-stone-700 text-stone-400 hover:text-stone-100 hover:border-stone-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {years.map(y => (
          <button
            key={y}
            onClick={() => onChange(y)}
            className={`px-3 py-1 rounded-lg text-sm border transition-colors ${
              y === selected
                ? 'bg-brand-900/40 border-brand-700/60 text-brand-400'
                : 'border-stone-700 text-stone-500 hover:border-stone-500 hover:text-stone-300'
            }`}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Spending (brand blue) vs Sales revenue (green) bars per year */
function DualYearBarChart({ spending, sales, currency }: {
  spending: Array<{ year: number; amount: number }>
  sales: Array<{ year: number; amount: number }>
  currency: string
}) {
  const TOTAL_H = 96
  const LABEL_H = 18
  const BAR_MAX = TOTAL_H - LABEL_H
  const salesMap = new Map(sales.map(s => [s.year, s.amount]))
  const allYears = Array.from(new Set([...spending.map(d => d.year), ...sales.map(d => d.year)])).sort()
  const max = Math.max(...allYears.map(y => Math.max(spending.find(d => d.year === y)?.amount ?? 0, salesMap.get(y) ?? 0)), 1)
  return (
    <div className="flex items-end gap-2 w-full" style={{ height: TOTAL_H }}>
      {allYears.map((year) => {
        const spAmt = spending.find(d => d.year === year)?.amount ?? 0
        const salAmt = salesMap.get(year) ?? 0
        const spH = spAmt > 0 ? Math.max((spAmt / max) * BAR_MAX, 4) : 0
        const salH = salAmt > 0 ? Math.max((salAmt / max) * BAR_MAX, 4) : 0
        return (
          <div key={year} className="relative flex-1 group" style={{ height: TOTAL_H }}>
            <div
              className="absolute z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] whitespace-nowrap space-y-0.5"
              style={{ bottom: LABEL_H + Math.max(spH, salH) + 4, left: '50%', transform: 'translateX(-50%)' }}
            >
              {spAmt > 0 && <div className="text-brand-400">Spent: {fmt(spAmt, currency)}</div>}
              {salAmt > 0 && <div className="text-green-400">Sales: {fmt(salAmt, currency)}</div>}
            </div>
            <div className="absolute rounded-t-sm bg-brand-600/70 transition-all" style={{ bottom: LABEL_H, left: 1, right: '55%', height: spH }} />
            <div className="absolute rounded-t-sm bg-green-500/60 transition-all" style={{ bottom: LABEL_H, left: '55%', right: 1, height: salH }} />
            <span className="absolute left-0 right-0 text-center text-[9px] text-stone-500 bottom-0" style={{ height: LABEL_H, lineHeight: LABEL_H + 'px' }}>
              {year}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Books acquired (indigo) vs books sold (green) bars per month */
function DualMonthBooksChart({ acquired, sold }: {
  acquired: Array<{ month: string; count: number }>
  sold: Array<{ month: string; count: number }>
}) {
  const TOTAL_H = 96
  const LABEL_H = 18
  const BAR_MAX = TOTAL_H - LABEL_H
  const soldMap = new Map(sold.map(s => [s.month, s.count]))
  const max = Math.max(...acquired.map(d => Math.max(d.count, soldMap.get(d.month) ?? 0)), 1)
  return (
    <div className="flex items-end gap-0.5 w-full" style={{ height: TOTAL_H }}>
      {acquired.map((d, i) => {
        const soldCount = soldMap.get(d.month) ?? 0
        const acqH = d.count > 0 ? Math.max((d.count / max) * BAR_MAX, 3) : 0
        const sldH = soldCount > 0 ? Math.max((soldCount / max) * BAR_MAX, 3) : 0
        const monthName = new Date(d.month + '-01').toLocaleString('en', { month: 'short' })
        return (
          <div key={i} className="relative flex-1 group" style={{ height: TOTAL_H }}>
            {(d.count > 0 || soldCount > 0) && (
              <div
                className="absolute z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] whitespace-nowrap space-y-0.5"
                style={{ bottom: LABEL_H + Math.max(acqH, sldH) + 4, left: '50%', transform: 'translateX(-50%)' }}
              >
                {d.count > 0 && <div className="text-indigo-400">📚 {d.count} acquired</div>}
                {soldCount > 0 && <div className="text-green-400">💰 {soldCount} sold</div>}
              </div>
            )}
            <div className="absolute rounded-t-sm bg-indigo-500/60 transition-all" style={{ bottom: LABEL_H, left: 1, right: '55%', height: acqH }} />
            <div className="absolute rounded-t-sm bg-green-500/55 transition-all" style={{ bottom: LABEL_H, left: '55%', right: 1, height: sldH }} />
            <span className="absolute left-0 right-0 text-center text-[9px] text-stone-500 bottom-0" style={{ height: LABEL_H, lineHeight: LABEL_H + 'px' }}>
              {monthName}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Monthly P&L bar chart — green bars above zero, red below */
function MonthlyPLBarChart({ data, currency }: { data: Array<{ month: string; pl: number }>; currency: string }) {
  const TOTAL_H = 120
  const LABEL_H = 18
  const ZERO_Y = TOTAL_H / 2 - LABEL_H / 2
  const HALF = ZERO_Y
  const maxAbs = Math.max(...data.map(d => Math.abs(d.pl)), 1)
  return (
    <div className="relative w-full" style={{ height: TOTAL_H + 4 }}>
      {/* zero line */}
      <div className="absolute left-0 right-0 border-t border-stone-700/60" style={{ top: ZERO_Y }} />
      <div className="flex items-stretch gap-0.5 w-full h-full">
        {data.map((d, i) => {
          const barH = d.pl !== 0 ? Math.max((Math.abs(d.pl) / maxAbs) * HALF, 3) : 0
          const monthName = new Date(d.month + '-01').toLocaleString('en', { month: 'short' })
          const isProfit = d.pl >= 0
          return (
            <div key={i} className="relative flex-1 group" style={{ height: TOTAL_H }}>
              {d.pl !== 0 && (
                <div
                  className="absolute z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] text-stone-200 whitespace-nowrap"
                  style={{ [isProfit ? 'bottom' : 'top']: ZERO_Y + barH + 4, left: '50%', transform: 'translateX(-50%)' }}
                >
                  <span className={isProfit ? 'text-emerald-400' : 'text-red-400'}>{isProfit ? '+' : ''}{fmt(d.pl, currency)}</span>
                </div>
              )}
              <div
                className="absolute left-0.5 right-0.5 rounded-sm transition-all"
                style={{
                  height: barH,
                  background: isProfit ? 'rgba(52,211,153,0.75)' : 'rgba(248,113,113,0.75)',
                  ...(isProfit ? { bottom: ZERO_Y } : { top: ZERO_Y }),
                }}
              />
              <span className="absolute left-0 right-0 text-center text-[9px] text-stone-600 bottom-0" style={{ height: LABEL_H, lineHeight: LABEL_H + 'px' }}>
                {monthName}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Cumulative P&L SVG line chart */
function CumulativePLChart({ plByMonth, currency }: { plByMonth: Array<{ month: string; pl: number }>; currency: string }) {
  const W = 600; const H = 140; const PAD = { t: 12, r: 8, b: 24, l: 8 }
  const iW = W - PAD.l - PAD.r; const iH = H - PAD.t - PAD.b
  if (plByMonth.length === 0) return null
  const cumulative = plByMonth.reduce<Array<{ month: string; cumPL: number }>>((acc, d) => {
    const prev = acc[acc.length - 1]?.cumPL ?? 0
    acc.push({ month: d.month, cumPL: prev + d.pl })
    return acc
  }, [])
  const values = cumulative.map(d => d.cumPL)
  const minV = Math.min(...values, 0); const maxV = Math.max(...values, 0)
  const range = maxV - minV || 1
  const toX = (i: number) => PAD.l + (i / Math.max(cumulative.length - 1, 1)) * iW
  const toY = (v: number) => PAD.t + (1 - (v - minV) / range) * iH
  const zeroY = toY(0)
  const points = cumulative.map((d, i) => `${toX(i)},${toY(d.cumPL)}`).join(' ')
  const last = cumulative[cumulative.length - 1]
  const isPositive = (last?.cumPL ?? 0) >= 0
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} stroke="#44403c" strokeWidth="1" strokeDasharray="4 3" />
      <polyline points={points} fill="none" stroke={isPositive ? '#34d399' : '#f87171'} strokeWidth="2" strokeLinejoin="round" />
      {cumulative.map((d, i) => (
        <g key={i} className="group">
          <circle cx={toX(i)} cy={toY(d.cumPL)} r="3" fill={d.cumPL >= 0 ? '#34d399' : '#f87171'} />
          <title>{d.month}: {d.cumPL >= 0 ? '+' : ''}{fmt(d.cumPL, currency)}</title>
        </g>
      ))}
      {cumulative.filter((_, i) => i % Math.max(1, Math.floor(cumulative.length / 8)) === 0 || i === cumulative.length - 1).map((d, i, arr) => (
        <text key={i} x={toX(cumulative.indexOf(d))} y={H - 4} textAnchor="middle" fill="#78716c" fontSize="9">
          {d.month.slice(0, 7)}
        </text>
      ))}
    </svg>
  )
}

/** ROI distribution histogram */
function ROIHistogram({ salesWithROI }: { salesWithROI: Array<{ roi: number; holdDays: number; pl: number }> }) {
  const BUCKETS = [
    { label: '<-50%', min: -Infinity, max: -50, color: '#ef4444' },
    { label: '-50–-25%', min: -50, max: -25, color: '#f97316' },
    { label: '-25–0%', min: -25, max: 0, color: '#fbbf24' },
    { label: '0–25%', min: 0, max: 25, color: '#a3e635' },
    { label: '25–50%', min: 25, max: 50, color: '#34d399' },
    { label: '50–100%', min: 50, max: 100, color: '#2dd4bf' },
    { label: '>100%', min: 100, max: Infinity, color: '#818cf8' },
  ]
  const counts = BUCKETS.map(b => salesWithROI.filter(s => s.roi >= b.min && s.roi < b.max).length)
  const maxCount = Math.max(...counts, 1)
  const BAR_MAX_H = 80
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 w-full" style={{ height: BAR_MAX_H + 20 }}>
        {BUCKETS.map((b, i) => {
          const h = counts[i] > 0 ? Math.max((counts[i] / maxCount) * BAR_MAX_H, 4) : 0
          return (
            <div key={i} className="relative flex-1 group" style={{ height: BAR_MAX_H + 20 }}>
              {counts[i] > 0 && (
                <div
                  className="absolute z-10 pointer-events-none opacity-0 group-hover:opacity-100 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] text-stone-200 whitespace-nowrap transition-opacity"
                  style={{ bottom: 20 + h + 4, left: '50%', transform: 'translateX(-50%)' }}
                >
                  {counts[i]} sale{counts[i] !== 1 ? 's' : ''}
                </div>
              )}
              {counts[i] > 0 && (
                <div className="absolute w-full text-center text-[9px] text-stone-300 font-medium" style={{ bottom: 20 + h + 2, fontSize: 8 }}>
                  {counts[i]}
                </div>
              )}
              <div className="absolute left-0.5 right-0.5 rounded-t-sm" style={{ bottom: 20, height: h, background: b.color + 'bb' }} />
              <span className="absolute left-0 right-0 text-center text-[8px] text-stone-500 bottom-0 leading-tight" style={{ height: 18 }}>
                {b.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Hold time vs ROI scatter plot */
function HoldTimeScatter({ salesWithROI, currency }: {
  salesWithROI: Array<{ title: string; roi: number; holdDays: number; pl: number }>
  currency: string
}) {
  const W = 600; const H = 160; const PAD = { t: 8, r: 8, b: 28, l: 32 }
  const iW = W - PAD.l - PAD.r; const iH = H - PAD.t - PAD.b
  if (salesWithROI.length === 0) return null
  const maxDays = Math.max(...salesWithROI.map(s => s.holdDays), 30)
  const minROI = Math.min(...salesWithROI.map(s => s.roi), -10)
  const maxROI = Math.max(...salesWithROI.map(s => s.roi), 10)
  const roiRange = maxROI - minROI || 1
  const toX = (d: number) => PAD.l + (d / maxDays) * iW
  const toY = (roi: number) => PAD.t + (1 - (roi - minROI) / roiRange) * iH
  const zeroY = toY(0)
  // X axis labels
  const xLabels = [0, Math.round(maxDays / 4), Math.round(maxDays / 2), Math.round(maxDays * 3 / 4), maxDays]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {/* axes */}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#44403c" strokeWidth="1" />
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#44403c" strokeWidth="1" />
      {/* zero line */}
      {minROI < 0 && maxROI > 0 && (
        <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} stroke="#78716c" strokeWidth="1" strokeDasharray="4 3" />
      )}
      {/* x labels */}
      {xLabels.map(d => (
        <text key={d} x={toX(d)} y={H - 4} textAnchor="middle" fill="#78716c" fontSize="9">{d}d</text>
      ))}
      {/* y label */}
      <text x={4} y={PAD.t + iH / 2} textAnchor="middle" fill="#78716c" fontSize="9" transform={`rotate(-90, 6, ${PAD.t + iH / 2})`}>ROI%</text>
      {/* dots */}
      {salesWithROI.map((s, i) => (
        <g key={i}>
          <circle cx={toX(s.holdDays)} cy={toY(s.roi)} r="4" fill={s.roi >= 0 ? '#34d39988' : '#f8717188'} stroke={s.roi >= 0 ? '#34d399' : '#f87171'} strokeWidth="0.8" />
          <title>{s.title}{'\n'}ROI: {s.roi >= 0 ? '+' : ''}{s.roi}% | {s.holdDays} days | P&L: {s.pl >= 0 ? '+' : ''}{fmt(s.pl, currency)}</title>
        </g>
      ))}
    </svg>
  )
}

/** P&L by company horizontal bars */
function PLByCompanyChart({ data, currency }: {
  data: Array<{ name: string; pl: number; revenue: number; count: number; primaryColor?: string | null }>
  currency: string
}) {
  const maxAbs = Math.max(...data.map(d => Math.abs(d.pl)), 1)
  return (
    <div className="space-y-2">
      {data.slice(0, 10).map((c, i) => {
        const pct = (Math.abs(c.pl) / maxAbs) * 100
        const isProfit = c.pl >= 0
        const barColor = c.primaryColor && isProfit ? c.primaryColor + 'cc' : isProfit ? '#34d399' : '#f87171'
        return (
          <div key={i} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-stone-400 truncate max-w-[55%]">{c.name}</span>
              <span className={`font-medium ml-2 shrink-0 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                {isProfit ? '+' : ''}{fmt(c.pl, currency)}
                <span className="text-stone-600 ml-1">({c.count} sold)</span>
              </span>
            </div>
            <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SpendingPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [currency, setCurrency] = useState<string>(user?.preferredCurrency ?? 'EUR')
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [selectedCollectionYear, setSelectedCollectionYear] = useState<number>(0)
  const [salesYear, setSalesYear] = useState<number>(new Date().getFullYear())
  const [activeTab, setActiveTab] = useState<TabId>('collection')
  const [loadedTabs, setLoadedTabs] = useState<Set<TabId>>(new Set<TabId>(['collection']))
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { data: statsSettings } = useQuery<StatsSettings>({
    queryKey: ['stats-settings'],
    queryFn: () => authFetch('/stats/settings'),
    staleTime: 5 * 60_000,
  })

  const effectiveSettings: StatsSettings = statsSettings ?? { spending: true, sales: true, reading: true, features: true }
  const visibleTabs = TABS.filter(tab => {
    if (tab.id === 'spending') return effectiveSettings.spending
    if (tab.id === 'sales') return effectiveSettings.sales
    if (tab.id === 'pl') return effectiveSettings.spending && effectiveSettings.sales
    if (tab.id === 'reading') return effectiveSettings.reading
    if (tab.id === 'features') return effectiveSettings.features
    return true
  })

  // ── Per-module queries ───────────────────────────────────────────────────────
  const { data: collResp, isLoading: collLoading } = useQuery<ModuleResponse<{ collection: CollectionStats }>>({
    queryKey: ['stats-collection', currency, selectedCollectionYear],
    queryFn: () => authFetch(`/stats?currency=${currency}&module=collection${selectedCollectionYear > 0 ? `&year=${selectedCollectionYear}` : ''}`),
    enabled: loadedTabs.has('collection') || loadedTabs.has('reading'),
    staleTime: 5 * 60_000,
    refetchInterval: (query) => {
      const data = query.state.data as ModuleResponse<{ collection: CollectionStats }> | undefined
      return data?.isStale === true ? 3000 : false
    },
  })

  const { data: spResp, isLoading: spLoading } = useQuery<ModuleResponse<SpendingData>>({
    queryKey: ['stats-spending', currency, selectedYear],
    queryFn: () => authFetch(`/stats?currency=${currency}&module=spending&year=${selectedYear}`),
    enabled: loadedTabs.has('collection') || loadedTabs.has('spending'),
    staleTime: 5 * 60_000,
    refetchInterval: (query) => {
      const data = query.state.data as ModuleResponse<SpendingData> | undefined
      return data?.isStale === true ? 3000 : false
    },
  })

  const { data: salesResp, isLoading: salesLoading } = useQuery<ModuleResponse<SalesData>>({
    queryKey: ['stats-sales', currency, salesYear],
    queryFn: () => authFetch(`/stats?currency=${currency}&module=sales&year=${salesYear}`),
    enabled: loadedTabs.has('sales') || loadedTabs.has('pl'),
    staleTime: 5 * 60_000,
    refetchInterval: (query) => {
      const data = query.state.data as ModuleResponse<SalesData> | undefined
      return data?.isStale === true ? 3000 : false
    },
  })

  const { data: featResp, isLoading: featLoading } = useQuery<ModuleResponse<{ features: FeaturesStats }>>({
    queryKey: ['stats-features', currency],
    queryFn: () => authFetch(`/stats?currency=${currency}&module=features`),
    enabled: loadedTabs.has('features'),
    staleTime: 5 * 60_000,
    refetchInterval: (query) => {
      const data = query.state.data as ModuleResponse<{ features: FeaturesStats }> | undefined
      return data?.isStale === true ? 3000 : false
    },
  })

  // Reading tab reuses collection data (same snapshot)
  const readingCollection = collResp?.data?.collection

  const { data: currencyData } = useQuery<{ currencies: string[] }>({
    queryKey: ['stats-currencies'],
    queryFn: () => authFetch('/stats/currencies'),
    staleTime: 15 * 60_000,
  })

  // ── Derived data ─────────────────────────────────────────────────────────────
  const spending = spResp?.data
  const sales = salesResp?.data
  const collection = collResp?.data?.collection
  const features = featResp?.data?.features

  const activeModuleData = activeTab === 'collection' || activeTab === 'reading'
    ? collResp
    : activeTab === 'spending'
      ? spResp
      : activeTab === 'sales' || activeTab === 'pl'
        ? salesResp
        : featResp

  const anyStale = !!(spResp?.isStale || collResp?.isStale || salesResp?.isStale || featResp?.isStale)

  const availableYears = useMemo(() => {
    if (!spending?.byYear?.length) return [new Date().getFullYear()]
    return spending.byYear.map(y => y.year).sort((a, b) => b - a)
  }, [spending?.byYear])

  const availableCollectionYears = useMemo(() => {
    if (!spending?.byYear?.length) return []
    return spending.byYear.map(y => y.year).sort((a, b) => b - a)
  }, [spending?.byYear])

  const availableSalesYears = useMemo(() => {
    if (!sales?.salesByYear?.length) return [new Date().getFullYear()]
    return sales.salesByYear.map(y => y.year).sort((a, b) => b - a)
  }, [sales?.salesByYear])

  const isCurrentYear = selectedYear === new Date().getFullYear()

  const yearTotal = useMemo(() => {
    if (!spending) return 0
    return spending.byYear.find(y => y.year === selectedYear)?.amount ?? 0
  }, [spending, selectedYear])

  const yearBookCount = useMemo(() => {
    if (!spending) return 0
    return spending.byYearBooks?.find(y => y.year === selectedYear)?.count ?? 0
  }, [spending, selectedYear])

  const totalGross = useMemo(() => {
    if (!spending) return 0
    return spending.totalBasePrice + spending.totalShipping + spending.totalForwarding + spending.totalTax + spending.totalOtherFees
  }, [spending])

  const savings = useMemo(() => {
    if (!spending) return 0
    return spending.totalDiscounts + spending.totalRefunds
  }, [spending])

  function handleTabChange(tab: TabId) {
    setLoadedTabs(prev => new Set([...prev, tab]))
    setActiveTab(tab)
  }

  useEffect(() => {
    if (!visibleTabs.some(tab => tab.id === activeTab)) {
      setLoadedTabs(prev => new Set([...prev, 'collection']))
      setActiveTab('collection')
    }
  }, [activeTab, visibleTabs])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-100">Statistics</h1>
          <p className="text-stone-400 text-sm mt-1">Your collection &amp; spending analytics</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-stone-500 uppercase tracking-wider">Display in</span>
          <select
            value={currency}
            onChange={e => { setCurrency(e.target.value) }}
            className="bg-stone-900 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
          >
            {(currencyData?.currencies?.length ? currencyData.currencies : CURRENCIES).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['stats-settings'] })
              setSettingsOpen(true)
            }}
            className="flex items-center gap-1.5 border border-stone-700 text-stone-400 hover:text-stone-200 hover:border-stone-500 px-3 py-2 rounded-xl text-sm transition-colors"
          >
            <Settings size={13} />
            <span className="hidden sm:inline">Stats settings</span>
          </button>
        </div>
      </div>

      {anyStale && (
        <div className="bg-brand-950/30 border border-brand-800/40 rounded-2xl px-5 py-3 flex items-center gap-3">
          <RefreshCw size={14} className="text-brand-400 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-brand-300 font-medium">Refreshing statistics…</p>
            {activeModuleData?.computedAt && (
              <p className="text-xs text-stone-500 mt-0.5">
                Showing data from {formatTimeAgo(activeModuleData.computedAt)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 text-xs text-stone-600 leading-relaxed">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>Statistics are for reference only. Currency conversions use approximate historical exchange rates and may differ slightly from your actual bank or credit card figures.</span>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5 mb-4 p-1 bg-stone-900/60 border border-stone-800 rounded-xl">
        {visibleTabs.map(tab => {
          const tabIsStale = (
            (tab.id === 'collection' || tab.id === 'reading') ? collResp?.isStale
              : tab.id === 'spending' ? spResp?.isStale
                : (tab.id === 'sales' || tab.id === 'pl') ? salesResp?.isStale
                  : featResp?.isStale
          )
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors rounded-lg relative ${
                activeTab === tab.id
                  ? 'bg-stone-800 text-brand-400 border border-stone-700'
                  : 'text-stone-500 hover:text-stone-300 hover:bg-stone-800/50'
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
              {tabIsStale && loadedTabs.has(tab.id) && (
                <span className="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              )}
            </button>
          )
        })}
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-sm overflow-hidden">
            <StatsSettingsPanel onClose={() => setSettingsOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Collection Tab ─────────────────────────────────────────────────── */}
      {loadedTabs.has('collection') && (
        <div className={activeTab !== 'collection' ? 'hidden' : 'space-y-6'}>
          {collLoading ? <TabLoading /> : !collection ? (
            <div className="text-center py-20 text-stone-500">No data yet.</div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  onClick={() => setSelectedCollectionYear(0)}
                  className={`px-3 py-1 rounded-lg text-sm border transition-colors ${
                    selectedCollectionYear === 0
                      ? 'bg-brand-900/40 border-brand-700/60 text-brand-400'
                      : 'border-stone-700 text-stone-500 hover:border-stone-500 hover:text-stone-300'
                  }`}
                >
                  Overall
                </button>
                {availableCollectionYears.map(y => (
                  <button
                    key={y}
                    onClick={() => setSelectedCollectionYear(y)}
                    className={`px-3 py-1 rounded-lg text-sm border transition-colors ${
                      selectedCollectionYear === y
                        ? 'bg-brand-900/40 border-brand-700/60 text-brand-400'
                        : 'border-stone-700 text-stone-500 hover:border-stone-500 hover:text-stone-300'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Total Books"
                  value={String(collection.totalBooks)}
                  sub={`${collection.ownedCount} owned · ${collection.wishlistCount} wishlist`}
                  icon={Library}
                  accent
                />
                <StatCard
                  label="Signed"
                  value={`${collection.signedPercent}%`}
                  sub={`${collection.signedCount} signed books`}
                  icon={Award}
                />
                <StatCard
                  label="Unread Shelf"
                  value={`${collection.unreadPercent}%`}
                  sub={`${collection.unreadCount} unread owned`}
                  icon={BookOpen}
                />
                {effectiveSettings.reading && (
                  <StatCard
                    label="Currently Reading"
                    value={String(collection.readingCount)}
                    sub={`${collection.readCount} read total`}
                    icon={BookOpen}
                  />
                )}
              </div>

              {effectiveSettings.spending && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard
                    label="Unread Shelf Value"
                    value={fmt(collection.unreadShelfValue, currency)}
                    sub="books owned &amp; unread"
                    icon={BookOpen}
                  />
                  <StatCard
                    label="Preorder Pipeline"
                    value={fmt(collection.preorderValue, currency)}
                    sub={`${collection.preorderCount} on preorder`}
                    icon={Calendar}
                  />
                  <StatCard
                    label="Shipping Pipeline"
                    value={fmt(collection.shippingValue, currency)}
                    sub={`${collection.shippingCount} ${collection.shippingCount === 1 ? 'book' : 'books'} shipping`}
                    icon={Truck}
                  />
                </div>
              )}

              {collection.byCompanyAll.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                      <Layers size={14} className="text-brand-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Books by Company</h2>
                      <span className="ml-auto text-[10px] text-stone-600">{collection.byCompanyAll.length} companies</span>
                    </div>
                    <div className="divide-y divide-stone-800/50">
                      {collection.byCompanyAll.slice(0, 8).map((c, i) => {
                        const barPct = collection.byCompanyAll[0]?.books > 0 ? (c.books / collection.byCompanyAll[0].books) * 100 : 0
                        return (
                          <div key={c.slug} className="px-5 py-3 hover:bg-stone-800/30 transition-colors">
                            <div className="flex items-center gap-3 mb-1.5">
                              <span className="text-xs text-stone-600 w-4 text-right font-mono shrink-0">{i + 1}</span>
                              <span className="flex-1 text-sm text-stone-200 truncate">{c.name}</span>
                              <span className="text-sm font-semibold text-indigo-400 shrink-0">{c.books}</span>
                              <span className="text-xs text-stone-600 shrink-0">book{c.books !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="ml-7 h-1 bg-stone-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barPct}%`, background: c.primaryColor ? c.primaryColor + 'aa' : 'rgba(99,102,241,0.5)' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingBag size={14} className="text-brand-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Acquisition Sources</h2>
                    </div>
                    {(() => {
                      const { subscription, direct, unknown } = collection.acquisitionBreakdown
                      const total = subscription + direct + unknown
                      return (
                        <div className="space-y-3">
                          <CountBar label="Subscription boxes" count={subscription} total={total} color="#f59e0b" />
                          <CountBar label="Direct purchase" count={direct} total={total} color="#6366f1" />
                          {unknown > 0 && <CountBar label="Unknown" count={unknown} total={total} color="#6b7280" />}
                        </div>
                      )
                    })()}
                    {collection.bySubscriptionAll.length > 0 && (
                      <div className="pt-3 border-t border-stone-800 space-y-2">
                        <p className="text-xs uppercase tracking-wider text-stone-500">By Subscription</p>
                        {collection.bySubscriptionAll.slice(0, 5).map((s) => {
                          const barPct = collection.bySubscriptionAll[0]?.books > 0 ? (s.books / collection.bySubscriptionAll[0].books) * 100 : 0
                          return (
                            <div key={s.slug} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-stone-400 truncate">{s.name}</span>
                                <span className="text-stone-300 font-medium ml-2 shrink-0">{s.books}</span>
                              </div>
                              <div className="h-1 bg-stone-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-brand-500/50" style={{ width: `${barPct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {(collection.firstHandCount > 0 || collection.secondHandCount > 0) && (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Layers size={14} className="text-teal-400" />
                        <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Market Source</h2>
                      </div>
                      {(() => {
                        const total = collection.firstHandCount + collection.secondHandCount
                        return (
                          <div className="space-y-3">
                            <CountBar label="First-hand (new)" count={collection.firstHandCount} total={total} color="#14b8a6" />
                            <CountBar label="Second-hand" count={collection.secondHandCount} total={total} color="#f97316" />
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Spending Tab ────────────────────────────────────────────────────── */}
      {loadedTabs.has('spending') && (
        <div className={activeTab !== 'spending' ? 'hidden' : 'space-y-6'}>
          {spLoading ? <TabLoading /> : !spending ? (
            <div className="text-center py-20 text-stone-500">No data yet.</div>
          ) : (
            <>
              {/* All-time stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard label="All Time" value={fmt(spending.totalAllTime, currency)} icon={DollarSign} accent />
                <StatCard
                  label="Avg per Book"
                  value={fmt(spending.avgCostPerBook, currency)}
                  sub={`${spending.booksWithCost} books tracked`}
                  icon={BookOpen}
                />
                {savings > 0 && (
                  <StatCard
                    label="Total Saved"
                    value={fmt(savings, currency)}
                    sub="discounts + refunds"
                    icon={TrendingDown}
                    color="text-emerald-400"
                  />
                )}
              </div>

              {/* Year switcher */}
              <YearSwitcher years={availableYears} selected={selectedYear} onChange={setSelectedYear} />

              {/* Year stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard
                  label={`${selectedYear} Total`}
                  value={fmt(yearTotal, currency)}
                  sub={`${yearBookCount} book${yearBookCount !== 1 ? 's' : ''}`}
                  icon={Calendar}
                />
                {isCurrentYear && (
                  <StatCard label="This Month" value={fmt(spending.totalThisMonth, currency)} sub={`${spending.booksThisMonth} books`} icon={TrendingUp} />
                )}
                <StatCard
                  label={`${selectedYear} Books`}
                  value={String(yearBookCount)}
                  sub={`avg ${yearBookCount > 0 ? fmt(yearTotal / yearBookCount, currency) : '—'} / book`}
                  icon={Library}
                />
              </div>

              {/* Monthly charts + year chart */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-5">
                  <div className="flex items-center gap-2">
                    <BarChart2 size={14} className="text-brand-400" />
                    {effectiveSettings.sales && spending.salesByMonth.some(m => m.amount > 0) ? (
                      <>
                        <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Spending vs Sales — {selectedYear}</h2>
                        <div className="ml-auto flex items-center gap-3 text-[10px] text-stone-500">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-brand-500/70 inline-block" /> Spending</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500/70 inline-block" /> Sales</span>
                        </div>
                      </>
                    ) : (
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Spending — {selectedYear}</h2>
                    )}
                  </div>
                  {spending.byMonth.length === 0 ? (
                    <p className="text-stone-600 text-sm text-center py-8">No data for {selectedYear}</p>
                  ) : effectiveSettings.sales && spending.salesByMonth.some(m => m.amount > 0) ? (
                    <DualMonthChart spending={spending.byMonth} sales={spending.salesByMonth} currency={currency} />
                  ) : (
                    <MonthBarChart data={spending.byMonth} currency={currency} />
                  )}
                  {spending.byMonthBooks.length > 0 && (
                    <>
                      <div className="flex items-center justify-between pt-2 border-t border-stone-800/60">
                        <div className="flex items-center gap-2">
                          <Library size={12} className="text-indigo-400" />
                          <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Books — {selectedYear}</span>
                        </div>
                        {effectiveSettings.sales && spending.salesByMonthCount?.some(m => m.count > 0) && (
                          <div className="flex items-center gap-3 text-[10px] text-stone-500">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500/60 inline-block" /> Acquired</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500/55 inline-block" /> Sold</span>
                          </div>
                        )}
                      </div>
                      {effectiveSettings.sales && spending.salesByMonthCount?.some(m => m.count > 0) ? (
                        <DualMonthBooksChart acquired={spending.byMonthBooks} sold={spending.salesByMonthCount} />
                      ) : (
                        <MonthBooksChart data={spending.byMonthBooks} />
                      )}
                    </>
                  )}
                </div>

                {/* By Year — spending + sales + books */}
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-5">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-brand-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">By Year</h2>
                  </div>
                  {spending.byYear.length === 0 ? (
                    <p className="text-stone-600 text-sm text-center py-8">No data</p>
                  ) : effectiveSettings.sales && spending.salesByYear && spending.salesByYear.length > 0 ? (
                    <>
                      <div className="flex items-center gap-3 text-[10px] text-stone-500">
                        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-brand-600/70" /> Spending</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500/60" /> Sales</span>
                      </div>
                      <DualYearBarChart spending={spending.byYear} sales={spending.salesByYear} currency={currency} />
                    </>
                  ) : (
                    <YearBarChart data={spending.byYear} currency={currency} />
                  )}
                  {spending.byYearBooks && spending.byYearBooks.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 pt-2 border-t border-stone-800/60">
                        <Library size={12} className="text-indigo-400" />
                        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Books Acquired</span>
                      </div>
                      <YearBooksChart data={spending.byYearBooks} />
                    </>
                  )}
                </div>
              </div>

              {/* Cost breakdown + subscription */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Receipt size={14} className="text-brand-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Cost Breakdown</h2>
                  </div>
                  <CategoryBar label="Books (base price)" amount={spending.totalBasePrice} total={totalGross} currency={currency} color="#d97706" />
                  <CategoryBar label="Shipping" amount={spending.totalShipping} total={totalGross} currency={currency} color="#0891b2" />
                  {spending.totalForwarding > 0 && (
                    <CategoryBar label="Forwarding" amount={spending.totalForwarding} total={totalGross} currency={currency} color="#0d9488" />
                  )}
                  <CategoryBar label="Taxes & Customs" amount={spending.totalTax} total={totalGross} currency={currency} color="#7c3aed" />
                  <CategoryBar label="Other Fees" amount={spending.totalOtherFees} total={totalGross} currency={currency} color="#6b7280" />
                  {savings > 0 && (
                    <div className="pt-2 border-t border-stone-800 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-500">Discounts &amp; Refunds</span>
                        <span className="text-emerald-500 font-medium">- {fmt(savings, currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-stone-300">Net total</span>
                        <span className="text-brand-400">{fmt(spending.totalAllTime, currency)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                    <Tag size={14} className="text-brand-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Spending by Subscription</h2>
                  </div>
                  {spending.bySubscription.length === 0 ? (
                    <p className="text-stone-600 text-sm text-center py-8">No subscription data</p>
                  ) : (
                    <div className="divide-y divide-stone-800/50">
                      {spending.bySubscription.map((s, i) => {
                        const pct = spending.totalAllTime > 0 ? (s.amount / spending.totalAllTime) * 100 : 0
                        const maxAmt = spending.bySubscription[0]?.amount ?? 1
                        const barPct = maxAmt > 0 ? (s.amount / maxAmt) * 100 : 0
                        return (
                          <div key={s.slug} className="px-5 py-3.5 hover:bg-stone-800/30 transition-colors">
                            <div className="flex items-center gap-3 mb-1.5">
                              <span className="text-xs text-stone-600 w-4 text-right font-mono shrink-0">{i + 1}</span>
                              <span className="flex-1 text-sm font-medium text-stone-200 truncate">{s.name}</span>
                              <span className="text-sm font-semibold text-brand-400 shrink-0">{fmt(s.amount, currency)}</span>
                              <span className="text-xs text-stone-600 shrink-0">· {s.books}b</span>
                              <span className="text-[10px] text-stone-500 w-8 text-right shrink-0">{pct.toFixed(0)}%</span>
                            </div>
                            <div className="ml-7 h-1 bg-stone-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-brand-500/60 transition-all duration-700" style={{ width: `${barPct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Spending by company */}
              {spending.byCompany.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                    <Tag size={14} className="text-brand-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Spending by Company</h2>
                    <span className="ml-auto text-[10px] text-stone-600 font-medium">{spending.byCompany.length} companies</span>
                  </div>
                  <div className="divide-y divide-stone-800/50">
                    {spending.byCompany.map((c, i) => {
                      const pct = spending.totalAllTime > 0 ? (c.amount / spending.totalAllTime) * 100 : 0
                      const maxAmt = spending.byCompany[0]?.amount ?? 1
                      const barPct = maxAmt > 0 ? (c.amount / maxAmt) * 100 : 0
                      return (
                        <div key={c.slug} className="px-6 py-4 hover:bg-stone-800/30 transition-colors">
                          <div className="flex items-center gap-4 mb-2">
                            <span className="text-xs text-stone-600 w-5 text-right font-mono shrink-0">{i + 1}</span>
                            <span className="flex-1 text-sm font-medium text-stone-200 truncate">{c.name}</span>
                            <span className="text-sm font-semibold text-brand-400 shrink-0">{fmt(c.amount, currency)}</span>
                            <span className="text-xs text-stone-600 shrink-0">· {c.books} book{c.books !== 1 ? 's' : ''}</span>
                            <span className="text-[11px] text-stone-500 w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
                          </div>
                          <div className="ml-9 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barPct}%`, background: c.primaryColor ? c.primaryColor + 'aa' : 'rgba(245,158,11,0.6)' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Top 10 most expensive */}
              {spending.topExpensive.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                    <Award size={14} className="text-brand-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 10 Most Expensive</h2>
                  </div>
                  <div className="divide-y divide-stone-800/50">
                    {spending.topExpensive.map((book, i) => (
                      <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-stone-800/30 transition-colors">
                        <span className="text-xs text-stone-600 w-5 text-right font-mono">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-stone-100 font-medium truncate">{book.title}</p>
                          <p className="text-xs text-stone-500 truncate">{book.author}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-brand-400">{fmt(book.amount, currency)}</p>
                          <p className="text-xs text-stone-600">{book.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Sales Tab ───────────────────────────────────────────────────────── */}
      {loadedTabs.has('sales') && (
        <div className={activeTab !== 'sales' ? 'hidden' : 'space-y-6'}>
          {salesLoading ? <TabLoading /> : !sales ? (
            <div className="text-center py-20 text-stone-500">No data yet.</div>
          ) : sales.totalBooksSold === 0 ? (
            <div className="text-center py-20 text-stone-500">No sales data yet.</div>
          ) : (
            <>
              {/* Sales totals */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Total Revenue"
                  value={fmt(sales.totalSalesRevenue, currency)}
                  sub={`${sales.totalBooksSold} book${sales.totalBooksSold !== 1 ? 's' : ''} sold`}
                  icon={ShoppingBag}
                  accent
                />
                {sales.totalSalesProfit != null && (
                  <div className={`rounded-2xl p-5 border flex flex-col gap-2 ${sales.totalSalesProfit >= 0 ? 'bg-emerald-950/20 border-emerald-700/30' : 'bg-red-950/20 border-red-700/30'}`}>
                    <div className="flex items-center gap-2">
                      {sales.totalSalesProfit >= 0
                        ? <TrendingUp size={14} className="text-emerald-400" />
                        : <TrendingDown size={14} className="text-red-400" />}
                      <span className="text-xs uppercase tracking-wider text-stone-500">Net P&amp;L</span>
                    </div>
                    <p className={`text-base sm:text-xl font-serif font-bold leading-tight ${sales.totalSalesProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {sales.totalSalesProfit >= 0 ? '+' : ''}{fmt(sales.totalSalesProfit, currency)}
                    </p>
                    <p className="text-xs text-stone-500">revenue − purchase cost</p>
                  </div>
                )}
              </div>

              {/* Sales year switcher */}
              <YearSwitcher years={availableSalesYears} selected={salesYear} onChange={setSalesYear} />

              {/* Sales by year + sales by month */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-stone-900 border border-stone-800 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart2 size={14} className="text-green-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Sales Revenue — {salesYear}</h2>
                  </div>
                  {sales.salesByMonth.length === 0 ? (
                    <p className="text-stone-600 text-sm text-center py-8">No sales data for {salesYear}</p>
                  ) : (
                    <MonthBarChart
                      data={sales.salesByMonth.map(m => ({ ...m }))}
                      currency={currency}
                    />
                  )}
                </div>

                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar size={14} className="text-green-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">By Year</h2>
                  </div>
                  {sales.salesByYear.length === 0 ? (
                    <p className="text-stone-600 text-sm text-center py-8">No data</p>
                  ) : (
                    <YearBarChart data={sales.salesByYear} currency={currency} />
                  )}
                </div>
              </div>

              {/* Platform + company */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Tag size={14} className="text-green-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Sales by Platform</h2>
                  </div>
                  {sales.salesByPlatform.length === 0 ? (
                    <p className="text-stone-600 text-sm text-center py-8">No data</p>
                  ) : (
                    <div className="space-y-3">
                      {sales.salesByPlatform.map((p) => (
                        <div key={p.platform} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-stone-300 font-medium capitalize">{p.platform}</span>
                            <span className="text-stone-400">
                              {fmt(p.amount, currency)} <span className="text-stone-600">· {p.count} book{p.count !== 1 ? 's' : ''}</span>
                            </span>
                          </div>
                          <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-green-500/60 transition-all duration-500"
                              style={{ width: `${sales.totalSalesRevenue > 0 ? (p.amount / sales.totalSalesRevenue) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {sales.salesByCompany.length > 0 && (
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                      <Tag size={14} className="text-green-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Sales by Company</h2>
                    </div>
                    <div className="divide-y divide-stone-800/50">
                      {sales.salesByCompany.map((c, i) => {
                        const pct = sales.totalSalesRevenue > 0 ? (c.amount / sales.totalSalesRevenue) * 100 : 0
                        const maxAmt = sales.salesByCompany[0]?.amount ?? 1
                        const barPct = maxAmt > 0 ? (c.amount / maxAmt) * 100 : 0
                        return (
                          <div key={c.slug} className="px-6 py-4 hover:bg-stone-800/30 transition-colors">
                            <div className="flex items-center gap-4 mb-2">
                              <span className="text-xs text-stone-600 w-5 text-right font-mono shrink-0">{i + 1}</span>
                              <span className="flex-1 text-sm font-medium text-stone-200 truncate">{c.name}</span>
                              <span className="text-sm font-semibold text-green-400 shrink-0">{fmt(c.amount, currency)}</span>
                              <span className="text-xs text-stone-600 shrink-0">· {c.count} book{c.count !== 1 ? 's' : ''}</span>
                              <span className="text-[11px] text-stone-500 w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
                            </div>
                            <div className="ml-9 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barPct}%`, background: c.primaryColor ? c.primaryColor + 'aa' : 'rgba(34,197,94,0.6)' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Top 10 Highest Sale Prices */}
              {sales.topSalePrice.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                    <TrendingUp size={14} className="text-green-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 10 Highest Sale Prices</h2>
                  </div>
                  <div className="divide-y divide-stone-800/50">
                    {sales.topSalePrice.map((book, i) => (
                      <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-stone-800/30 transition-colors">
                        <span className="text-xs text-stone-600 w-5 text-right font-mono">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-stone-100 font-medium truncate">{book.title}</p>
                          <p className="text-xs text-stone-500 truncate">{book.author}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-green-400">{fmt(book.amount, currency)}</p>
                          <p className="text-xs text-stone-600">{book.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── P&L Tab ─────────────────────────────────────────────────────────── */}
      {loadedTabs.has('pl') && (
        <div className={activeTab !== 'pl' ? 'hidden' : 'space-y-6'}>
          {salesLoading ? <TabLoading /> : !sales ? (
            <div className="text-center py-20 text-stone-500">No data yet.</div>
          ) : sales.totalBooksSold === 0 ? (
            <div className="text-center py-20 text-stone-500">No sales data yet — sell some books to see P&L analysis.</div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {sales.plByMonth && sales.plByMonth.length > 0 && (() => {
                  const totalPL = sales.plByMonth.reduce((s, d) => s + d.pl, 0)
                  return (
                    <div className={`rounded-2xl p-5 border flex flex-col gap-2 ${totalPL >= 0 ? 'bg-emerald-950/20 border-emerald-700/30' : 'bg-red-950/20 border-red-700/30'}`}>
                      <div className="flex items-center gap-2">
                        <Scale size={14} className={totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                        <span className="text-xs uppercase tracking-wider text-stone-500">Overall P&amp;L</span>
                      </div>
                      <p className={`text-base sm:text-xl font-serif font-bold leading-tight ${totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {totalPL >= 0 ? '+' : ''}{fmt(totalPL, currency)}
                      </p>
                      <p className="text-xs text-stone-500">revenue − purchase cost</p>
                    </div>
                  )
                })()}
                <StatCard label="Total Revenue" value={fmt(sales.totalSalesRevenue, currency)} sub={`${sales.totalBooksSold} book${sales.totalBooksSold !== 1 ? 's' : ''} sold`} icon={ShoppingBag} />
                {sales.salesWithROI && sales.salesWithROI.length > 0 && (() => {
                  const avgROI = sales.salesWithROI.reduce((s, d) => s + d.roi, 0) / sales.salesWithROI.length
                  return (
                    <StatCard
                      label="Avg ROI"
                      value={`${avgROI >= 0 ? '+' : ''}${avgROI.toFixed(1)}%`}
                      sub={`${sales.salesWithROI.length} sale${sales.salesWithROI.length !== 1 ? 's' : ''} tracked`}
                      icon={TrendingUp}
                      color={avgROI >= 0 ? 'text-emerald-400' : 'text-red-400'}
                    />
                  )
                })()}
              </div>

              {/* Cumulative P&L + Monthly P&L trend */}
              {sales.plByMonth && sales.plByMonth.length > 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-emerald-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Cumulative P&amp;L</h2>
                    </div>
                    <CumulativePLChart plByMonth={sales.plByMonth} currency={currency} />
                  </div>
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <BarChart2 size={14} className="text-teal-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Monthly P&amp;L</h2>
                    </div>
                    <MonthlyPLBarChart data={sales.plByMonth} currency={currency} />
                  </div>
                </div>
              )}

              {/* ROI distribution + Hold time vs ROI */}
              {sales.salesWithROI && sales.salesWithROI.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-indigo-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">ROI Distribution</h2>
                      <span className="ml-auto text-[10px] text-stone-600">{sales.salesWithROI.length} sales</span>
                    </div>
                    <ROIHistogram salesWithROI={sales.salesWithROI} />
                  </div>
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Award size={14} className="text-brand-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Hold Time vs ROI</h2>
                      <span className="ml-auto text-[10px] text-stone-600">days held → profit %</span>
                    </div>
                    <HoldTimeScatter salesWithROI={sales.salesWithROI} currency={currency} />
                  </div>
                </div>
              )}

              {/* P&L by publisher */}
              {sales.plByCompany && sales.plByCompany.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Tag size={14} className="text-brand-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">P&amp;L by Publisher</h2>
                  </div>
                  <PLByCompanyChart data={sales.plByCompany} currency={currency} />
                </div>
              )}

              {/* Top profits + losses */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {sales.topProfit.length > 0 && (
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                      <TrendingUp size={14} className="text-emerald-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 10 Highest Profits</h2>
                    </div>
                    <div className="divide-y divide-stone-800/50">
                      {sales.topProfit.map((book, i) => (
                        <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-stone-800/30 transition-colors">
                          <span className="text-xs text-stone-600 w-5 text-right font-mono">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-stone-100 font-medium truncate">{book.title}</p>
                            <p className="text-xs text-stone-500 truncate">{book.author}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-emerald-400">+{fmt(book.amount, currency)}</p>
                            <p className="text-xs text-stone-600">cost {fmt(book.cost, currency)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {sales.topLoss.length > 0 && (
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                      <TrendingDown size={14} className="text-red-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 10 Biggest Losses</h2>
                    </div>
                    <div className="divide-y divide-stone-800/50">
                      {sales.topLoss.map((book, i) => (
                        <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-stone-800/30 transition-colors">
                          <span className="text-xs text-stone-600 w-5 text-right font-mono">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-stone-100 font-medium truncate">{book.title}</p>
                            <p className="text-xs text-stone-500 truncate">{book.author}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-red-400">{fmt(book.amount, currency)}</p>
                            <p className="text-xs text-stone-600">cost {fmt(book.cost, currency)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Features Tab ────────────────────────────────────────────────────── */}
      {loadedTabs.has('features') && (
        <div className={activeTab !== 'features' ? 'hidden' : 'space-y-6'}>
          {featLoading ? <TabLoading /> : !features ? (
            <div className="text-center py-20 text-stone-500">No data yet.</div>
          ) : features.booksWithAnyFeature === 0 ? (
            <div className="text-center py-20 text-stone-500">No feature data yet.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(features.byGroup).map(([group, items]) => (
                  <div key={group} className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-3">
                    <h3 className="text-xs uppercase tracking-wider text-brand-500 font-semibold capitalize">{group}</h3>
                    {items.map(item => (
                      <div key={item.slug} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-stone-300 truncate">{item.label}</span>
                          <span className="text-stone-500 ml-2 shrink-0">{item.count} ({item.percent}%)</span>
                        </div>
                        <div className="h-1 bg-stone-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-brand-500/40" style={{ width: `${item.percent}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Reading Tab ─────────────────────────────────────────────────────── */}
      {loadedTabs.has('reading') && (
        <div className={activeTab !== 'reading' ? 'hidden' : 'space-y-6'}>
          {collLoading ? <TabLoading /> : !readingCollection ? (
            <div className="text-center py-20 text-stone-500">No data yet.</div>
          ) : (() => {
            const rc = readingCollection
            const total = rc.readCount + rc.readingCount + rc.unreadCount + rc.dnfCount
            return (
              <>
                {/* Overview cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard label="Read" value={String(rc.readCount)} sub={total > 0 ? `${((rc.readCount / total) * 100).toFixed(1)}% of all` : undefined} icon={BookOpen} accent />
                  <StatCard label="Currently Reading" value={String(rc.readingCount)} icon={BookOpen} color="text-sky-400" />
                  <StatCard label="Unread" value={String(rc.unreadCount)} sub={`${rc.unreadPercent}% of owned`} icon={BookOpen} color="text-stone-400" />
                  <StatCard label="DNF" value={String(rc.dnfCount)} sub="did not finish" icon={BookOpen} color="text-orange-400" />
                </div>

                {/* Overall progress bar */}
                {total > 0 && (
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen size={14} className="text-brand-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Reading Progress</h2>
                    </div>
                    <div className="h-3 bg-stone-800 rounded-full overflow-hidden flex">
                      <div className="h-full bg-emerald-500/80 transition-all" style={{ width: `${(rc.readCount / total) * 100}%` }} title={`Read: ${rc.readCount}`} />
                      <div className="h-full bg-sky-500/70 transition-all" style={{ width: `${(rc.readingCount / total) * 100}%` }} title={`Reading: ${rc.readingCount}`} />
                      <div className="h-full bg-orange-500/60 transition-all" style={{ width: `${(rc.dnfCount / total) * 100}%` }} title={`DNF: ${rc.dnfCount}`} />
                    </div>
                    <div className="flex gap-4 text-[11px] text-stone-500 flex-wrap">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80 inline-block" />Read</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500/70 inline-block" />Reading</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-stone-800 ring-1 ring-stone-600 inline-block" />Unread</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500/60 inline-block" />DNF</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* By Subscription */}
                  {rc.readingBySubscription?.length > 0 && (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                        <Tag size={14} className="text-brand-400" />
                        <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Reading by Subscription</h2>
                      </div>
                      <div className="divide-y divide-stone-800/50">
                        {rc.readingBySubscription.map((s) => {
                          const t = s.read + s.reading + s.unread + s.dnf
                          return (
                            <div key={s.slug} className="px-5 py-3.5 hover:bg-stone-800/30 transition-colors space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-stone-200 truncate">{s.name}</span>
                                <span className="text-xs text-stone-500 ml-2 shrink-0">{t} books</span>
                              </div>
                              <div className="h-2 bg-stone-800 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500/80" style={{ width: `${t > 0 ? (s.read / t) * 100 : 0}%` }} title={`Read: ${s.read}`} />
                                <div className="h-full bg-sky-500/70" style={{ width: `${t > 0 ? (s.reading / t) * 100 : 0}%` }} title={`Reading: ${s.reading}`} />
                                <div className="h-full bg-orange-500/60" style={{ width: `${t > 0 ? (s.dnf / t) * 100 : 0}%` }} title={`DNF: ${s.dnf}`} />
                              </div>
                              <div className="flex gap-3 text-[10px] text-stone-500">
                                <span className="text-emerald-400">{s.read} read</span>
                                {s.reading > 0 && <span className="text-sky-400">{s.reading} reading</span>}
                                <span>{s.unread} unread</span>
                                {s.dnf > 0 && <span className="text-orange-400">{s.dnf} DNF</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* By Company */}
                  {rc.readingByCompany?.length > 0 && (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                        <Layers size={14} className="text-brand-400" />
                        <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Reading by Company</h2>
                      </div>
                      <div className="divide-y divide-stone-800/50">
                        {rc.readingByCompany.slice(0, 10).map((c) => {
                          const t = c.read + c.reading + c.unread + c.dnf
                          const barColor = c.primaryColor ? c.primaryColor + 'cc' : 'rgba(52,211,153,0.6)'
                          return (
                            <div key={c.slug} className="px-5 py-3.5 hover:bg-stone-800/30 transition-colors space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-stone-200 truncate">{c.name}</span>
                                <span className="text-xs text-stone-500 ml-2 shrink-0">{t} books</span>
                              </div>
                              <div className="h-2 bg-stone-800 rounded-full overflow-hidden flex">
                                <div className="h-full transition-all" style={{ width: `${t > 0 ? (c.read / t) * 100 : 0}%`, background: barColor }} title={`Read: ${c.read}`} />
                                <div className="h-full bg-sky-500/70" style={{ width: `${t > 0 ? (c.reading / t) * 100 : 0}%` }} title={`Reading: ${c.reading}`} />
                                <div className="h-full bg-orange-500/60" style={{ width: `${t > 0 ? (c.dnf / t) * 100 : 0}%` }} title={`DNF: ${c.dnf}`} />
                              </div>
                              <div className="flex gap-3 text-[10px] text-stone-500">
                                <span className="text-emerald-400">{c.read} read</span>
                                {c.reading > 0 && <span className="text-sky-400">{c.reading} reading</span>}
                                <span>{c.unread} unread</span>
                                {c.dnf > 0 && <span className="text-orange-400">{c.dnf} DNF</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
