'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import type { ApiBookEdition, ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import CreateBookEditionForm from '@/components/admin/CreateBookEditionForm'
import EditBookEditionForm from '@/components/admin/EditBookEditionForm'


const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''
function cloudThumb(id: string | null | undefined) {
  if (!id) return null
  if (id.startsWith('http')) return id
  return `https://res.cloudinary.com/${CLOUD}/image/upload/w_64,h_80,c_fill,q_auto,f_auto/${id}`
}

interface BookSearchResult {
  id: string
  title: string
  coverImage?: string | null
  authors?: Array<{ author: { name: string } }>
}

function AddEditionFlow({ defaultCompanyId, onSuccess, onCancel }: {
  defaultCompanyId?: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const [selectedBook, setSelectedBook] = useState<BookSearchResult | null>(null)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: bookResults, isFetching: searching } = useQuery({
    queryKey: ['book-search', debounced],
    queryFn: () => authFetch<{ data: BookSearchResult[] }>(`/books?search=${encodeURIComponent(debounced)}&pageSize=10`),
    enabled: debounced.length >= 2,
  })

  const handleSearchChange = (val: string) => {
    setSearch(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(val), 350)
  }

  if (selectedBook) {
    return (
      <CreateBookEditionForm
        existingBookId={selectedBook.id}
        defaultCompanyId={defaultCompanyId}
        onSuccess={onSuccess}
        onCancel={() => setSelectedBook(null)}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={LABEL_CLASS}>Search book</label>
        <input
          autoFocus
          className={INPUT_CLASS}
          placeholder="Start typing title…"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
        />
      </div>
      {searching && <div className="text-stone-500 text-sm">Searching…</div>}
      {debounced.length >= 2 && !searching && bookResults && (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {bookResults.data.length === 0
            ? <div className="text-stone-500 text-sm px-2">No books found</div>
            : bookResults.data.map(book => (
              <button key={book.id} type="button" onClick={() => setSelectedBook(book)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 transition-colors"
              >
                {cloudThumb(book.coverImage)
                  ? <img src={cloudThumb(book.coverImage)!} alt="" className="w-8 h-10 object-cover rounded shrink-0" />
                  : <div className="w-8 h-10 bg-stone-700 rounded shrink-0" />
                }
                <div>
                  <div className="text-stone-100 text-sm font-medium">{book.title}</div>
                  {book.authors && book.authors.length > 0 && (
                    <div className="text-stone-500 text-xs">{book.authors.map(a => a.author.name).join(', ')}</div>
                  )}
                </div>
              </button>
            ))
          }
        </div>
      )}
      <button type="button" onClick={onCancel}
        className="text-stone-500 hover:text-stone-300 text-sm transition-colors">
        Cancel
      </button>
    </div>
  )
}

export default function AdminEditionsPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isManager = user?.role === 'COMPANY_MANAGER'
  const managedCompanyId = (user as (typeof user & { managedCompanyId?: string }) | null)?.managedCompanyId ?? ''

  const [createOpen, setCreateOpen] = useState(false)
  const [editEdition, setEditEdition] = useState<ApiBookEdition | null>(null)
  const [deleteEdition, setDeleteEdition] = useState<ApiBookEdition | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [unverifiedOnly, setUnverifiedOnly] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [companyFilter, unverifiedOnly])

  const buildParams = () => {
    const p = new URLSearchParams({ page: String(page), pageSize: '20' })
    if (debouncedSearch) p.set('search', debouncedSearch)
    if (unverifiedOnly) p.set('needsVerification', 'true')
    if (isManager && managedCompanyId) {
      p.set('companyId', managedCompanyId)
    } else if (companyFilter) {
      p.set('companyId', companyFilter)
    }
    return p.toString()
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'editions', page, debouncedSearch, companyFilter, managedCompanyId, unverifiedOnly],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiBookEdition>>(
        `/editions?${buildParams()}`,
      ),
    placeholderData: keepPreviousData,
  })

  const editions = data?.data ?? []

  // Companies for filter dropdown (admins/moderators only)
  const { data: companiesData } = useQuery({
    queryKey: ['admin', 'companies-list'],
    queryFn: () => authFetch<PaginatedResponse<ApiBookBoxCompany> | ApiBookBoxCompany[]>('/companies?pageSize=100'),
    enabled: !isManager,
  })
  const companies = companiesData
    ? Array.isArray(companiesData) ? companiesData : companiesData.data
    : []

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/editions/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'editions'] })
      setDeleteEdition(null)
      setDeleteError(null)
    },
    onError: (err: Error) => {
      setDeleteError(err.message ?? 'Cannot delete this edition')
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/editions/${slug}/verify`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'editions'] }),
  })

  const canVerify = user?.role === 'ADMIN' || user?.role === 'MODERATOR'

  const columns = [
    {
      key: 'book',
      label: 'Book',
      render: (row: ApiBookEdition) => (
        <div>
          {row.book?.slug
            ? <a href={`/books/${row.book.slug}`} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 font-medium">{row.book.title}</a>
            : <div className="text-stone-100 font-medium">{row.book?.title ?? '—'}</div>
          }
          {row.book?.seriesName && (
            <div className="text-stone-500 text-xs">
              {row.book.seriesName}{row.book.volumeNumber != null ? ` #${row.book.volumeNumber}` : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'authors',
      label: 'Author(s)',
      render: (row: ApiBookEdition) => {
        const authors = row.book?.authors
        if (!authors?.length) return <span className="text-stone-500">—</span>
        return <span className="text-stone-300 text-sm">{authors.map((a) => a.name).join(', ')}</span>
      },
    },
    {
      key: 'publisher',
      label: 'Publisher / Edition',
      render: (row: ApiBookEdition) => (
        <div>
          <a href={`/editions/${row.slug}`} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 text-sm font-medium">{row.publisher ?? row.slug}</a>
        </div>
      ),
    },
    {
      key: 'company',
      label: 'Book Box',
      render: (row: ApiBookEdition) => row.bookBoxCompany?.name
        ? <span className="text-amber-400 text-sm">{row.bookBoxCompany.name}</span>
        : <span className="text-stone-500">—</span>,
    },
    {
      key: 'verified',
      label: 'Status',
      render: (row: ApiBookEdition) => row.verifiedAt ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">✓ Verified</span>
      ) : (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">⚠ Unverified</span>
          {canVerify && (
            <button
              onClick={(e) => { e.stopPropagation(); verifyMutation.mutate(row.slug) }}
              disabled={verifyMutation.isPending}
              className="text-xs px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-400 hover:bg-emerald-800/60 border border-emerald-700/40 transition-colors disabled:opacity-50"
            >
              Verify
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Editions</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Edition
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="search"
          placeholder="Search by book, author, publisher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 w-72"
        />
        {!isManager && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-300 focus:outline-none focus:border-amber-400"
          >
            <option value="">All Book Boxes</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {(search || companyFilter || unverifiedOnly) && (
          <button
            onClick={() => { setSearch(''); setCompanyFilter(''); setUnverifiedOnly(false) }}
            className="text-stone-400 hover:text-stone-200 text-sm px-3 py-2"
          >
            Clear
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-stone-400 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={unverifiedOnly}
            onChange={(e) => setUnverifiedOnly(e.target.checked)}
            className="accent-amber-400"
          />
          Unverified only
        </label>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : editions.length === 0 ? (
        <div className="text-stone-500 py-8 text-center">No editions found{search || companyFilter ? ' matching your filters' : ''}.</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={editions}
            onEdit={(row) => setEditEdition(row)}
            onDelete={(row) => { setDeleteError(null); setDeleteEdition(row); }}
          />
          {(data?.totalPages ?? 1) > 1 && (
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 rounded border border-stone-700 text-stone-400 disabled:opacity-40 hover:border-amber-500 hover:text-amber-400 transition-colors text-sm">← Prev</button>
              <span className="text-stone-500 text-sm">Page {page} / {data?.totalPages}</span>
              <button onClick={() => setPage(p => Math.min(data?.totalPages ?? 1, p + 1))} disabled={page === (data?.totalPages ?? 1)}
                className="px-3 py-1 rounded border border-stone-700 text-stone-400 disabled:opacity-40 hover:border-amber-500 hover:text-amber-400 transition-colors text-sm">Next →</button>
            </div>
          )}
        </>
      )}

      <FormModal open={createOpen} title="Add Edition" onClose={() => setCreateOpen(false)}>
        <AddEditionFlow
          defaultCompanyId={isManager ? managedCompanyId : undefined}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['admin', 'editions'] }); setCreateOpen(false) }}
          onCancel={() => setCreateOpen(false)}
        />
      </FormModal>

      <FormModal
        open={editEdition !== null}
        title="Edit Edition"
        onClose={() => setEditEdition(null)}
      >
        {editEdition && (
          <EditBookEditionForm
            edition={editEdition}
            onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['admin', 'editions'] }); setEditEdition(null) }}
            onCancel={() => setEditEdition(null)}
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteEdition !== null}
        message={deleteError ?? `Delete edition "${deleteEdition?.publisher ?? deleteEdition?.slug}"?${isManager ? ' You can only delete editions not in any user\'s collection.' : ' This cannot be undone.'}`}
        onConfirm={() => !deleteError && deleteEdition && deleteMutation.mutate(deleteEdition.slug)}
        onCancel={() => { setDeleteEdition(null); setDeleteError(null); }}
      />
    </div>
  )
}
