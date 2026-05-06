'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { TrendingUp, BookOpen, DollarSign, Truck, Receipt, Tag, BarChart2, Award, Calendar, ShoppingBag, TrendingDown } from 'lucide-react'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN', 'CHF', 'CAD', 'AUD']

interface ComprehensiveStats {
  currency: string
  totalAllTime: number
  totalThisYear: number
  totalThisMonth: number
  avgCostPerBook: number
  booksWithCost: number
  totalBasePrice: number
  totalShipping: number
  totalTax: number
  totalOtherFees: number
  totalDiscounts: number
  totalRefunds: number
  byYear: Array<{ year: number; amount: number }>
  byMonth: Array<{ month: string; amount: number }>
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
}

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string; icon: React.ElementType; accent?: boolean
}) {
  return (
    <div className={`rounded-2xl p-5 border flex flex-col gap-2 ${accent ? 'bg-amber-950/30 border-amber-700/40' : 'bg-stone-900 border-stone-800'}`}>
      <div className="flex items-center gap-2">
        <Icon size={14} className={accent ? 'text-amber-400' : 'text-stone-500'} />
        <span className="text-xs uppercase tracking-wider text-stone-500">{label}</span>
      </div>
      <p className={`text-2xl font-serif font-bold ${accent ? 'text-amber-400' : 'text-stone-100'}`}>{value}</p>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
    </div>
  )
}

function MonthBarChart({ data, currency }: { data: Array<{ month: string; amount: number }>; currency: string }) {
  const months = data.slice(-12)
  const max = Math.max(...months.map(d => d.amount), 1)
  return (
    <div className="flex items-end gap-1 h-28 w-full">
      {months.map((d, i) => {
        const pct = (d.amount / max) * 100
        const monthName = new Date(d.month + '-01').toLocaleString('en', { month: 'short' })
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            {d.amount > 0 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] text-stone-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                {fmt(d.amount, currency)}
              </div>
            )}
            <div
              className="w-full rounded-t-sm transition-all"
              style={{
                height: `${Math.max(pct, d.amount > 0 ? 4 : 0)}%`,
                background: d.amount > 0 ? 'rgba(245,158,11,0.75)' : 'transparent',
                minHeight: d.amount > 0 ? '4px' : '0',
              }}
            />
            <span className="text-[9px] text-stone-600">{monthName}</span>
          </div>
        )
      })}
    </div>
  )
}

function YearBarChart({ data, currency }: { data: Array<{ year: number; amount: number }>; currency: string }) {
  const max = Math.max(...data.map(d => d.amount), 1)
  return (
    <div className="flex items-end gap-2 h-20 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] text-stone-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
            {fmt(d.amount, currency)}
          </div>
          <div
            className="w-full rounded-t-sm bg-amber-600/70 transition-all"
            style={{ height: `${(d.amount / max) * 100}%`, minHeight: '4px' }}
          />
          <span className="text-[9px] text-stone-500">{d.year}</span>
        </div>
      ))}
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

