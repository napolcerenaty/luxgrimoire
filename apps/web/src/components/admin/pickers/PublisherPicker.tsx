'use client'

import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'

export function PublisherPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState(value)
  const [dq, setDq] = useState('')
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: results, isFetching } = useQuery({
    queryKey: ['publishers-search', dq],
    queryFn: () => authFetch<string[]>(`/editions/publishers?search=${encodeURIComponent(dq)}`),
    enabled: dq.length >= 1,
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
      <input
        value={q}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (q.length >= 1) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="e.g. Fairyloot Exclusive"
        className={INP}
      />
      {open && q.length >= 1 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-stone-800 border border-stone-700 rounded-xl mt-1 shadow-2xl max-h-48 overflow-y-auto">
          {isFetching && <div className="px-3 py-2 text-stone-500 text-xs">Searching…</div>}
          {(results ?? []).map(name => (
            <button key={name} type="button" onMouseDown={() => pick(name)}
              className="w-full text-left px-3 py-2 hover:bg-stone-700 transition-colors text-stone-100 text-sm">
              {name}
            </button>
          ))}
          {!isFetching && q.trim() && !(results ?? []).includes(q.trim()) && (
            <button type="button" onMouseDown={() => pick(q.trim())}
              className="w-full text-left px-3 py-2 text-xs text-amber-400 hover:bg-stone-700 border-t border-stone-700 transition-colors">
              + Use &ldquo;{q.trim()}&rdquo; (new publisher)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
