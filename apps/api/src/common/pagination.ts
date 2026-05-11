export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PageMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function parsePagination(params: PaginationParams): { skip: number; take: number; page: number; pageSize: number } {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 20))
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize }
}

export function buildPageMeta(total: number, page: number, pageSize: number): PageMeta {
  return { total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}
