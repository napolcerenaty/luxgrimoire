'use client'

import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import {
  TrendingUp, BookOpen, DollarSign, Truck, Receipt, Tag, BarChart2, Award,
  Calendar, ShoppingBag, TrendingDown, Library, Sparkles, ChevronLeft, ChevronRight,
  RefreshCw, Layers,
} from 'lucide-react'
import { CURRENCIES } from '@/lib/currencies'

// ─── Tab config ───────────────────────────────────────────────────────────────
type TabId = 'collection' | 'spending' | 'features' | 'sales'
const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'collection', label: 'Collection', icon: Library },
  { id: 'spending',   label: 'Spending',   icon: DollarSign },
  { id: 'features',   label: 'Features',   icon: Sparkles },
  { id: 'sales',      label: 'Sales',      icon: ShoppingBag },
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
  unreadPercent: number
  unreadShelfValue: number
  preorderValue: number
  shippingValue: number
  acquisitionBreakdown: { subscription: number; direct: number; unknown: number }
  bySubscriptionAll: Array<{ name: string; slug: string; books: number }>
  byCompanyAll: Array<{ name: string; slug: string; books: number }>
}

interface FeaturesStats {
  totalBooksAnalyzed: number
  booksWithAnyFeature: number
  booksWithAnyFeaturePercent: number
  byCategory: Array<{ slug: string; label: string; group: string; count: number; percent: number }>
  byGroup: Record<string, Array<{ slug: string; label: string; count: number; percent: number }>>
}

interface StatsData {
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
  totalTax: number
  totalOtherFees: number
  totalDiscounts: number
  totalRefunds: number
  byYear: Array<{ year: number; amount: number }>
  byYearBooks: Array<{ year: number; count: number }>
  byMonth: Array<{ month: string; amount: number }>
  byMonthBooks: Array<{ month: string; count: number }>
  bySubscription: Array<{ name: string; slug: string; amount: number; books: number }>
  byCompany: Array<{ name: string; slug: string; amount: number; books: number }>
  topExpensive: Array<{ title: string; author: string; amount: number; currency: string; date: string; editionSlug: string | null }>
  topSalePrice: Array<{ title: string; author: string; amount: number; currency: string; date: string; editionSlug: string | null }>
  topProfit: Array<{ title: string; author: string; amount: number; currency: string; cost: number; date: string; editionSlug: string | null }>
  topLoss: Array<{ title: string; author: string; amount: number; currency: string; cost: number; date: string; editionSlug: string | null }>
  totalSalesRevenue: number
  totalSalesProfit: number | null
  totalBooksSold: number
  salesByPlatform: Array<{ platform: string; amount: number; count: number }>
  salesByCompany: Array<{ name: string; slug: string; amount: number; count: number }>
  salesByMonth: Array<{ month: string; amount: number }>
  collection: CollectionStats
  features: FeaturesStats
}

interface StatsResponse {
  data: StatsData
  currency: string
  computedAt: string
  isStale: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, accent, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; accent?: boolean; color?: string
}) {
  return (
    <div className={`rounded-2xl p-5 border flex flex-col gap-2 ${accent ? 'bg-amber-950/30 border-amber-700/40' : 'bg-stone-900 border-stone-800'}`}>
      <div className="flex items-center gap-2">
        <Icon size={14} className={color ?? (accent ? 'text-amber-400' : 'text-stone-500')} />
        <span className="text-xs uppercase tracking-wider text-stone-500">{label}</span>
      </div>
      <p className={`text-2xl font-serif font-bold ${color ?? (accent ? 'text-amber-400' : 'text-stone-100')}`}>{value}</p>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
    </div>
  )
}

