'use client'

import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'

const INP = 'w-full bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 focus:outline-none focus:border-brand-400 text-sm'

export type PersonEntry = { id?: string; name: string; slug?: string }

export function PersonPicker({ endpoint, placeholder, onAdd, initialQuery }: {
  endpoint: 'authors' | 'artists'
  placeholder: string
  onAdd: (entry: PersonEntry) => void
  initialQuery?: string
}) {
  const [q, setQ] = useState(initialQuery ?? '')
  const [dq, setDq] = useState(initialQuery ?? '')
  const [creating, setCreating] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isFetching } = useQuery({
    queryKey: [endpoint + '-search', dq],
    queryFn: () => authFetch<{ data: { id: string; name: string; slug: string }[] }>(
      `/${endpoint}?search=${encodeURIComponent(dq)}&pageSize=8`
    ),
    enabled: dq.length >= 2,
  })
  const results = data?.data ?? []
  const exactMatch = results.some(r => r.name.toLowerCase() === q.trim().toLowerCase())

  const handleQ = (v: string) => {
    setQ(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDq(v), 300)
  }

  const pick = (item: { id: string; name: string; slug: string }) => {
    onAdd({ id: item.id, name: item.name, slug: item.slug })
    setQ(''); setDq('')
  }

  const createNew = async () => {
    const trimmed = q.trim()
    if (!trimmed || creating) return
    setCreating(true)
    try {
      const created = await authFetch<{ id: string; name: string; slug: string }>(
        `/${endpoint}`, { method: 'POST', body: JSON.stringify({ name: trimmed }) }
      )
      onAdd({ id: created.id, name: created.name, slug: created.slug })
      setQ(''); setDq('')
    } catch (e: unknown) {
      alert(`Failed to create: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="relative">
      <input value={q} onChange={e => handleQ(e.target.value)}
        placeholder={placeholder} className={INP} />
      {q.length >= 2 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-navy-800 border border-navy-700 rounded-xl mt-1 shadow-2xl max-h-48 overflow-y-auto">
          {isFetching && <div className="px-3 py-2 text-navy-500 text-xs">Searching…</div>}
          {results.map(r => (
            <button key={r.id} type="button" onClick={() => pick(r)}
              className="w-full text-left px-3 py-2 text-sm text-navy-200 hover:bg-navy-700 transition-colors">
              {r.name}
            </button>
          ))}
          {!exactMatch && (
            <button type="button" onClick={createNew} disabled={creating}
              className="w-full text-left px-3 py-2 text-xs text-brand-400 hover:bg-navy-700 border-t border-navy-700 transition-colors disabled:opacity-50">
              {creating ? 'Creating…' : `+ Create "${q}"`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
