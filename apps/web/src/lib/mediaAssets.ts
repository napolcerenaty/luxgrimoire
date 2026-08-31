import { authFetch } from './authFetch'

export interface MediaAssetItem {
  id: string
  publicId: string
  folder: string | null
  createdAt: string
}

export interface MediaAssetsPage {
  data: MediaAssetItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function fetchMediaAssets(opts: {
  search?: string
  folder?: string
  page?: number
  pageSize?: number
}): Promise<MediaAssetsPage> {
  const params = new URLSearchParams()
  if (opts.search) params.set('search', opts.search)
  if (opts.folder) params.set('folder', opts.folder)
  if (opts.page) params.set('page', String(opts.page))
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize))
  return authFetch<MediaAssetsPage>(`/media-assets?${params}`)
}

/** Derives a display name from a Cloudinary publicId — the last path segment. */
export function assetName(publicId: string): string {
  return publicId.split('/').pop() || publicId
}

/** Reason the delete button should be disabled for a media asset, or `false` if it may be deleted. */
export function usageDeleteBlockReason(totalUsageCount: number): string | false {
  if (totalUsageCount <= 0) return false
  return `In use (${totalUsageCount} reference${totalUsageCount === 1 ? '' : 's'})`
}

export interface MediaAssetAdminItem extends MediaAssetItem {
  bookCount: number
  otherUsageCount: number
  totalUsageCount: number
}

export interface MediaAssetsAdminPage {
  data: MediaAssetAdminItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function fetchMediaAssetsAdmin(opts: {
  search?: string
  folder?: string
  page?: number
  pageSize?: number
  unusedOnly?: boolean
}): Promise<MediaAssetsAdminPage> {
  const params = new URLSearchParams()
  if (opts.search) params.set('search', opts.search)
  if (opts.folder) params.set('folder', opts.folder)
  if (opts.page) params.set('page', String(opts.page))
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize))
  if (opts.unusedOnly) params.set('unusedOnly', 'true')
  return authFetch<MediaAssetsAdminPage>(`/media-assets/admin?${params}`)
}
