'use client'

import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'

const INP = 'w-full bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 focus:outline-none focus:border-brand-400 text-sm'

/** Mirrors PublisherPicker's search-or-create combobox, but scoped to one company's own
 *  variant names (e.g. "White Edition") — reusing a name only makes sense within the same
 *  company's line, and matters for series-continuation notifications, which only fire when a
 *  new volume's variant matches the exact variant the user already owns from that company. */
export function VariantLabelPicker({ value, onChange, companyId }: { value: string; onChange: (v: string) => void; companyId: string }) {
  const [q, setQ] = useState(value)
  const [dq, setDq] = useState('')
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: results, isFetching } = useQuery({
    queryKey: ['variant-labels-search', companyId, dq],
    queryFn: () => authFetch<string[]>(`/editions/variant-labels?companyId=${companyId}&search=${encodeURIComponent(dq)}`),
    enabled: !!companyId && dq.length >= 1,
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
        disabled={!companyId}
        placeholder={companyId ? 'e.g. White Edition, Numbered — leave blank if this isn\'t a variant' : 'Select a company first'}
        className={`${INP} disabled:opacity-50 disabled:cursor-not-allowed`}
      />
      {open && companyId && q.length >= 1 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-navy-800 border border-navy-700 rounded-xl mt-1 shadow-2xl max-h-48 overflow-y-auto">
          {isFetching && <div className="px-3 py-2 text-navy-500 text-xs">Searching…</div>}
          {(results ?? []).map(name => (
            <button key={name} type="button" onMouseDown={() => pick(name)}
              className="w-full text-left px-3 py-2 hover:bg-navy-700 transition-colors text-navy-100 text-sm">
              {name}
            </button>
          ))}
          {!isFetching && q.trim() && !(results ?? []).includes(q.trim()) && (
            <button type="button" onMouseDown={() => pick(q.trim())}
              className="w-full text-left px-3 py-2 text-xs text-brand-400 hover:bg-navy-700 border-t border-navy-700 transition-colors">
              + Use &ldquo;{q.trim()}&rdquo; (new variant)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
