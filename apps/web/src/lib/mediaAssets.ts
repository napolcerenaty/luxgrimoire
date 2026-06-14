import { authFetch } from './authFetch'

export interface MediaAssetItem {
  id: string
  publicId: string
  url: string
  folder: string | null
  label: string | null
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
