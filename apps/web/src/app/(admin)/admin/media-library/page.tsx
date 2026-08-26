'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { assetName, fetchMediaAssetsAdmin, usageDeleteBlockReason, type MediaAssetAdminItem } from '@/lib/mediaAssets'
import DataTable from '@/components/admin/DataTable'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { Pagination } from '@/components/admin/Pagination'

const PAGE_SIZE = 24

export default function MediaLibraryAdminPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [folderFilter, setFolderFilter] = useState('')
  const [unusedOnly, setUnusedOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<MediaAssetAdminItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, folderFilter, unusedOnly])

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'media-assets', debouncedSearch, folderFilter, unusedOnly, page],
    queryFn: () =>
      fetchMediaAssetsAdmin({
        search: debouncedSearch || undefined,
        folder: folderFilter || undefined,
        unusedOnly,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    enabled: user?.role === 'ADMIN',
  })

  const { data: folders } = useQuery<string[]>({
    queryKey: ['media-assets', 'folders'],
    queryFn: () => authFetch<string[]>('/media-assets/folders'),
    enabled: user?.role === 'ADMIN',
  })

  const sortedFolders = useMemo(() => (folders ?? []).slice().sort((a, b) => a.localeCompare(b)), [folders])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/media-assets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'media-assets'] })
      setDeleteTarget(null)
      setDeleteError(null)
    },
    onError: (err: Error) => {
      // Asset likely became in-use since the list was fetched — refresh so the row reflects reality.
      queryClient.invalidateQueries({ queryKey: ['admin', 'media-assets'] })
      setDeleteError(err.message || 'Could not delete this asset — it may still be in use.')
    },
  })

  if (user?.role !== 'ADMIN') {
    return (
      <div className="text-navy-400 py-12 text-center text-sm">
        This section is restricted to admins.
      </div>
    )
  }

  const items = data?.data ?? []

  const columns = [
    {
      key: 'thumbnail',
      label: '',
      render: (row: MediaAssetAdminItem) => {
        const thumb = cloudinaryUrl(row.publicId, 'w_80,h_80,c_fill,q_auto,f_auto')
        return thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={assetName(row.publicId)} className="w-10 h-10 rounded object-cover" />
        ) : (
          <div className="w-10 h-10 rounded bg-navy-800" />
        )
      },
    },
    {
      key: 'name',
      label: 'Name',
      render: (row: MediaAssetAdminItem) => (
        <span className="font-medium text-navy-200">{assetName(row.publicId)}</span>
      ),
    },
    {
      key: 'folder',
      label: 'Folder',
      render: (row: MediaAssetAdminItem) => row.folder ?? '—',
    },
    {
      key: 'bookCount',
      label: 'Books',
      render: (row: MediaAssetAdminItem) => row.bookCount,
    },
    {
      key: 'otherUsageCount',
      label: 'Other usage',
      render: (row: MediaAssetAdminItem) =>
        row.otherUsageCount > 0 ? (
          <span title="Used as an author/artist photo, company logo, subscription/series/month cover, sale announcement image, or a community-submitted edition photo">
            {row.otherUsageCount}
          </span>
        ) : (
          0
        ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (row: MediaAssetAdminItem) => new Date(row.createdAt).toLocaleDateString(),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-100">Media Library</h1>
      </div>

      <div className="flex flex-col gap-4 mb-4 md:flex-row">
        <input
          type="search"
          placeholder="Search by filename…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 placeholder-navy-500 focus:outline-none focus:border-brand-400 text-sm"
        />
        <select
          value={folderFilter}
          onChange={(e) => setFolderFilter(e.target.value)}
          className="w-full max-w-xs bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 focus:outline-none focus:border-brand-400 text-sm"
        >
          <option value="">All folders</option>
          {sortedFolders.map((folder) => (
            <option key={folder} value={folder}>
              {folder}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-navy-300 md:self-center">
          <input
            type="checkbox"
            checked={unusedOnly}
            onChange={(e) => setUnusedOnly(e.target.checked)}
            className="w-4 h-4 rounded accent-brand-500"
          />
          Show unlinked only
        </label>
      </div>

      {isLoading ? (
        <div className="text-navy-400 py-8 text-center">Loading…</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={items}
            onDelete={(row) => {
              setDeleteError(null)
              setDeleteTarget(row)
            }}
            deleteDisabled={(row) => usageDeleteBlockReason(row.totalUsageCount)}
          />
          <Pagination page={page} totalPages={data?.totalPages ?? 1} total={data?.total} onPageChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        message={`Delete "${deleteTarget ? assetName(deleteTarget.publicId) : ''}"? This permanently removes it from Cloudinary and cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {deleteError && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border border-red-800 bg-red-950/90 px-4 py-3 text-sm text-red-200 shadow-2xl">
          {deleteError}
        </div>
      )}
    </div>
  )
}