/** Dual bar chart — spending (amber) vs sales revenue (green) per month */
function DualMonthChart({
  spending, sales, currency,
}: {
  spending: Array<{ month: string; amount: number }>
  sales: Array<{ month: string; amount: number }>
  currency: string
}) {
  const months = spending.slice(-12)
  const salesSlice = sales.slice(-12)
  const max = Math.max(...months.map((d, i) => Math.max(d.amount, salesSlice[i]?.amount ?? 0)), 1)
  return (
    <div className="flex items-end gap-1 h-32 w-full">
      {months.map((d, i) => {
        const sale = salesSlice[i] ?? { amount: 0 }
        const spPct = (d.amount / max) * 100
        const salePct = (sale.amount / max) * 100
        const monthName = new Date(d.month + '-01').toLocaleString('en', { month: 'short' })
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-[10px] text-stone-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none space-y-0.5">
              <div><span className="text-amber-400">📚 {fmt(d.amount, currency)}</span></div>
              {sale.amount > 0 && <div><span className="text-green-400">💰 {fmt(sale.amount, currency)}</span></div>}
            </div>
            <div className="w-full flex items-end gap-px" style={{ height: '100%' }}>
              <div
                className="flex-1 rounded-t-sm bg-amber-500/70 transition-all"
                style={{ height: `${Math.max(spPct, d.amount > 0 ? 4 : 0)}%`, minHeight: d.amount > 0 ? '3px' : '0' }}
              />
              <div
                className="flex-1 rounded-t-sm bg-green-500/70 transition-all"
                style={{ height: `${Math.max(salePct, sale.amount > 0 ? 4 : 0)}%`, minHeight: sale.amount > 0 ? '3px' : '0' }}
              />
            </div>
            <span className="text-[9px] text-stone-600">{monthName}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function SpendingPage() {
  const { user } = useAuth()
  const [currency, setCurrency] = useState<string>(user?.preferredCurrency ?? 'EUR')

  const { data: stats, isLoading } = useQuery<ComprehensiveStats>({
    queryKey: ['spending-stats-v2', currency],
    queryFn: () => authFetch(`/spending/stats/v2?currency=${currency}`),
    staleTime: 5 * 60_000,
  })

  const totalGross = useMemo(() => {
    if (!stats) return 0
    return stats.totalBasePrice + stats.totalShipping + stats.totalTax + stats.totalOtherFees
  }, [stats])

  const savings = useMemo(() => {
    if (!stats) return 0
    return stats.totalDiscounts + stats.totalRefunds
  }, [stats])

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-100">Spending</h1>
          <p className="text-stone-400 text-sm mt-1">Your book spending statistics</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500 uppercase tracking-wider">Display in</span>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="bg-stone-900 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-stone-500 animate-pulse">Loading statistics…</div>
      ) : !stats ? (
        <div className="text-center py-20 text-stone-500">No spending data yet.</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <StatCard label="All Time" value={fmt(stats.totalAllTime, currency)} icon={DollarSign} accent />
            <StatCard label="This Year" value={fmt(stats.totalThisYear, currency)} icon={Calendar} />
            <StatCard label="This Month" value={fmt(stats.totalThisMonth, currency)} icon={TrendingUp} />
            <StatCard
              label="Avg per Book"
              value={fmt(stats.avgCostPerBook, currency)}
              sub={`${stats.booksWithCost} books tracked`}
              icon={BookOpen}
            />
          </div>

          {/* Monthly & yearly charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-stone-900 border border-stone-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={14} className="text-amber-400" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Monthly (last 12 months)</h2>
              </div>
              <MonthBarChart data={stats.byMonth} currency={currency} />
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

            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Tag size={14} className="text-amber-400" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">By Subscription</h2>
              </div>
              {stats.bySubscription.length === 0 ? (
                <p className="text-stone-600 text-sm text-center py-8">No subscription data</p>
              ) : (
                <div className="space-y-3">
                  {stats.bySubscription.map((s) => {
                    const pct = stats.totalAllTime > 0 ? (s.amount / stats.totalAllTime) * 100 : 0
                    return (
                      <div key={s.slug} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-stone-300 font-medium">{s.name}</span>
                          <span className="text-stone-400">
                            {fmt(s.amount, currency)} <span className="text-stone-600">· {s.books} books</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-amber-500/70 transition-all duration-500" style={{ width: `${pct}%` }} />
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
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Tag size={14} className="text-amber-400" />
                <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">By Company</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stats.byCompany.map((c) => {
                  const pct = stats.totalAllTime > 0 ? (c.amount / stats.totalAllTime) * 100 : 0
                  return (
                    <div key={c.slug} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-stone-300 font-medium">{c.name}</span>
                        <span className="text-stone-400">
                          {fmt(c.amount, currency)} <span className="text-stone-600">· {c.books} books</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500/60 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Top 10 most expensive + sale prices side by side */}
          {stats.topExpensive.length > 0 && (
            <div className={`grid gap-4 ${stats.topSalePrice.length > 0 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>

              {/* Top 10 most expensive */}
              <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-6 py-4 border-b border-stone-800">
                  <Award size={14} className="text-amber-400" />
                  <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Top 10 Most Expensive Books</h2>
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

              {/* Top 10 highest sale prices */}
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

          {/* Top 10 profits + losses side by side */}
          {(stats.topProfit.length > 0 || stats.topLoss.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Top 10 highest profits */}
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

              {/* Top 10 biggest losses */}
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

          {/* Savings summary */}
          {savings > 0 && (
            <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-2xl p-5 flex items-center gap-4">
              <Truck size={20} className="text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-400">You saved {fmt(savings, currency)}</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {fmt(stats.totalDiscounts, currency)} in discounts + {fmt(stats.totalRefunds, currency)} in refunds
                </p>
              </div>
            </div>
          )}

          {/* ── Sales section ─────────────────────────────────────────── */}
          {stats.totalBooksSold > 0 && (
            <>
              <div className="flex items-center gap-3 pt-2">
                <div className="h-px flex-1 bg-stone-800" />
                <span className="text-xs uppercase tracking-widest text-stone-500 flex items-center gap-1.5">
                  <ShoppingBag size={12} /> Sales
                </span>
                <div className="h-px flex-1 bg-stone-800" />
              </div>

              {/* Sales summary cards */}
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

              {/* Spending vs Sales dual chart + Platform breakdown + Company breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BarChart2 size={14} className="text-amber-400" />
                      <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Spending vs Sales (12m)</h2>
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

              {/* Sales by company */}
              {stats.salesByCompany.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Tag size={14} className="text-green-400" />
                    <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Sales by Company</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {stats.salesByCompany.map((c) => (
                      <div key={c.slug} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-stone-300 font-medium">{c.name}</span>
                          <span className="text-stone-400">
                            {fmt(c.amount, currency)} <span className="text-stone-600">· {c.count} book{c.count !== 1 ? 's' : ''}</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-green-500/60 transition-all duration-500"
                            style={{ width: `${stats.totalSalesRevenue > 0 ? (c.amount / stats.totalSalesRevenue) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
