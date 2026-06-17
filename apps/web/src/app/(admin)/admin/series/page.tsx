'use client'

import { useState } from 'react'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { INPUT_CLASS, LABEL_CLASS } from '@/lib/adminFormStyles'
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
  authors: string[]
}

export default function AdminSeriesPage() {
  const queryClient = useQueryClient()
  const createModal = useModalState()
  const [editSeries, setEditSeries] = useState<ApiSeries | null>(null)
  const [deleteSeries, setDeleteSeries] = useState<ApiSeries | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [editName, setEditName] = useState('')

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
    </div>
  )
}
