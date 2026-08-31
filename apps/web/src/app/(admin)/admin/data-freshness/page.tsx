'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'
import type { ApiCompanyDataCheck } from '@luxgrimoire/shared-types'
import { freshness, isNeverChecked } from './freshness'

const QUERY_KEY = ['admin', 'company-data-checks'] as const

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface UpdatePayload {
  slug: string
  touch?: boolean
  note?: string | null
}

function CheckRow({
  row,
  pending,
  onUpdate,
}: {
  row: ApiCompanyDataCheck
  pending: boolean
  onUpdate: (payload: UpdatePayload) => void
}) {
  const [note, setNote] = useState(row.note ?? '')
  const never = isNeverChecked(row.checkedAt)
  const { cls, warn } = freshness(row.checkedAt)

  const noteChanged = note.trim() !== (row.note ?? '').trim()
  const commitNote = () => {
    if (noteChanged) onUpdate({ slug: row.slug, note: note.trim() || null })
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-navy-800 bg-navy-900 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
      {/* Company + last-checked */}
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-navy-100">{row.name}</span>
          <span className="text-xs text-navy-600">{row.slug}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
            title={never ? 'Never checked' : formatDate(row.checkedAt)}
          >
            {warn && <AlertTriangle size={13} />}
            {never ? 'Never checked' : formatDate(row.checkedAt)}
          </span>
          {row.checkedByName && !never && (
            <span className="text-xs text-navy-500">by {row.checkedByName}</span>
          )}
        </div>
      </div>

      {/* Note + action */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <input
          type="text"
          value={note}
          disabled={pending}
          placeholder="Add a note…"
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitNote() }
          }}
          className="w-full rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-sm text-navy-100 placeholder-navy-600 focus:border-brand-400 focus:outline-none md:w-64"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => onUpdate({ slug: row.slug, touch: true })}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand-400 px-3 py-2 text-sm font-semibold text-navy-950 transition-colors hover:bg-brand-300 disabled:opacity-50"
        >
          <Check size={15} />
          Mark up to date
        </button>
      </div>
    </div>
  )
}

export default function AdminDataFreshnessPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [pendingSlug, setPendingSlug] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => authFetch<ApiCompanyDataCheck[]>('/admin/company-data-checks'),
  })

  const mutation = useMutation({
    mutationFn: ({ slug, ...body }: UpdatePayload) =>
      authFetch<ApiCompanyDataCheck>(`/admin/company-data-checks/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onMutate: ({ slug }) => setPendingSlug(slug),
    onSettled: () => {
      setPendingSlug(null)
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const rows = useMemo(() => {
    const list = data ?? []
    const q = search.trim().toLowerCase()
    return q ? list.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q)) : list
  }, [data, search])

  const staleCount = useMemo(
    () => (data ?? []).filter((r) => freshness(r.checkedAt).warn).length,
    [data],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-100">Data Freshness</h1>
          <p className="mt-1 text-sm text-navy-500">
            When each company&apos;s data was last checked for updates.
            {staleCount > 0 && (
              <span className="text-red-300"> · {staleCount} need attention</span>
            )}
          </p>
        </div>
        <input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-sm text-navy-100 placeholder-navy-500 focus:border-brand-400 focus:outline-none"
        />
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-navy-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-navy-500">
          {search ? `No companies match "${search}".` : 'No companies yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <CheckRow
              key={row.slug}
              row={row}
              pending={mutation.isPending && pendingSlug === row.slug}
              onUpdate={(payload) => mutation.mutate(payload)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
