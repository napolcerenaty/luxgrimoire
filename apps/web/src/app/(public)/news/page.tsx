'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ExternalLink, Newspaper } from 'lucide-react'
import { getPublicNews, type ApiNewsItem } from '@/lib/api'
import { useNewsUnreadCount } from '@/components/news/useNewsUnreadCount'

const TYPE_LABELS: Record<string, string> = {
  NEW_SUBSCRIPTION: 'New subscription',
  CONTINUATION: 'Continuation',
  TEASER: 'Teaser',
  SALE_ANNOUNCEMENT: 'Sale announcement',
  MONTH_THEME: 'Month theme',
  OTHER: 'News',
}

function formatDayHeading(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function groupByDay(items: ApiNewsItem[]): { day: string; items: ApiNewsItem[] }[] {
  const groups = new Map<string, ApiNewsItem[]>()
  for (const item of items) {
    if (!item.publishedAt) continue
    const day = item.publishedAt.slice(0, 10)
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day)!.push(item)
  }
  return Array.from(groups.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, items]) => ({ day, items }))
}

function NewsCard({ item }: { item: ApiNewsItem }) {
  return (
    <div className="rounded-xl border border-stone-700 bg-stone-800/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">
            {TYPE_LABELS[item.type] ?? item.type} · {item.companyName}
          </span>
          <h3 className="text-stone-100 font-serif font-semibold mt-1">{item.title}</h3>
          {item.summary && <p className="text-sm text-stone-400 mt-1.5 leading-relaxed">{item.summary}</p>}
          {item.lastUpdatedAt && (
            <p className="text-xs text-stone-600 mt-2">Updated {new Date(item.lastUpdatedAt).toLocaleDateString()}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-stone-700/60">
        {item.appEntityLink && (
          <Link href={item.appEntityLink} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            View in LuxGrimoire →
          </Link>
        )}
        {item.originalSourceUrl && (
          <a
            href={item.originalSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-stone-500 hover:text-stone-300 transition-colors flex items-center gap-1"
          >
            Source <ExternalLink size={11} />
          </a>
        )}
        {!item.appEntityLink && !item.originalSourceUrl && (
          <span className="text-xs text-stone-600">Source: {item.companyName}</span>
        )}
      </div>
    </div>
  )
}

export default function NewsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dateParam = searchParams.get('date') ?? undefined
  const { markSeen } = useNewsUnreadCount()
  const [page, setPage] = useState(1)

  // Opening the full list is what clears the badge (spec 8) — not the homepage teaser.
  useEffect(() => {
    markSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['public-news', page, dateParam],
    queryFn: () => getPublicNews({ page, pageSize: 20, date: dateParam }),
  })

  const groups = useMemo(() => groupByDay(data?.data ?? []), [data])

  const setDate = (value: string) => {
    setPage(1)
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('date', value)
    else params.delete('date')
    router.push(`/news?${params.toString()}`)
  }

  const shiftDay = (deltaDays: number) => {
    const base = dateParam ? new Date(`${dateParam}T00:00:00Z`) : new Date()
    base.setUTCDate(base.getUTCDate() + deltaDays)
    setDate(base.toISOString().slice(0, 10))
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <Newspaper className="text-amber-400" size={22} />
        <h1 className="text-2xl font-serif font-bold text-stone-100">News</h1>
      </div>

      {/* Jump-to-date (spec 9.1) */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => shiftDay(-1)} className="p-1.5 rounded-lg text-stone-400 hover:text-amber-400 hover:bg-stone-800 transition-colors" aria-label="Previous day">
          <ChevronLeft size={16} />
        </button>
        <input
          type="date"
          value={dateParam ?? ''}
          onChange={(e) => setDate(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 focus:outline-none focus:border-amber-400"
        />
        <button onClick={() => shiftDay(1)} className="p-1.5 rounded-lg text-stone-400 hover:text-amber-400 hover:bg-stone-800 transition-colors" aria-label="Next day">
          <ChevronRight size={16} />
        </button>
        {dateParam && (
          <button onClick={() => setDate('')} className="text-xs text-stone-500 hover:text-amber-400 transition-colors ml-1">
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-stone-500 text-sm text-center py-16">
          {dateParam ? 'No news on this day.' : 'No news yet — check back soon.'}
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map(({ day, items }) => (
            <div key={day}>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">{formatDayHeading(day)}</h2>
              <div className="space-y-3">
                {items.map((item) => <NewsCard key={item.id} item={item} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg text-sm text-stone-400 hover:text-amber-400 disabled:opacity-30 disabled:hover:text-stone-400 transition-colors"
          >
            ← Newer
          </button>
          <span className="text-xs text-stone-600">Page {data.meta.page} / {data.meta.totalPages}</span>
          <button
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg text-sm text-stone-400 hover:text-amber-400 disabled:opacity-30 disabled:hover:text-stone-400 transition-colors"
          >
            Older →
          </button>
        </div>
      )}
    </div>
  )
}
