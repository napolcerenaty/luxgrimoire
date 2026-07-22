'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { authFetch } from '@/lib/authFetch'
import { MonthPicker } from '@/components/ui/MonthPicker'

interface GapItem {
  subscriptionId: string
  slug: string
  name: string
  companyName: string
  companySlug: string
  isContentStream: boolean
  status: 'missing_month' | 'missing_book'
}
interface GapsResponse {
  year: number
  month: number
  totalEligible: number
  gaps: GapItem[]
}

export default function SubscriptionMonthGapsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const now = new Date()

  const [year, setYear] = useState(() => Number(searchParams.get('year')) || now.getFullYear())
  const [month, setMonth] = useState(() => Number(searchParams.get('month')) || now.getMonth() + 1)
  const [search, setSearch] = useState('')

  // Keep the selected month reflected in the URL so browser back-navigation restores it,
  // instead of resetting to the current month. router.replace (not push) avoids polluting
  // history with an entry per month change.
  useEffect(() => {
    router.replace(`/admin/subscription-month-gaps?year=${year}&month=${month}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const { data, isLoading } = useQuery<GapsResponse>({
    queryKey: ['admin', 'subscription-month-gaps', year, month],
    queryFn: () => authFetch<GapsResponse>(`/subscriptions/admin/month-gaps?year=${year}&month=${month}`),
  })

  const filteredGaps = data?.gaps.filter((g) =>
    g.name.toLowerCase().includes(search.trim().toLowerCase())
  ) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-100">Subscription Month Gaps</h1>
        <p className="mt-1 text-sm text-stone-400">
          Content-stream and direct-month subscriptions (no combos, no multi-month bundles) missing a month or missing books for the selected month.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
        <input
          type="search"
          placeholder="Search by subscription name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-400 w-64"
        />
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-stone-800 bg-stone-900 p-6 text-sm text-stone-400">
          Scanning…
        </div>
      ) : !data || data.gaps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-700 bg-stone-900/70 p-8 text-center text-sm text-stone-400">
          {data
            ? `No gaps for this month — all ${data.totalEligible} eligible subscriptions have their month and books.`
            : 'No eligible subscriptions this month.'}
        </div>
      ) : filteredGaps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-700 bg-stone-900/70 p-8 text-center text-sm text-stone-400">
          No gaps match "{search}".
        </div>
      ) : (
        <div className="space-y-2">
          {filteredGaps.map((g) => (
            <Link
              key={`${g.subscriptionId}-${g.status}`}
              href={`/admin/subscriptions/${g.slug}/months?year=${year}&month=${month}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-stone-800 bg-stone-900 px-4 py-3 transition-colors hover:border-amber-700/60"
            >
              <div className="min-w-0">
                <span className="font-medium text-stone-100">{g.name}</span>
                <span className="ml-2 text-sm text-stone-500">{g.companyName}</span>
                {g.isContentStream && (
                  <span className="ml-2 rounded-full bg-stone-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-stone-400">
                    content stream
                  </span>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  g.status === 'missing_month'
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-amber-500/15 text-amber-400'
                }`}
              >
                {g.status === 'missing_month' ? 'Missing month' : 'Missing books'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
