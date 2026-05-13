'use client'

import { use, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import Link from 'next/link'
import ImageUpload from '@/components/admin/ImageUpload'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiSubscriptionSeries } from '@luxgrimoire/shared-types'

const INPUT = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LABEL = 'block text-xs text-stone-400 mb-1'
const BTN_SM = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors'
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Types ────────────────────────────────────────────────────────────────────

type SubMonth = { id: string; year: number; month: number; theme: string | null; seriesId?: string | null }

interface SeriesFormData {
  name: string
  description: string
  coverImage: string
  startMonth: number
  startYear: number
  endMonth: number
  endYear: number
  skipMode: string
  canCancelDuring: boolean
  isActive: boolean
}

const EMPTY_FORM: SeriesFormData = {
  name: '',
  description: '',
  coverImage: '',
  startMonth: 1,
  startYear: new Date().getFullYear(),
  endMonth: 1,
  endYear: new Date().getFullYear(),
  skipMode: 'SERIES_AS_ONE',
  canCancelDuring: true,
  isActive: true,
}

function seriesToForm(s: ApiSubscriptionSeries): SeriesFormData {
  return {
    name: s.name,
    description: s.description ?? '',
    coverImage: s.coverImage ?? '',
    startMonth: s.startMonth,
    startYear: s.startYear,
    endMonth: s.endMonth,
    endYear: s.endYear,
    skipMode: s.skipMode,
    canCancelDuring: s.canCancelDuring,
    isActive: s.isActive,
  }
}

// ─── Series Form ──────────────────────────────────────────────────────────────

function SeriesForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
}: {
  initial: SeriesFormData
  onSubmit: (f: SeriesFormData) => void
  onCancel: () => void
  submitting: boolean
  submitLabel: string
}) {
  const [f, setF] = useState<SeriesFormData>(initial)
  const set = <K extends keyof SeriesFormData>(k: K, v: SeriesFormData[K]) => setF(p => ({ ...p, [k]: v }))

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(f) }} className="space-y-4">
      <div>
        <label className={LABEL}>Series Name *</label>
        <input className={INPUT} value={f.name} onChange={e => set('name', e.target.value)} required placeholder="e.g. The Mortal Editions Arc" />
      </div>
      <div>
        <label className={LABEL}>Description</label>
        <textarea className={INPUT + ' resize-none'} rows={2} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Optional…" />
      </div>
      <ImageUpload label="Cover Image" folder="luxgrimoire/series" value={f.coverImage} onChange={v => set('coverImage', v)} aspectRatio="16/9" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Start Month</label>
          <select className={INPUT} value={f.startMonth} onChange={e => set('startMonth', +e.target.value)}>
            {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>Start Year</label>
          <input className={INPUT} type="number" min={2000} max={2100} value={f.startYear} onChange={e => set('startYear', +e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>End Month</label>
          <select className={INPUT} value={f.endMonth} onChange={e => set('endMonth', +e.target.value)}>
            {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>End Year</label>
          <input className={INPUT} type="number" min={2000} max={2100} value={f.endYear} onChange={e => set('endYear', +e.target.value)} />
        </div>
      </div>
      <div>
        <label className={LABEL}>Skip Mode</label>
        <select className={INPUT} value={f.skipMode} onChange={e => set('skipMode', e.target.value)}>
          <option value="NO_SKIP">NO_SKIP — skipping not allowed for this series</option>
          <option value="INDIVIDUAL">INDIVIDUAL — each month skipped separately (1 skip each)</option>
          <option value="SERIES_AS_ONE">SERIES_AS_ONE — skip entire series at once = 1 skip</option>
          <option value="SERIES_AS_MANY">SERIES_AS_MANY — skip entire series at once = 1 skip per volume</option>
          <option value="SERIES_ONLY">SERIES_ONLY — (legacy, same as SERIES_AS_ONE)</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
        <input type="checkbox" checked={f.canCancelDuring} onChange={e => set('canCancelDuring', e.target.checked)} className="accent-amber-400" />
        Allow subscription cancellation during this series
      </label>
      <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
        <input type="checkbox" checked={f.isActive} onChange={e => set('isActive', e.target.checked)} className="accent-amber-400" />
        Active (visible on public pages)
      </label>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={submitting}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-sm">
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg bg-stone-700 text-stone-300 hover:bg-stone-600 text-sm">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Month Assignment Panel ───────────────────────────────────────────────────

function AssignMonthsPanel({
  series,
  allMonths,
  subscriptionSlug,
  onDone,
}: {
  series: ApiSubscriptionSeries
  allMonths: SubMonth[]
  subscriptionSlug: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const assignedIds = new Set((series.months ?? []).map(m => m.id))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const qKey = ['admin', 'subscription-series', subscriptionSlug]

  const assignMutation = useMutation({
    mutationFn: (ids: string[]) =>
      authFetch(`/subscription-series/${series.slug}/months`, {
        method: 'POST',
        body: JSON.stringify({ monthIds: ids }),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qKey }); setSelected(new Set()); onDone() },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const removeMutation = useMutation({
    mutationFn: (ids: string[]) =>
      authFetch(`/subscription-series/${series.slug}/months`, {
        method: 'DELETE',
        body: JSON.stringify({ monthIds: ids }),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qKey }); setSelected(new Set()); onDone() },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-400">Check months to assign. Uncheck assigned months and use Remove to detach them.</p>
      <div className="max-h-60 overflow-y-auto space-y-1 bg-stone-900 rounded-xl p-2">
        {allMonths.length === 0 && <p className="text-stone-500 text-xs px-2">No months found for this subscription.</p>}
        {allMonths.map(m => {
          const isAssigned = assignedIds.has(m.id)
          return (
            <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-stone-800 cursor-pointer">
              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="accent-amber-400" />
              <span className={`text-xs ${isAssigned ? 'text-amber-400 font-medium' : 'text-stone-300'}`}>
                {MONTH_NAMES[m.month - 1]} {m.year}
                {m.theme && <span className="text-stone-500 ml-1">— {m.theme}</span>}
                {isAssigned && <span className="ml-1 text-xs text-amber-500/70">(assigned)</span>}
              </span>
            </label>
          )
        })}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => assignMutation.mutate([...selected])}
          disabled={selected.size === 0 || assignMutation.isPending}
          className={`${BTN_SM} bg-amber-400 text-stone-950 disabled:opacity-50`}
        >
          {assignMutation.isPending ? '…' : `Assign (${selected.size})`}
        </button>
        <button
          onClick={() => removeMutation.mutate([...selected])}
          disabled={selected.size === 0 || removeMutation.isPending}
          className={`${BTN_SM} bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50`}
        >
          {removeMutation.isPending ? '…' : `Remove (${selected.size})`}
        </button>
      </div>
    </div>
  )
}

// ─── Series Card ──────────────────────────────────────────────────────────────

function SeriesCard({
  series,
  subscriptionSlug,
  allMonths,
}: {
  series: ApiSubscriptionSeries
  subscriptionSlug: string
  allMonths: SubMonth[]
}) {
  const queryClient = useQueryClient()
  const qKey = ['admin', 'subscription-series', subscriptionSlug]
  const [editing, setEditing] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const coverUrl = cloudinaryUrl(series.coverImage, 'w_160,h_90,c_fill,q_auto,f_auto')

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<SeriesFormData>) =>
      authFetch(`/subscription-series/${series.slug}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qKey }); setEditing(false) },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: () => authFetch(`/subscription-series/${series.slug}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const dateRange = `${MONTH_NAMES[series.startMonth - 1]} ${series.startYear} – ${MONTH_NAMES[series.endMonth - 1]} ${series.endYear}`

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-4 p-4">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-20 h-12 object-cover rounded-lg shrink-0" />
        ) : (
          <div className="w-20 h-12 bg-stone-800 rounded-lg shrink-0 flex items-center justify-center text-stone-600 text-xs">No img</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-stone-100 font-semibold">{series.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              series.skipMode === 'NO_SKIP' ? 'bg-red-500/20 text-red-400' :
              series.skipMode === 'SERIES_AS_ONE' || series.skipMode === 'SERIES_ONLY' ? 'bg-purple-500/20 text-purple-300' :
              series.skipMode === 'SERIES_AS_MANY' ? 'bg-blue-500/20 text-blue-300' :
              'bg-stone-700 text-stone-400'
            }`}>
              {series.skipMode}
            </span>
            {!series.isActive && <span className="text-xs text-stone-600">Inactive</span>}
            {!series.canCancelDuring && <span className="text-xs text-amber-600/70">No cancel during</span>}
          </div>
          <p className="text-stone-400 text-xs mt-0.5">{dateRange} · {series._count?.months ?? series.months?.length ?? 0} months assigned</p>
          {series.description && <p className="text-stone-500 text-xs mt-0.5 line-clamp-1">{series.description}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => { setEditing(!editing); setAssignOpen(false) }}
            className={`${BTN_SM} ${editing ? 'bg-stone-600 text-stone-200' : 'bg-stone-700 text-stone-300 hover:bg-stone-600'}`}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={() => { setAssignOpen(!assignOpen); setEditing(false) }}
            className={`${BTN_SM} ${assignOpen ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-stone-700 text-stone-300 hover:bg-stone-600'}`}>
            Months {assignOpen ? '▲' : '▼'}
          </button>
          <button
            onClick={() => { if (confirm(`Delete series "${series.name}"? Months will be detached but not deleted.`)) deleteMutation.mutate() }}
            disabled={deleteMutation.isPending}
            className={`${BTN_SM} bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50`}
          >{deleteMutation.isPending ? '…' : 'Delete'}</button>
        </div>
      </div>

      {/* Assigned months chips */}
      {!assignOpen && (series.months ?? []).length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {(series.months ?? []).map(m => (
            <span key={m.id} className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">
              {MONTH_NAMES[m.month - 1]} {m.year}
            </span>
          ))}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="border-t border-stone-800 p-4 bg-stone-800/30">
          <SeriesForm
            initial={seriesToForm(series)}
            onSubmit={f => updateMutation.mutate(f)}
            onCancel={() => setEditing(false)}
            submitting={updateMutation.isPending}
            submitLabel="Save Changes"
          />
        </div>
      )}

      {/* Assign months */}
      {assignOpen && (
        <div className="border-t border-stone-800 p-4 bg-stone-800/20">
          <AssignMonthsPanel
            series={series}
            allMonths={allMonths}
            subscriptionSlug={subscriptionSlug}
            onDone={() => setAssignOpen(false)}
          />
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSubscriptionSeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const queryClient = useQueryClient()
  const qKey = ['admin', 'subscription-series', slug]
  const [creating, setCreating] = useState(false)

  const { data: subData } = useQuery({
    queryKey: ['admin', 'subscriptions', slug, 'for-edit'],
    queryFn: () => authFetch<{ id: string; name: string; companyId: string }>(`/subscriptions/${slug}/for-edit`),
  })

  const { data: seriesData, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => authFetch<ApiSubscriptionSeries[]>(`/subscription-series?subscriptionSlug=${slug}`),
  })
  const seriesList: ApiSubscriptionSeries[] = seriesData ?? []

  const { data: monthsData } = useQuery({
    queryKey: ['admin', 'subscriptions', slug, 'months'],
    queryFn: () => authFetch<{ data: SubMonth[]; total: number }>(`/subscriptions/${slug}/months?all=true&pageSize=9999`),
    select: (d) => d.data ?? [],
  })
  const allMonths: SubMonth[] = monthsData ?? []

  const createMutation = useMutation({
    mutationFn: (payload: SeriesFormData & { subscriptionId: string }) =>
      authFetch('/subscription-series', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qKey }); setCreating(false) },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-stone-500 mb-4">
        <Link href="/admin/subscriptions" className="hover:text-stone-300">Subscriptions</Link>
        <span>/</span>
        <Link href={`/admin/subscriptions/${slug}/months`} className="hover:text-stone-300">{subData?.name ?? slug}</Link>
        <span>/</span>
        <span className="text-stone-300">Series</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Subscription Series</h1>
          <p className="text-stone-400 text-sm mt-0.5">Group months into named series with custom skip behaviour</p>
        </div>
        <button
          onClick={() => setCreating(!creating)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors text-sm"
        >
          {creating ? '✕ Cancel' : '+ New Series'}
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 mb-6">
          <h2 className="text-stone-100 font-semibold mb-4">Create Series</h2>
          <SeriesForm
            initial={EMPTY_FORM}
            onSubmit={f => createMutation.mutate({ ...f, subscriptionId: subData?.id ?? '' })}
            onCancel={() => setCreating(false)}
            submitting={createMutation.isPending}
            submitLabel="Create Series"
          />
        </div>
      )}

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : seriesList.length === 0 ? (
        <div className="text-stone-500 py-8 text-center">No series defined yet. Create one to group subscription months.</div>
      ) : (
        <div className="space-y-4">
          {seriesList.map(s => (
            <SeriesCard key={s.id} series={s} subscriptionSlug={slug} allMonths={allMonths} />
          ))}
        </div>
      )}
    </div>
  )
}
