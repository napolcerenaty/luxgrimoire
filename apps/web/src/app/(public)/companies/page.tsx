import type { Metadata } from 'next'
import { apiFetch } from '@/lib/api'
import type { ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'
import { CompaniesClient } from './CompaniesClient'

export const metadata: Metadata = {
  title: 'Book Boxes',
  description: 'Browse all luxury book subscription box companies on LuxGrimoire.',
}

export default async function CompaniesPage() {
  let companies: ApiBookBoxCompany[] = []
  try {
    const res = await apiFetch<PaginatedResponse<ApiBookBoxCompany>>('/companies?pageSize=100')
    companies = res.data
  } catch {
    // show empty state
  }

  return <CompaniesClient companies={companies} />
}
