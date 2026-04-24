'use client'

import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'

export function GenreTagsPicker({ genres, onChange }: { genres: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: suggestions } = useQuery({
    queryKey: ['genres-search', dq],
    queryFn: () => authFetch<string[]>(`/books/genres${dq ? `?search=${encodeURIComponent(dq)}` : ''}`),
    enabled: true,
  })

  const handleChange = (v: string) => {
    setQ(v); setOpen(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDq(v), 300)
  }

  const add = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || genres.includes(trimmed)) return
    onChange([...genres, trimmed])
    setQ(''); setDq(''); setOpen(false)
  }

  const filtered = (suggestions ?? []).filter(g =>
    !genres.includes(g) && (dq ? g.toLowerCase().includes(dq.toLowerCase()) : true)
  )

  return (
    <div>
      <div className="relative">
        <input value={q} onChange={e => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(q) } }}
          placeholder="Search or type genre + Enter…" className={INP} />
        {open && (filtered.length > 0 || q.trim()) && (
          <div className="absolute z-20 top-full left-0 right-0 bg-stone-800 border border-stone-700 rounded-xl mt-1 shadow-2xl max-h-48 overflow-y-auto">
            {filtered.map(g => (
              <button key={g} type="button" onMouseDown={() => add(g)}
                className="w-full text-left px-3 py-2 text-sm text-stone-200 hover:bg-stone-700 transition-colors">
                {g}
              </button>
            ))}
            {q.trim() && !filtered.includes(q.trim()) && (
              <button type="button" onMouseDown={() => add(q.trim())}
                className="w-full text-left px-3 py-2 text-xs text-amber-400 hover:bg-stone-700 border-t border-stone-700 transition-colors">
                + Add &ldquo;{q.trim()}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>
      {genres.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {genres.map((g, i) => (
            <span key={i} className="flex items-center gap-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs px-2.5 py-1 rounded-full">
              {g}
              <button onClick={() => onChange(genres.filter((_, j) => j !== i))}
                className="text-amber-500/60 hover:text-red-400 ml-0.5">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
