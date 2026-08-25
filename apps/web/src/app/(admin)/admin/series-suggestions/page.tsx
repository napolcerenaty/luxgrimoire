'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookPlus, Trash2, RefreshCw, ExternalLink, Sparkles, SlidersHorizontal, X } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'
import { Pagination } from '@/components/admin/Pagination'
import FormModal from '@/components/admin/FormModal'
import CreateBookEditionForm from '@/components/admin/CreateBookEditionForm'

interface ExcludedKeyword {
  id: string
  keyword: string
}

/** Admin-managed list of words (e.g. "boxed set", "trilogy") that mark a suggestion as a
 * bundle/omnibus repackaging rather than a real new volume — see isBundleListing in
 * series-discovery.service.ts. Collapsed by default since it's config, not the primary content. */
function ExcludedKeywordsPanel() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [newKeyword, setNewKeyword] = useState('')

  const { data: keywords } = useQuery({
    queryKey: ['admin', 'series-discovery-excluded-keywords'],
    queryFn: () => authFetch<ExcludedKeyword[]>('/admin/series-discovery/excluded-keywords'),
    enabled: open,
  })

  const add = useMutation({
    mutationFn: (keyword: string) =>
      authFetch('/admin/series-discovery/excluded-keywords', { method: 'POST', body: JSON.stringify({ keyword }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'series-discovery-excluded-keywords'] }); setNewKeyword('') },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const remove = useMutation({
    mutationFn: (id: string) => authFetch(`/admin/series-discovery/excluded-keywords/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'series-discovery-excluded-keywords'] }),
  })

  return (
    <div className="bg-navy-900 border border-navy-800 rounded-xl">
      <button
        onClick={() => setOpen(o => !o)}
        title="Titles containing one of these words (e.g. '{Series Name} Trilogy') are treated as a repackaging of books you already have, not a new volume, and never turn into a suggestion"
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-navy-300 hover:text-navy-100 transition-colors"
      >
        <SlidersHorizontal size={14} />
        Excluded bundle/omnibus keywords
        <span className="text-navy-600 font-normal">{open ? '(hide)' : '(show)'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(keywords ?? []).map(k => (
              <span key={k.id} className="flex items-center gap-1 bg-navy-800 border border-navy-700 text-navy-300 text-xs pl-2 pr-1 py-0.5 rounded-full">
                {k.keyword}
                <button onClick={() => remove.mutate(k.id)} title={`Remove "${k.keyword}"`} className="text-navy-500 hover:text-rose-400 p-0.5">
                  <X size={11} />
                </button>
              </span>
            ))}
            {keywords?.length === 0 && <span className="text-xs text-navy-600 italic">No keywords — bundle filtering is off.</span>}
          </div>
          <form
            onSubmit={e => { e.preventDefault(); if (newKeyword.trim()) add.mutate(newKeyword.trim()) }}
            className="flex gap-2"
          >
            <input
              value={newKeyword}
              onChange={e => setNewKeyword(e.target.value)}
              placeholder="e.g. anthology"
              className="flex-1 max-w-xs bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-navy-100 placeholder-navy-600 focus:outline-none focus:border-brand-400"
            />
            <button
              type="submit"
              disabled={!newKeyword.trim() || add.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-navy-700 text-navy-200 hover:bg-navy-600 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

const STATUS_OPTIONS = ['pending', 'approved', 'dismissed']
const STATUS_STYLES: Record<string, string> = {
  pending: 'text-brand-400 bg-brand-500/10 border-brand-500/30',
  approved: 'text-green-400 bg-green-500/10 border-green-500/30',
  dismissed: 'text-navy-500 bg-navy-700/30 border-navy-600/30',
}
const SOURCE_LABELS: Record<string, string> = {
  google_books: 'Google Books',
  open_library: 'Open Library',
  wikidata: 'Wikidata',
}

interface SeriesVolumeSuggestion {
  id: string
  title: string
  authorNames: string[]
  volumeNumber: number | null
  genres: string[]
  source: string
  sourceUrl: string | null
  description: string | null
  publishedDate: string | null
  status: string
  adminNote: string | null
  createdAt: string
  series: { id: string; slug: string; name: string }
}

export default function AdminSeriesSuggestionsPage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('pending')
  const [page, setPage] = useState(1)
  const [createFrom, setCreateFrom] = useState<SeriesVolumeSuggestion | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'series-volume-suggestions', page, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '30' })
      if (statusFilter) params.set('status', statusFilter)
      return authFetch<{ items: SeriesVolumeSuggestion[]; total: number; page: number; pageSize: number }>(
        `/admin/series-volume-suggestions?${params}`
      )
    },
  })

  const runNow = useMutation({
    mutationFn: () => authFetch<{ seriesChecked: number; suggestionsCreated: number; googleBooksRateLimited: boolean }>('/admin/series-discovery/run', { method: 'POST' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'series-volume-suggestions'] })
      const warning = res.googleBooksRateLimited
        ? '\n\n⚠️ Google Books rate-limited (429) partway through this run — it was skipped for the rest of it. Set GOOGLE_BOOKS_API_KEY (free, no billing) to raise the unauthenticated quota.'
        : ''
      alert(`Checked ${res.seriesChecked} series, found ${res.suggestionsCreated} new suggestion(s).${warning}`)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      authFetch(`/admin/series-volume-suggestions/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'series-volume-suggestions'] }),
  })

  const del = useMutation({
    mutationFn: (id: string) => authFetch(`/admin/series-volume-suggestions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'series-volume-suggestions'] }),
  })

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles size={22} className="text-brand-400" />
          <div>
            <h1 className="font-serif text-2xl font-bold text-navy-100">Series Volume Suggestions</h1>
            <p className="text-sm text-navy-500">{data?.total ?? 0} total — auto-detected from Google Books, Open Library, Wikidata</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending}
            title="Manually check every non-completed series against Google Books, Open Library, and Wikidata right now, instead of waiting for the daily batch"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-400 text-navy-950 hover:bg-brand-300 disabled:opacity-50 transition-colors"
          >
            {runNow.isPending ? 'Checking…' : 'Check now'}
          </button>
          <button onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'series-volume-suggestions'] } )}
            title="Reload this list"
            className="p-2 rounded-lg text-navy-400 hover:text-brand-400 hover:bg-navy-800 transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <ExcludedKeywordsPanel />

      <div className="flex gap-2 flex-wrap">
        {['', ...STATUS_OPTIONS].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s ? 'bg-brand-500/10 text-brand-400 border-brand-500/30' : 'text-navy-400 border-navy-700 hover:border-navy-500'
            }`}>
            {s === '' ? 'All' : s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-navy-500">Loading…</div>
      ) : data?.items.length === 0 ? (
        <div className="text-center py-20 text-navy-500">No suggestions found.</div>
      ) : (
        <div className="space-y-3">
          {data?.items.map(s => (
            <div key={s.id} className="bg-navy-900 border border-navy-800 rounded-2xl p-4 hover:border-navy-700 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[s.status] ?? STATUS_STYLES.pending}`}>
                      {s.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-navy-500 bg-navy-800 border border-navy-700 rounded-full px-2 py-0.5">
                      {SOURCE_LABELS[s.source] ?? s.source}
                    </span>
                    <a href={`/admin/series`} className="text-xs text-navy-500 hover:text-brand-400">
                      {s.series.name}
                    </a>
                    <span className="text-xs text-navy-600">{new Date(s.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm font-medium text-navy-100">
                    {s.title}{s.volumeNumber != null ? ` — #${s.volumeNumber}` : ''}
                  </p>
                  {s.authorNames.length > 0 && (
                    <p className="text-xs text-navy-400 mt-1">{s.authorNames.join(', ')}</p>
                  )}
                  {s.description && (
                    <p className="text-sm text-navy-400 mt-2 line-clamp-3">{s.description}</p>
                  )}
                  {s.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.genres.map(g => (
                        <span key={g} className="bg-brand-500/15 text-brand-300 border border-brand-500/30 text-xs px-2 py-0.5 rounded-full">{g}</span>
                      ))}
                    </div>
                  )}
                  {s.sourceUrl && (
                    <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1.5 font-medium mt-2">
                      <ExternalLink size={12} className="shrink-0" /> View source
                    </a>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0 items-end">
                  {s.status === 'pending' && (
                    <button
                      onClick={() => setCreateFrom(s)}
                      title="Open the book creation form, pre-filled with this suggestion's title/author/series/genres — nothing is created until you submit that form"
                      className="flex items-center gap-1 bg-brand-400/10 text-brand-400 border border-brand-400/20 px-3 py-1 rounded text-xs font-medium hover:bg-brand-400/20 transition-colors"
                    >
                      <BookPlus size={13} /> Create book
                    </button>
                  )}
                  {s.status === 'pending' && (
                    <button
                      onClick={() => updateStatus.mutate({ id: s.id, status: 'dismissed' })}
                      title="Not a real/wanted volume — hides it from the pending list. It won't be suggested again on future checks."
                      className="bg-navy-800 text-navy-400 px-3 py-1 rounded text-xs hover:bg-navy-700 transition-colors"
                    >
                      Dismiss
                    </button>
                  )}
                  <button onClick={() => { if (confirm('Delete this suggestion?')) del.mutate(s.id) }}
                    title="Permanently remove this row — unlike Dismiss, a future check could suggest it again if it's still not in your catalogue"
                    className="p-1.5 rounded-lg text-navy-600 hover:text-rose-400 hover:bg-rose-950/30 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <FormModal open={createFrom !== null} title="Create Book from Suggestion" onClose={() => setCreateFrom(null)}>
        {createFrom && (
          <CreateBookEditionForm
            bookOnly
            initialGoodreadsResult={{
              title: createFrom.title,
              description: createFrom.description ?? undefined,
              authors: createFrom.authorNames.map(name => ({ name })),
              seriesName: createFrom.series.name,
              volumeNumber: createFrom.volumeNumber ?? undefined,
              genres: createFrom.genres,
            }}
            onSuccess={() => {
              updateStatus.mutate({ id: createFrom.id, status: 'approved' })
              setCreateFrom(null)
            }}
            onCancel={() => setCreateFrom(null)}
          />
        )}
      </FormModal>
    </div>
  )
}