function SectionDivider({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="h-px flex-1 bg-stone-800" />
      <span className="text-xs uppercase tracking-widest text-stone-500 flex items-center gap-1.5">
        <Icon size={12} /> {label}
      </span>
      <div className="h-px flex-1 bg-stone-800" />
    </div>
  )
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
              className="absolute left-0.5 right-0.5 rounded-t-sm bg-amber-600/70 transition-all"
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

/** Dual bar chart — spending (amber) vs sales revenue (green) per month */
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
                {d.amount > 0 && <div className="text-amber-400">📚 {fmt(d.amount, currency)}</div>}
                {saleAmt > 0 && <div className="text-green-400">💰 {fmt(saleAmt, currency)}</div>}
              </div>
            )}
            {/* spending bar (left half) */}
            <div
              className="absolute rounded-t-sm bg-amber-500/70 transition-all"
              style={{ bottom: LABEL_H, left: 1, right: '50%', height: spH }}
            />
            {/* sales bar (right half) */}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SpendingPage() {
  const { user } = useAuth()
  const [currency, setCurrency] = useState<string>(user?.preferredCurrency ?? 'EUR')
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [activeTab, setActiveTab] = useState<TabId>('spending')
  const visitedTabs = useRef(new Set<TabId>(['spending']))

  const { data: resp, isLoading } = useQuery<StatsResponse>({
    queryKey: ['stats-v2', currency, selectedYear],
    queryFn: () => authFetch(`/stats?currency=${currency}&year=${selectedYear}`),
    staleTime: 5 * 60_000,
  })

  const stats = resp?.data

  const availableYears = useMemo(() => {
    if (!stats?.byYear) return [new Date().getFullYear()]
    return stats.byYear.map(y => y.year).sort((a, b) => b - a)
  }, [stats?.byYear])

  const yearIdx = availableYears.indexOf(selectedYear)
  const prevYear = yearIdx < availableYears.length - 1 ? availableYears[yearIdx + 1] : null
  const nextYear = yearIdx > 0 ? availableYears[yearIdx - 1] : null

  const totalGross = useMemo(() => {
    if (!stats) return 0
    return stats.totalBasePrice + stats.totalShipping + stats.totalTax + stats.totalOtherFees
  }, [stats])

  const savings = useMemo(() => {
    if (!stats) return 0
    return stats.totalDiscounts + stats.totalRefunds
  }, [stats])

  const yearTotal = useMemo(() => {
    if (!stats) return 0
    return stats.byYear.find(y => y.year === selectedYear)?.amount ?? 0
  }, [stats, selectedYear])

  const yearBookCount = useMemo(() => {
    if (!stats) return 0
    return stats.byYearBooks?.find(y => y.year === selectedYear)?.count ?? 0
  }, [stats, selectedYear])

  const isCurrentYear = selectedYear === new Date().getFullYear()

  function handleTabChange(tab: TabId) {
    visitedTabs.current.add(tab)
    setActiveTab(tab)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-100">Statistics</h1>
          <p className="text-stone-400 text-sm mt-1">Your collection &amp; spending analytics</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {resp?.isStale && (
            <div className="flex items-center gap-1.5 text-xs text-stone-500 animate-pulse">
              <RefreshCw size={11} className="animate-spin" />
              <span>Refreshing…</span>
            </div>
          )}
          <span className="text-xs text-stone-500 uppercase tracking-wider">Display in</span>
          <select
            value={currency}
            onChange={e => { setCurrency(e.target.value) }}
            className="bg-stone-900 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-stone-800">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-300 hover:border-stone-600'
            }`}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-stone-500 animate-pulse">Loading statistics…</div>
      ) : !stats ? (
        <div className="text-center py-20 text-stone-500">No data yet.</div>
      ) : (
        <>
          {/* ── Collection Tab ──────────────────────────────────────────────── */}
          {(activeTab === 'collection' || visitedTabs.current.has('collection')) && (
            <div className={activeTab !== 'collection' ? 'hidden' : 'space-y-6'}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Total Books"
                  value={String(stats.collection.totalBooks)}
                  sub={`${stats.collection.ownedCount} owned · ${stats.collection.wishlistCount} wishlist`}
                  icon={Library}
                  accent
                />
                <StatCard
                  label="Signed"
                  value={`${stats.collection.signedPercent}%`}
                  sub={`${stats.collection.signedCount} signed books`}
                  icon={Award}
                />
                <StatCard
                  label="Unread Shelf"
                  value={`${stats.collection.unreadPercent}%`}
                  sub={`${stats.collection.unreadCount} unread owned`}
                  icon={BookOpen}
                />
                <StatCard
                  label="Currently Reading"
                  value={String(stats.collection.readingCount)}
                  sub={`${stats.collection.readCount} read total`}
                  icon={BookOpen}
                />
              </div>

              {/* Pipeline values — always show preorder + shipping together */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Unread Shelf Value"
                  value={fmt(stats.collection.unreadShelfValue, currency)}
                  sub="books owned &amp; unread"
                  icon={BookOpen}
                />
                <StatCard
                  label="Preorder Pipeline"
                  value={fmt(stats.collection.preorderValue, currency)}
                  sub={`${stats.collection.preorderCount} on preorder`}
                  icon={Calendar}
                />
                <StatCard
                  label="Shipping Pipeline"
                  value={fmt(stats.collection.shippingValue, currency)}
                  sub={`${stats.collection.shippingCount} books shipping`}
                  icon={Truck}
                />
              </div>

              {/* Collection by company */}
              {stats.collection.byCompanyAll.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                      <Layers size={14} className="text-amber-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Books by Company</h2>
                      <span className="ml-auto text-[10px] text-stone-600">{stats.collection.byCompanyAll.length} companies</span>
                    </div>
                    <div className="divide-y divide-stone-800/50">
                      {stats.collection.byCompanyAll.slice(0, 8).map((c, i) => {
                        const barPct = stats.collection.byCompanyAll[0]?.books > 0 ? (c.books / stats.collection.byCompanyAll[0].books) * 100 : 0
                        return (
                          <div key={c.slug} className="px-5 py-3 hover:bg-stone-800/30 transition-colors">
                            <div className="flex items-center gap-3 mb-1.5">
                              <span className="text-xs text-stone-600 w-4 text-right font-mono shrink-0">{i + 1}</span>
                              <span className="flex-1 text-sm text-stone-200 truncate">{c.name}</span>
                              <span className="text-sm font-semibold text-indigo-400 shrink-0">{c.books}</span>
                              <span className="text-xs text-stone-600 shrink-0">book{c.books !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="ml-7 h-1 bg-stone-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-indigo-500/50 transition-all duration-700" style={{ width: `${barPct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingBag size={14} className="text-amber-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Acquisition Sources</h2>
                    </div>
                    {(() => {
                      const { subscription, direct, unknown } = stats.collection.acquisitionBreakdown
                      const total = subscription + direct + unknown
                      return (
                        <div className="space-y-3">
                          <CountBar label="Subscription boxes" count={subscription} total={total} color="#f59e0b" />
                          <CountBar label="Direct purchase" count={direct} total={total} color="#6366f1" />
                          {unknown > 0 && <CountBar label="Unknown" count={unknown} total={total} color="#6b7280" />}
                        </div>
                      )
                    })()}
                    {stats.collection.bySubscriptionAll.length > 0 && (
                      <div className="pt-3 border-t border-stone-800 space-y-2">
                        <p className="text-xs uppercase tracking-wider text-stone-500">By Subscription</p>
                        {stats.collection.bySubscriptionAll.slice(0, 5).map((s) => {
                          const barPct = stats.collection.bySubscriptionAll[0]?.books > 0 ? (s.books / stats.collection.bySubscriptionAll[0].books) * 100 : 0
                          return (
                            <div key={s.slug} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-stone-400 truncate">{s.name}</span>
                                <span className="text-stone-300 font-medium ml-2 shrink-0">{s.books}</span>
                              </div>
                              <div className="h-1 bg-stone-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-amber-500/50" style={{ width: `${barPct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Spending Tab ────────────────────────────────────────────────── */}
          {(activeTab === 'spending' || visitedTabs.current.has('spending')) && (
            <div className={activeTab !== 'spending' ? 'hidden' : 'space-y-6'}>
              {/* All-time stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard label="All Time" value={fmt(stats.totalAllTime, currency)} icon={DollarSign} accent />
                <StatCard
                  label="Avg per Book"
                  value={fmt(stats.avgCostPerBook, currency)}
                  sub={`${stats.booksWithCost} books tracked`}
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
              <div className="flex items-center gap-3 justify-between flex-wrap pt-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => prevYear && setSelectedYear(prevYear)}
                    disabled={!prevYear}
                    className="p-1.5 rounded-lg border border-stone-700 text-stone-400 hover:text-stone-100 hover:border-stone-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-lg font-semibold text-stone-200 min-w-[4ch] text-center">{selectedYear}</span>
                  <button
                    onClick={() => nextYear && setSelectedYear(nextYear)}
                    disabled={!nextYear}
                    className="p-1.5 rounded-lg border border-stone-700 text-stone-400 hover:text-stone-100 hover:border-stone-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {availableYears.map(y => (
                    <button
                      key={y}
                      onClick={() => setSelectedYear(y)}
                      className={`px-3 py-1 rounded-lg text-sm border transition-colors ${
                        y === selectedYear
                          ? 'bg-amber-900/40 border-amber-700/60 text-amber-400'
                          : 'border-stone-700 text-stone-500 hover:border-stone-500 hover:text-stone-300'
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>

              {/* Year-specific stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard
                  label={`${selectedYear} Total`}
                  value={fmt(yearTotal, currency)}
                  sub={`${yearBookCount} book${yearBookCount !== 1 ? 's' : ''}`}
                  icon={Calendar}
                />
                {isCurrentYear && (
                  <StatCard label="This Month" value={fmt(stats.totalThisMonth, currency)} sub={`${stats.booksThisMonth} books`} icon={TrendingUp} />
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
                    <BarChart2 size={14} className="text-amber-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Spending — {selectedYear}</h2>
                  </div>
                  {stats.byMonth.length === 0 ? (
                    <p className="text-stone-600 text-sm text-center py-8">No data for {selectedYear}</p>
                  ) : (
                    <MonthBarChart data={stats.byMonth} currency={currency} />
                  )}
                  {stats.byMonthBooks.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 pt-2 border-t border-stone-800/60">
                        <Library size={12} className="text-indigo-400" />
                        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Books Acquired — {selectedYear}</span>
                      </div>
                      <MonthBooksChart data={stats.byMonthBooks} />
                    </>
                  )}
                </div>

                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar size={14} className="text-amber-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">By Year</h2>
                  </div>
                  {stats.byYear.length === 0 ? (
                    <p className="text-stone-600 text-sm text-center py-8">No data</p>
                  ) : (
                    <YearBarChart data={stats.byYear} currency={currency} />
                  )}
                </div>
              </div>

              {/* Cost breakdown + subscription breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Receipt size={14} className="text-amber-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Cost Breakdown</h2>
                  </div>
                  <CategoryBar label="Books (base price)" amount={stats.totalBasePrice} total={totalGross} currency={currency} color="#d97706" />
                  <CategoryBar label="Shipping" amount={stats.totalShipping} total={totalGross} currency={currency} color="#0891b2" />
                  <CategoryBar label="Taxes & Customs" amount={stats.totalTax} total={totalGross} currency={currency} color="#7c3aed" />
                  <CategoryBar label="Other Fees" amount={stats.totalOtherFees} total={totalGross} currency={currency} color="#6b7280" />
                  {savings > 0 && (
                    <div className="pt-2 border-t border-stone-800 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-500">Discounts &amp; Refunds</span>
                        <span className="text-emerald-500 font-medium">- {fmt(savings, currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-stone-300">Net total</span>
                        <span className="text-amber-400">{fmt(stats.totalAllTime, currency)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                    <Tag size={14} className="text-amber-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Spending by Subscription</h2>
                  </div>
                  {stats.bySubscription.length === 0 ? (
                    <p className="text-stone-600 text-sm text-center py-8">No subscription data</p>
                  ) : (
                    <div className="divide-y divide-stone-800/50">
                      {stats.bySubscription.map((s, i) => {
                        const pct = stats.totalAllTime > 0 ? (s.amount / stats.totalAllTime) * 100 : 0
                        const maxAmt = stats.bySubscription[0]?.amount ?? 1
                        const barPct = maxAmt > 0 ? (s.amount / maxAmt) * 100 : 0
                        return (
                          <div key={s.slug} className="px-5 py-3.5 hover:bg-stone-800/30 transition-colors">
                            <div className="flex items-center gap-3 mb-1.5">
                              <span className="text-xs text-stone-600 w-4 text-right font-mono shrink-0">{i + 1}</span>
                              <span className="flex-1 text-sm font-medium text-stone-200 truncate">{s.name}</span>
                              <span className="text-sm font-semibold text-amber-400 shrink-0">{fmt(s.amount, currency)}</span>
                              <span className="text-xs text-stone-600 shrink-0">· {s.books}b</span>
                              <span className="text-[10px] text-stone-500 w-8 text-right shrink-0">{pct.toFixed(0)}%</span>
                            </div>
                            <div className="ml-7 h-1 bg-stone-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-amber-500/60 transition-all duration-700" style={{ width: `${barPct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Spending by company */}
              {stats.byCompany.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                    <Tag size={14} className="text-amber-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Spending by Company</h2>
                    <span className="ml-auto text-[10px] text-stone-600 font-medium">{stats.byCompany.length} companies</span>
                  </div>
                  <div className="divide-y divide-stone-800/50">
                    {stats.byCompany.map((c, i) => {
                      const pct = stats.totalAllTime > 0 ? (c.amount / stats.totalAllTime) * 100 : 0
                      const maxAmt = stats.byCompany[0]?.amount ?? 1
                      const barPct = maxAmt > 0 ? (c.amount / maxAmt) * 100 : 0
                      return (
                        <div key={c.slug} className="px-6 py-4 hover:bg-stone-800/30 transition-colors">
                          <div className="flex items-center gap-4 mb-2">
                            <span className="text-xs text-stone-600 w-5 text-right font-mono shrink-0">{i + 1}</span>
                            <span className="flex-1 text-sm font-medium text-stone-200 truncate">{c.name}</span>
                            <span className="text-sm font-semibold text-amber-400 shrink-0">{fmt(c.amount, currency)}</span>
                            <span className="text-xs text-stone-600 shrink-0">· {c.books} book{c.books !== 1 ? 's' : ''}</span>
                            <span className="text-[11px] text-stone-500 w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
                          </div>
                          <div className="ml-9 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-amber-500/60 transition-all duration-700" style={{ width: `${barPct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Top 10 most expensive + sale prices */}
              {stats.topExpensive.length > 0 && (
                <div className={`grid gap-4 ${stats.topSalePrice.length > 0 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                      <Award size={14} className="text-amber-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 10 Most Expensive</h2>
                    </div>
                    <div className="divide-y divide-stone-800/50">
                      {stats.topExpensive.map((book, i) => (
                        <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-stone-800/30 transition-colors">
                          <span className="text-xs text-stone-600 w-5 text-right font-mono">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-stone-100 font-medium truncate">{book.title}</p>
                            <p className="text-xs text-stone-500 truncate">{book.author}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-amber-400">{fmt(book.amount, currency)}</p>
                            <p className="text-xs text-stone-600">{book.date}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {stats.topSalePrice.length > 0 && (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                        <TrendingUp size={14} className="text-green-400" />
                        <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 10 Highest Sale Prices</h2>
                      </div>
                      <div className="divide-y divide-stone-800/50">
                        {stats.topSalePrice.map((book, i) => (
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
                </div>
              )}

              {/* Top 10 profits + losses */}
              {(stats.topProfit.length > 0 || stats.topLoss.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {stats.topProfit.length > 0 && (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                        <TrendingUp size={14} className="text-emerald-400" />
                        <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 10 Highest Profits</h2>
                      </div>
                      <div className="divide-y divide-stone-800/50">
                        {stats.topProfit.map((book, i) => (
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
                  {stats.topLoss.length > 0 && (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                        <TrendingDown size={14} className="text-red-400" />
                        <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 10 Biggest Losses</h2>
                      </div>
                      <div className="divide-y divide-stone-800/50">
                        {stats.topLoss.map((book, i) => (
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
              )}
            </div>
          )}

          {/* ── Features Tab ────────────────────────────────────────────────── */}
          {(activeTab === 'features' || visitedTabs.current.has('features')) && (
            <div className={activeTab !== 'features' ? 'hidden' : 'space-y-6'}>
              {stats.features.booksWithAnyFeature === 0 ? (
                <div className="text-center py-20 text-stone-500">No feature data yet.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <StatCard
                      label="Books with Features"
                      value={`${stats.features.booksWithAnyFeaturePercent}%`}
                      sub={`${stats.features.booksWithAnyFeature} of ${stats.features.totalBooksAnalyzed}`}
                      icon={Sparkles}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(stats.features.byGroup).map(([group, items]) => (
                      <div key={group} className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-3">
                        <h3 className="text-xs uppercase tracking-wider text-amber-500 font-semibold capitalize">{group}</h3>
                        {items.map(item => (
                          <div key={item.slug} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-stone-300 truncate">{item.label}</span>
                              <span className="text-stone-500 ml-2 shrink-0">{item.count} ({item.percent}%)</span>
                            </div>
                            <div className="h-1 bg-stone-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-amber-500/40" style={{ width: `${item.percent}%` }} />
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

          {/* ── Sales Tab ───────────────────────────────────────────────────── */}
          {(activeTab === 'sales' || visitedTabs.current.has('sales')) && (
            <div className={activeTab !== 'sales' ? 'hidden' : 'space-y-6'}>
              {stats.totalBooksSold === 0 ? (
                <div className="text-center py-20 text-stone-500">No sales data yet.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <StatCard
                      label="Total Revenue"
                      value={fmt(stats.totalSalesRevenue, currency)}
                      sub={`${stats.totalBooksSold} book${stats.totalBooksSold !== 1 ? 's' : ''} sold`}
                      icon={ShoppingBag}
                    />
                    {stats.totalSalesProfit != null && (
                      <div className={`rounded-2xl p-5 border flex flex-col gap-2 ${stats.totalSalesProfit >= 0 ? 'bg-emerald-950/20 border-emerald-700/30' : 'bg-red-950/20 border-red-700/30'}`}>
                        <div className="flex items-center gap-2">
                          {stats.totalSalesProfit >= 0
                            ? <TrendingUp size={14} className="text-emerald-400" />
                            : <TrendingDown size={14} className="text-red-400" />}
                          <span className="text-xs uppercase tracking-wider text-stone-500">Net P&amp;L</span>
                        </div>
                        <p className={`text-2xl font-serif font-bold ${stats.totalSalesProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {stats.totalSalesProfit >= 0 ? '+' : ''}{fmt(stats.totalSalesProfit, currency)}
                        </p>
                        <p className="text-xs text-stone-500">revenue − purchase cost</p>
                      </div>
                    )}
                    <StatCard
                      label="Spent vs Sold"
                      value={fmt(stats.totalAllTime - stats.totalSalesRevenue, currency)}
                      sub="net books investment"
                      icon={DollarSign}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <BarChart2 size={14} className="text-amber-400" />
                          <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Spending vs Sales</h2>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-stone-500">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/70 inline-block" /> Spending</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500/70 inline-block" /> Sales</span>
                        </div>
                      </div>
                      <DualMonthChart spending={stats.byMonth} sales={stats.salesByMonth} currency={currency} />
                    </div>

                    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Tag size={14} className="text-green-400" />
                        <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Sales by Platform</h2>
                      </div>
                      {stats.salesByPlatform.length === 0 ? (
                        <p className="text-stone-600 text-sm text-center py-8">No data</p>
                      ) : (
                        <div className="space-y-3">
                          {stats.salesByPlatform.map((p) => (
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
                                  style={{ width: `${stats.totalSalesRevenue > 0 ? (p.amount / stats.totalSalesRevenue) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {stats.salesByCompany.length > 0 && (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                        <Tag size={14} className="text-green-400" />
                        <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Sales by Company</h2>
                        <span className="ml-auto text-[10px] text-stone-600 font-medium">{stats.salesByCompany.length} companies</span>
                      </div>
                      <div className="divide-y divide-stone-800/50">
                        {stats.salesByCompany.map((c, i) => {
                          const pct = stats.totalSalesRevenue > 0 ? (c.amount / stats.totalSalesRevenue) * 100 : 0
                          const maxAmt = stats.salesByCompany[0]?.amount ?? 1
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
                                <div className="h-full rounded-full bg-green-500/60 transition-all duration-700" style={{ width: `${barPct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
