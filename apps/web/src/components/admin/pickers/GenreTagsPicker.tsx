'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'

export function GenreTagsPicker({ genres, onChange, allowNew = true, staticOptions, endpoint = '/books/genres' }: { genres: string[]; onChange: (v: string[]) => void; allowNew?: boolean; staticOptions?: string[]; endpoint?: string }) {
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [openUpward, setOpenUpward] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { data: apiFetchedGenres } = useQuery({
    queryKey: ['genres-search', endpoint, dq],
    queryFn: () => authFetch<string[]>(`${endpoint}${dq ? `?search=${encodeURIComponent(dq)}` : ''}`),
    enabled: !staticOptions,
  })

  const suggestions = staticOptions ?? apiFetchedGenres

  const handleChange = (v: string) => {
    setQ(v); setOpen(true); setActiveIndex(-1)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDq(v), 300)
  }

  const add = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || genres.includes(trimmed)) return
    onChange([...genres, trimmed])
    setQ(''); setDq(''); setOpen(false); setActiveIndex(-1)
  }

  const filtered = (suggestions ?? []).filter(g =>
    !genres.includes(g) && (dq ? g.toLowerCase().includes(dq.toLowerCase()) : true)
  )

  // All dropdown items: filtered suggestions + optional "add new" entry
  const hasAddNew = allowNew && q.trim() && !filtered.includes(q.trim())
  const allItems: Array<{ type: 'suggestion' | 'add'; value: string }> = [
    ...filtered.map(g => ({ type: 'suggestion' as const, value: g })),
    ...(hasAddNew ? [{ type: 'add' as const, value: q.trim() }] : []),
  ]

  const checkOpenDirection = useCallback(() => {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    setOpenUpward(spaceBelow < 220)
  }, [])

  const handleFocus = () => {
    checkOpenDirection()
    setOpen(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || allItems.length === 0) {
      if (e.key === 'Enter') { e.preventDefault(); if (allowNew) add(q) }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < allItems.length) {
        add(allItems[activeIndex].value)
      } else if (allowNew) {
        add(q)
      }
    } else if (e.key === 'Escape') {
      setOpen(false); setActiveIndex(-1)
    }
  }

  const dropdownClasses = openUpward
    ? 'absolute z-50 bottom-full left-0 right-0 bg-stone-800 border border-stone-700 rounded-xl mb-1 shadow-2xl max-h-52 overflow-y-auto'
    : 'absolute z-50 top-full left-0 right-0 bg-stone-800 border border-stone-700 rounded-xl mt-1 shadow-2xl max-h-52 overflow-y-auto'

  return (
    <div>
      <div className="relative" ref={wrapperRef}>
        <input
          ref={inputRef}
          value={q}
          onChange={e => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={() => setTimeout(() => { setOpen(false); setActiveIndex(-1) }, 150)}
          onKeyDown={handleKeyDown}
          placeholder={allowNew ? 'Search or type genre + Enter…' : 'Search genre…'}
          className={INP}
        />
        {open && allItems.length > 0 && (
          <div className={dropdownClasses}>
            {filtered.map((g, idx) => (
              <button key={g} type="button" onMouseDown={() => add(g)}
                className={`w-full text-left px-3 py-2 text-sm text-stone-200 transition-colors ${activeIndex === idx ? 'bg-stone-700' : 'hover:bg-stone-700'}`}>
                {g}
              </button>
            ))}
            {hasAddNew && (
              <button type="button" onMouseDown={() => add(q.trim())}
                className={`w-full text-left px-3 py-2 text-xs text-amber-400 transition-colors border-t border-stone-700 ${activeIndex === filtered.length ? 'bg-stone-700' : 'hover:bg-stone-700'}`}>
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
