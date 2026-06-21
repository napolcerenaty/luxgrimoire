'use client'

import { useState, useEffect, useRef } from 'react'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { INPUT_CLASS, LABEL_CLASS } from '@/lib/adminFormStyles'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { useAuth } from '@/components/AuthProvider'
import type { ApiBookEdition, ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'
import dynamic from 'next/dynamic'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { Pagination } from '@/components/admin/Pagination'
const CreateBookEditionForm = dynamic(() => import('@/components/admin/CreateBookEditionForm'), { ssr: false })
const EditBookEditionForm = dynamic(() => import('@/components/admin/EditBookEditionForm'), { ssr: false })




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
                {cloudinaryUrl(book.coverImage, 'w_64,h_80,c_fill,q_auto,f_auto')
                  ? <img src={cloudinaryUrl(book.coverImage, 'w_64,h_80,c_fill,q_auto,f_auto')!} alt="" className="w-8 h-10 object-cover rounded shrink-0" />
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

function EditEditionLoader({ slug, onSuccess, onCancel }: { slug: string; onSuccess: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['edition-detail-edit', slug],
    queryFn: () => authFetch<ApiBookEdition>(`/editions/${slug}/for-edit`),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
  if (isLoading || !data) return <div className="py-12 text-center text-stone-400">Loading…</div>
  return <EditBookEditionForm key={data.id} edition={data} onSuccess={() => {
    queryClient.invalidateQueries({ queryKey: ['edition-detail', slug] })
    queryClient.invalidateQueries({ queryKey: ['edition-detail-edit', slug] })
    onSuccess()
  }} onCancel={onCancel} />
}

export default function AdminEditionsPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isManager = user?.role === 'COMPANY_MANAGER'
  const managedCompanyId = (user as (typeof user & { managedCompanyId?: string }) | null)?.managedCompanyId ?? ''

  const createModal = useModalState()
  const [editEditionSlug, setEditEditionSlug] = useState<string | null>(null)
  const [deleteEdition, setDeleteEdition] = useState<ApiBookEdition | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [retagResult, setRetagResult] = useState<{ total: number; done: number; failed: number } | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [unverifiedOnly, setUnverifiedOnly] = useState(false)
  const [exclusiveOnly, setExclusiveOnly] = useState(false)
  const [hasOfficialPhoto, setHasOfficialPhoto] = useState(false)
  const [subscriptionFilter, setSubscriptionFilter] = useState('') // '' = all, 'none' = no sub, or sub id
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [companyFilter, unverifiedOnly, exclusiveOnly, hasOfficialPhoto, subscriptionFilter])

  const buildParams = () => {
    const p = new URLSearchParams({ page: String(page), pageSize: '10' })
    if (debouncedSearch) p.set('search', debouncedSearch)
    if (unverifiedOnly) p.set('needsVerification', 'true')
    if (exclusiveOnly) p.set('exclusiveOnly', 'true')
    if (hasOfficialPhoto) p.set('hasOfficialPhoto', 'true')
    if (subscriptionFilter === 'none') p.set('noSubscription', 'true')
    else if (subscriptionFilter) p.set('subscriptionId', subscriptionFilter)
    if (isManager && managedCompanyId) {
      p.set('companyId', managedCompanyId)
    } else if (companyFilter) {
      p.set('companyId', companyFilter)
    }
    return p.toString()
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'editions', page, debouncedSearch, companyFilter, managedCompanyId, unverifiedOnly, exclusiveOnly, hasOfficialPhoto, subscriptionFilter],
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

  // Subscriptions for filter dropdown
  const { data: subscriptionsData } = useQuery({
    queryKey: ['admin', 'subscriptions-list'],
    queryFn: () => authFetch<{ data: { id: string; name: string }[] }>('/subscriptions?pageSize=100'),
    enabled: !isManager,
  })
  const subscriptions = subscriptionsData?.data ?? []

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

  const handleRetagAll = async () => {
    if (!confirm('Re-run auto-detection for all editions? This may take a while.')) return
    try {
      const res = await authFetch<{ total: number; done: number; failed: number }>('/editions/retag-all', { method: 'POST' })
      setRetagResult(res)
    } catch (e) {
      alert(`Retag failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

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
      label: 'Edition',
      render: (row: ApiBookEdition) => (
        <div>
          <a href={`/editions/${row.slug}`} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 text-sm font-medium">{row.slug}</a>
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
      key: 'collection',
      label: 'Collection',
      render: (row: ApiBookEdition) => {
        const col = (row as any).collection
        if (!col) return <span className="text-xs text-violet-400 font-medium">Exclusive</span>
        return <span className="text-stone-400 text-sm">{col.name}</span>
      },
    },
    {
      key: 'subscription',
      label: 'Subscription',
      render: (row: ApiBookEdition) => {
        const name = (row as any).subscriptionName
        if (!name) return <span className="text-stone-600 text-sm">—</span>
        return <span className="text-sky-400 text-sm">{name}</span>
      },
    },
    {
      key: 'photo',
      label: '📷',
      render: (row: ApiBookEdition) => {
        const hasPhoto = Array.isArray(row.additionalImages) && row.additionalImages.length > 0
        return hasPhoto
          ? <span className="text-green-400 text-sm" title="Has official photo">✓</span>
          : <span className="text-stone-600 text-sm" title="No official photo">—</span>
      },
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-stone-100">Editions</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => createModal.open()}
            className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
          >
            Add Edition
          </button>
        </div>
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
        {!isManager && (
          <select
            value={subscriptionFilter}
            onChange={(e) => setSubscriptionFilter(e.target.value)}
            className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-300 focus:outline-none focus:border-amber-400"
          >
            <option value="">All subscriptions</option>
            <option value="none">Not a subscription</option>
            {subscriptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        {(search || companyFilter || subscriptionFilter || unverifiedOnly || exclusiveOnly || hasOfficialPhoto) && (
          <button
            onClick={() => { setSearch(''); setCompanyFilter(''); setSubscriptionFilter(''); setUnverifiedOnly(false); setExclusiveOnly(false); setHasOfficialPhoto(false) }}
            className="text-stone-400 hover:text-stone-200 text-sm px-3 py-2"
          >
            Clear
          </button>
        )}
        <div className="flex items-center gap-4 ml-auto flex-wrap">
          <label className="flex items-center gap-2 text-sm text-stone-400 cursor-pointer">
            <input type="checkbox" checked={exclusiveOnly} onChange={(e) => setExclusiveOnly(e.target.checked)} className="accent-violet-400" />
            Exclusive only
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-400 cursor-pointer">
            <input type="checkbox" checked={hasOfficialPhoto} onChange={(e) => setHasOfficialPhoto(e.target.checked)} className="accent-green-400" />
            Has official photo
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-400 cursor-pointer">
            <input type="checkbox" checked={unverifiedOnly} onChange={(e) => setUnverifiedOnly(e.target.checked)} className="accent-amber-400" />
            Unverified only
          </label>
        </div>
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
            onEdit={(row) => setEditEditionSlug(row.slug)}
            onDelete={(row) => { setDeleteError(null); setDeleteEdition(row); }}
          />
          <Pagination page={page} totalPages={data?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}

      <FormModal open={createModal.isOpen} title="Add Edition" onClose={() => createModal.close()}>
        <AddEditionFlow
          defaultCompanyId={isManager ? managedCompanyId : undefined}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['admin', 'editions'] }); createModal.close() }}
          onCancel={() => createModal.close()}
        />
      </FormModal>

      <FormModal
        open={editEditionSlug !== null}
        title="Edit Edition"
        onClose={() => setEditEditionSlug(null)}
      >
        {editEditionSlug && (
          <EditEditionLoader
            slug={editEditionSlug}
            onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['admin', 'editions'] }); setEditEditionSlug(null) }}
            onCancel={() => setEditEditionSlug(null)}
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
