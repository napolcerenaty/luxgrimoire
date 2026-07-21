'use client'

import { useEffect, useState } from 'react'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { INPUT_CLASS, LABEL_CLASS } from '@/lib/adminFormStyles'
import { formatVolumeNumbers, parseVolumeNumbers } from '@/lib/volumeNumbers'
import type { PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { Pagination } from '@/components/admin/Pagination'

interface ApiSeries {
  id: string
  slug: string
  name: string
  bookCount: number
  primaryBookCount: number
  authors: string[]
}

interface PrimaryBookForSwitch {
  bookId: string
  slug: string
  title: string
  currentVolumeNumbers: number[]
  targetVolumeNumbers: number[]
}

export default function AdminSeriesPage() {
  const queryClient = useQueryClient()
  const createModal = useModalState()
  const [editSeries, setEditSeries] = useState<ApiSeries | null>(null)
  const [deleteSeries, setDeleteSeries] = useState<ApiSeries | null>(null)
  const [switchSeries, setSwitchSeries] = useState<ApiSeries | null>(null)
  const [switchTarget, setSwitchTarget] = useState<{ slug: string; name: string } | null>(null)
  const [switchQuery, setSwitchQuery] = useState('')
  const [switchResult, setSwitchResult] = useState<number | null>(null)
  const [switchVolumeInputs, setSwitchVolumeInputs] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [editName, setEditName] = useState('')

  const { data: switchCandidates } = useQuery({
    queryKey: ['admin', 'series-search', switchQuery],
    queryFn: () => authFetch<PaginatedResponse<ApiSeries>>(`/book-series?search=${encodeURIComponent(switchQuery)}&pageSize=10`),
    enabled: switchQuery.length >= 1,
    select: (res) => res.data.filter((s) => s.slug !== switchSeries?.slug),
  })

  // Once a target is picked, list the books this switch would move so their new volume
  // numbers can be set right here — otherwise a book with no prior entry in the target
  // series ends up with none, needing a manual per-book fix afterward.
  const { data: primaryBooks } = useQuery({
    queryKey: ['admin', 'series-primary-books', switchSeries?.slug, switchTarget?.slug],
    queryFn: () => authFetch<PrimaryBookForSwitch[]>(
      `/book-series/${switchSeries!.slug}/primary-books?toSlug=${encodeURIComponent(switchTarget!.slug)}`
    ),
    enabled: switchSeries !== null && switchTarget !== null,
  })

  useEffect(() => {
    if (!primaryBooks) return
    setSwitchVolumeInputs(Object.fromEntries(primaryBooks.map((b) => [b.bookId, formatVolumeNumbers(b.targetVolumeNumbers)])))
  }, [primaryBooks])

  const switchMutation = useMutation({
    mutationFn: ({ fromSlug, toSeriesSlug, volumeNumbers }: { fromSlug: string; toSeriesSlug: string; volumeNumbers: Record<string, number[]> }) =>
      authFetch<{ switchedCount: number }>(`/book-series/${fromSlug}/switch-primary`, {
        method: 'POST', body: JSON.stringify({ toSeriesSlug, volumeNumbers }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'series'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'books'] })
      setSwitchResult(res.switchedCount)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const closeSwitchModal = () => {
    setSwitchSeries(null)
    setSwitchTarget(null)
    setSwitchVolumeInputs({})
    setSwitchQuery('')
    setSwitchResult(null)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'series', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' })
      if (search) params.set('search', search)
      return authFetch<PaginatedResponse<ApiSeries>>(`/book-series?${params}`)
    },
    placeholderData: keepPreviousData,
  })

  const series = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      authFetch('/book-series', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'series'] })
      createModal.close()
      setNewName('')
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const editMutation = useMutation({
    mutationFn: ({ slug, name }: { slug: string; name: string }) =>
      authFetch(`/book-series/${slug}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'series'] })
      setEditSeries(null)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/book-series/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'series'] })
      setDeleteSeries(null)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (row: ApiSeries) => (
        <a
          href={`/series/${row.slug}`}
          target="_blank"
          rel="noreferrer"
          className="text-amber-400 hover:text-amber-300 font-medium"
        >
          {row.name}
        </a>
      ),
    },
    {
      key: 'authors',
      label: 'Authors',
      render: (row: ApiSeries) =>
        row.authors.length > 0 ? (
          <span className="text-stone-400 text-xs">{row.authors.join(', ')}</span>
        ) : (
          <span className="text-stone-600 text-xs">—</span>
        ),
    },
    {
      key: 'bookCount',
      label: 'Books',
      render: (row: ApiSeries) => (
        <span className="text-stone-300">{row.bookCount}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row: ApiSeries) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditSeries(row); setEditName(row.name) }}
            className="bg-amber-400/10 text-amber-400 border border-amber-400/20 px-3 py-1 rounded text-xs font-medium hover:bg-amber-400/20 transition-colors"
          >
            Edit
          </button>
          {row.primaryBookCount > 0 && (
            <button
              onClick={() => setSwitchSeries(row)}
              className="bg-stone-700 text-stone-300 px-3 py-1 rounded text-xs font-medium hover:bg-stone-600 transition-colors"
              title="Switch this series's books to a different primary series"
            >
              Switch primary…
            </button>
          )}
          {row.bookCount === 0 ? (
            <button
              onClick={() => setDeleteSeries(row)}
              className="bg-red-900/50 text-red-300 px-3 py-1 rounded text-xs hover:bg-red-900 transition-colors"
            >
              Delete
            </button>
          ) : (
            <span
              title="Cannot delete — series has books"
              className="bg-stone-800 text-stone-600 px-3 py-1 rounded text-xs cursor-not-allowed"
            >
              Delete
            </span>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Book Series</h1>
        <button
          onClick={() => { createModal.open(); setNewName('') }}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Series
        </button>
      </div>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search series…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full max-w-sm bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-400 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <>
          <DataTable columns={columns} data={series} />
          <Pagination page={page} totalPages={data?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}

      {/* Create modal */}
      <FormModal open={createModal.isOpen} title="Add Series" onClose={() => createModal.close()}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMutation.mutate(newName.trim()) }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className={LABEL_CLASS}>Name *</label>
            <input
              required
              autoFocus
              className={INPUT_CLASS}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors"
          >
            {createMutation.isPending ? 'Saving…' : 'Create Series'}
          </button>
        </form>
      </FormModal>

      {/* Edit modal */}
      <FormModal open={editSeries !== null} title="Edit Series" onClose={() => setEditSeries(null)}>
        {editSeries && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (editName.trim()) editMutation.mutate({ slug: editSeries.slug, name: editName.trim() })
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className={LABEL_CLASS}>Name *</label>
              <input
                required
                autoFocus
                className={INPUT_CLASS}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={editMutation.isPending}
              className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors"
            >
              {editMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteSeries !== null}
        message={`Delete series "${deleteSeries?.name}"? This cannot be undone.`}
        onConfirm={() => deleteSeries && deleteMutation.mutate(deleteSeries.slug)}
        onCancel={() => setDeleteSeries(null)}
      />

      {/* Switch primary series modal */}
      <FormModal open={switchSeries !== null} title="Switch primary series" onClose={closeSwitchModal}>
        {switchSeries && (
          switchResult !== null ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-stone-300">
                Switched {switchResult} book{switchResult !== 1 ? 's' : ''} from{' '}
                <strong>{switchSeries.name}</strong> to <strong>{switchTarget?.name}</strong>.
                {' '}<span className="text-stone-500">"{switchSeries.name}" stays attached as a secondary series.</span>
              </p>
              <button
                onClick={closeSwitchModal}
                className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-stone-300">
                Every book whose primary series is currently <strong>{switchSeries.name}</strong> ({switchSeries.primaryBookCount} book{switchSeries.primaryBookCount !== 1 ? 's' : ''})
                will get the series below as its new primary. <strong>{switchSeries.name}</strong> stays attached to those books as a secondary series — nothing is removed.
              </p>
              <div>
                <label className={LABEL_CLASS}>New primary series *</label>
                {switchTarget ? (
                  <div className="flex items-center gap-2 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200">
                    <span className="flex-1">{switchTarget.name}</span>
                    <button type="button" onClick={() => setSwitchTarget(null)} className="text-stone-500 hover:text-red-400">×</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      autoFocus
                      className={INPUT_CLASS}
                      placeholder="Search series…"
                      value={switchQuery}
                      onChange={(e) => setSwitchQuery(e.target.value)}
                    />
                    {switchQuery.length >= 1 && (switchCandidates ?? []).length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-stone-800 border border-stone-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {(switchCandidates ?? []).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => { setSwitchTarget({ slug: s.slug, name: s.name }); setSwitchQuery('') }}
                            className="w-full text-left px-3 py-2 text-sm text-stone-200 hover:bg-stone-700 transition-colors"
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {switchTarget && (
                <div>
                  <label className={LABEL_CLASS}>
                    Volume numbers in <strong>{switchTarget.name}</strong>
                  </label>
                  <p className="text-xs text-stone-500 mb-2">
                    Set each book's number now instead of editing it afterward — e.g. "1" or "1-3, 5" for an omnibus. Leave blank for none.
                  </p>
                  {!primaryBooks ? (
                    <p className="text-xs text-stone-500">Loading books…</p>
                  ) : (
                    <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-1">
                      {primaryBooks.map((b) => (
                        <div key={b.bookId} className="flex flex-col gap-1 pb-3 border-b border-stone-800 last:border-0 last:pb-0">
                          <span className="text-sm text-stone-200 leading-snug">{b.title}</span>
                          <input
                            className={INPUT_CLASS}
                            placeholder="e.g. 1-3, 5"
                            value={switchVolumeInputs[b.bookId] ?? ''}
                            onChange={(e) => setSwitchVolumeInputs((prev) => ({ ...prev, [b.bookId]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => switchTarget && switchMutation.mutate({
                  fromSlug: switchSeries.slug,
                  toSeriesSlug: switchTarget.slug,
                  volumeNumbers: Object.fromEntries(
                    Object.entries(switchVolumeInputs).map(([bookId, input]) => [bookId, parseVolumeNumbers(input)]),
                  ),
                })}
                disabled={!switchTarget || switchMutation.isPending}
                className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors"
              >
                {switchMutation.isPending ? 'Switching…' : 'Switch primary series'}
              </button>
            </div>
          )
        )}
      </FormModal>
    </div>
  )
}
