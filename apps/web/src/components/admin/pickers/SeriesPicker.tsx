'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'

const INP = 'w-full bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 focus:outline-none focus:border-brand-400 text-sm'

interface ApiBookSeriesItem {
  id: string
  slug: string
  name: string
  bookCount?: number
  authors?: string[]
}

export function SeriesPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState(value)
  const [dq, setDq] = useState('')
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync internal input with value set programmatically (e.g. from AI parser)
  useEffect(() => {
    setQ(value)
  }, [value])

  const { data: seriesResults, isFetching } = useQuery({
    queryKey: ['series-search', dq],
    queryFn: () => authFetch<{ data: ApiBookSeriesItem[] }>(`/book-series?search=${encodeURIComponent(dq)}&pageSize=20`),
    enabled: dq.length >= 1,
    select: (res) => res.data,
  })

  const handleChange = (v: string) => {
    setQ(v); onChange(v); setOpen(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDq(v), 300)
  }

  const pick = (name: string) => {
    setQ(name); onChange(name); setOpen(false); setDq('')
  }

  return (
    <div className="relative">
      <input value={q} onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (q.length >= 1) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Series name…" className={INP} />
      {open && q.length >= 1 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-navy-800 border border-navy-700 rounded-xl mt-1 shadow-2xl max-h-48 overflow-y-auto">
          {isFetching && <div className="px-3 py-2 text-navy-500 text-xs">Searching…</div>}
          {(seriesResults ?? []).map(series => (
            <button key={series.id} type="button" onMouseDown={() => pick(series.name)}
              className="w-full text-left px-3 py-2 hover:bg-navy-700 transition-colors">
              <div className="text-navy-100 text-sm">{series.name}</div>
              {series.authors && series.authors.length > 0 && (
                <div className="text-brand-400/70 text-xs">{series.authors.join(', ')}</div>
              )}
              {series.bookCount != null && series.bookCount > 0 && (
                <div className="text-navy-500 text-xs">{series.bookCount} book{series.bookCount !== 1 ? 's' : ''}</div>
              )}
            </button>
          ))}
          {!isFetching && q.trim() && !(seriesResults ?? []).some(s => s.name.toLowerCase() === q.trim().toLowerCase()) && (
            <button type="button" onMouseDown={() => pick(q.trim())}
              className="w-full text-left px-3 py-2 text-xs text-brand-400 hover:bg-navy-700 border-t border-navy-700 transition-colors">
              + Use &ldquo;{q.trim()}&rdquo; (new series)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
