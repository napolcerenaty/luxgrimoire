'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Check } from 'lucide-react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { fetchMediaAssets, type MediaAssetItem, type MediaAssetsPage } from '@/lib/mediaAssets'

interface Props {
  open: boolean
  folder?: string
  /** When true, allows selecting multiple images; confirm button returns all selected. */
  multi?: boolean
  onSelect: (assets: MediaAssetItem[]) => void
  onClose: () => void
}

const INPUT =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-100 focus:outline-none focus:border-brand-400'
const BUTTON =
  'px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 disabled:opacity-50 disabled:hover:bg-stone-700 transition-colors'

function assetName(asset: MediaAssetItem): string {
  return asset.publicId.split('/').pop() || asset.publicId
}

export default function MediaLibraryPicker({ open, folder: _folder, multi = false, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [folderFilter, setFolderFilter] = useState('')
  const [selected, setSelected] = useState<Map<string, MediaAssetItem>>(new Map())

  useEffect(() => {
    if (!open) return
    setSearch('')
    setDebouncedSearch('')
    setPage(1)
    setFolderFilter('')
    setSelected(new Map())
  }, [open])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, folderFilter])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['media-assets', debouncedSearch, folderFilter, page],
    queryFn: () =>
      fetchMediaAssets({
        search: debouncedSearch || undefined,
        folder: folderFilter || undefined,
        page,
        pageSize: 48,
      }),
    enabled: open,
    placeholderData: keepPreviousData,
  })

  const { data: folders } = useQuery<string[]>({
    queryKey: ['media-assets', 'folders'],
    queryFn: () => authFetch<string[]>('/media-assets/folders'),
    enabled: open,
  })

  const sortedFolders = useMemo(() => (folders ?? []).slice().sort((a, b) => a.localeCompare(b)), [folders])

  if (!open) return null

  const items = data?.data ?? []
  const totalPages = data?.totalPages ?? 1
  const canPrev = page > 1
  const canNext = page < totalPages

  function toggle(asset: MediaAssetItem) {
    if (!multi) {
      onSelect([asset])
      return
    }
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(asset.id)) next.delete(asset.id)
      else next.set(asset.id, asset)
      return next
    })
  }

  function confirmSelection() {
    if (selected.size > 0) onSelect(Array.from(selected.values()))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative mx-4 flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-stone-700 bg-stone-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-stone-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-100">Media library</h2>
            <p className="text-sm text-stone-400">
              {multi ? 'Select images, then click Confirm.' : 'Click an image to pick it.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 transition-colors hover:text-stone-200"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4 border-b border-stone-800 px-6 py-4 md:flex-row">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Search by filename</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by filename…"
              className={INPUT}
            />
          </div>
          <div className="w-full md:w-64">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Folder</label>
            <select
              value={folderFilter}
              onChange={e => setFolderFilter(e.target.value)}
              className={INPUT}
            >
              <option value="">All folders</option>
              {sortedFolders.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-stone-400">Loading images…</div>
          ) : items.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-stone-500">No images yet</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {items.map(asset => {
                const isSelected = selected.has(asset.id)
                const thumb = cloudinaryUrl(asset.publicId, 'w_120,h_160,c_fill,q_auto,f_auto')
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggle(asset)}
                    className="text-left"
                  >
                    <div
                      className={`overflow-hidden rounded-xl border bg-stone-800 transition-all ${
                        isSelected
                          ? 'border-brand-500 ring-2 ring-brand-500/40'
                          : 'border-stone-700 hover:border-stone-500'
                      }`}
                    >
                      <div className="relative aspect-[3/4] bg-stone-800">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt={assetName(asset)} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-stone-600">No image</div>
                        )}
                        {isSelected && (
                          <div className="absolute inset-0 bg-brand-500/20 flex items-center justify-center">
                            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center shadow-lg">
                              <Check size={16} className="text-stone-950" />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="border-t border-stone-700 px-2 py-2">
                        <div className="truncate text-xs font-medium text-stone-200">{assetName(asset)}</div>
                        <div className="truncate text-[11px] text-stone-500">{asset.folder ?? 'No folder'}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-stone-800 px-6 py-4">
          <div className="text-xs text-stone-500">
            {data ? `Page ${data.page} of ${data.totalPages} · ${data.total} total` : 'Page 1 of 1'}
            {isFetching && !isLoading ? ' · Updating…' : ''}
            {multi && selected.size > 0 ? ` · ${selected.size} selected` : ''}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!canPrev} className={BUTTON}>
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={!canNext}
              className={BUTTON}
            >
              Next
            </button>
            {multi && (
              <button
                type="button"
                onClick={confirmSelection}
                disabled={selected.size === 0}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-stone-950 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 transition-colors"
              >
                Add {selected.size > 0 ? `${selected.size} ` : ''}image{selected.size !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
