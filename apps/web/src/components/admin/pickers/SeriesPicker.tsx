'use client'

import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'

export function SeriesPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState(value)
  const [dq, setDq] = useState('')
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: seriesResults, isFetching } = useQuery({
    queryKey: ['series-search', dq],
    queryFn: () => authFetch<string[]>(`/books/series?search=${encodeURIComponent(dq)}`),
    enabled: dq.length >= 1,
  })

  const { data: booksInSeries } = useQuery({
    queryKey: ['series-books', dq],
    queryFn: () => authFetch<{ data: { seriesName: string; authors: { author: { name: string } }[] }[] }>(
      `/books?seriesName=${encodeURIComponent(dq)}&pageSize=5`
    ),
    enabled: dq.length >= 2,
  })

  const handleChange = (v: string) => {
    setQ(v); onChange(v); setOpen(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDq(v), 300)
  }

  const pick = (name: string) => {
    setQ(name); onChange(name); setOpen(false); setDq('')
  }

  const authorsForSeries = (name: string) => {
    if (!booksInSeries?.data) return ''
    const book = booksInSeries.data.find(b => b.seriesName === name)
    return book?.authors?.map(a => a.author.name).join(', ') ?? ''
  }

  return (
    <div className="relative">
      <input value={q} onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (q.length >= 1) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Series name…" className={INP} />
      {open && q.length >= 1 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-stone-800 border border-stone-700 rounded-xl mt-1 shadow-2xl max-h-48 overflow-y-auto">
          {isFetching && <div className="px-3 py-2 text-stone-500 text-xs">Searching…</div>}
          {(seriesResults ?? []).map(name => (
            <button key={name} type="button" onMouseDown={() => pick(name)}
              className="w-full text-left px-3 py-2 hover:bg-stone-700 transition-colors">
              <div className="text-stone-100 text-sm">{name}</div>
              {authorsForSeries(name) && (
                <div className="text-stone-500 text-xs">{authorsForSeries(name)}</div>
              )}
            </button>
          ))}
          {!isFetching && q.trim() && !(seriesResults ?? []).includes(q.trim()) && (
            <button type="button" onMouseDown={() => pick(q.trim())}
              className="w-full text-left px-3 py-2 text-xs text-amber-400 hover:bg-stone-700 border-t border-stone-700 transition-colors">
              + Use &ldquo;{q.trim()}&rdquo; (new series)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
