'use client'

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { PaginatedResponse, ApiBook, ApiAuthor, ApiBookBoxCompany, ApiSubscription } from '@luxgrimoire/shared-types'

interface StatCardProps {
  label: string
  value: number | undefined
  loading: boolean
}

function StatCard({ label, value, loading }: StatCardProps) {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
      {loading ? (
        <div className="h-9 w-16 bg-stone-800 rounded animate-pulse mb-2" />
      ) : (
        <p className="text-amber-400 text-3xl font-bold">{value ?? '—'}</p>
      )}
      <p className="text-stone-400 text-sm mt-1">{label}</p>
    </div>
  )
}

export default function AdminDashboard() {
  const { data: booksData, isLoading: booksLoading } = useQuery({
    queryKey: ['admin', 'books', 'stats'],
    queryFn: () => authFetch<PaginatedResponse<ApiBook>>('/books?page=1&pageSize=1'),
  })

  const { data: authorsData, isLoading: authorsLoading } = useQuery({
    queryKey: ['admin', 'authors', 'stats'],
    queryFn: () => authFetch<PaginatedResponse<ApiAuthor>>('/authors?page=1&pageSize=1'),
  })

  const { data: companiesData, isLoading: companiesLoading } = useQuery({
    queryKey: ['admin', 'companies', 'stats'],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiBookBoxCompany> | ApiBookBoxCompany[]>(
        '/companies?page=1&pageSize=1',
      ),
  })

  const { data: subscriptionsData, isLoading: subsLoading } = useQuery({
    queryKey: ['admin', 'subscriptions', 'stats'],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiSubscription>>('/subscriptions?page=1&pageSize=1'),
  })

  const companiesTotal = companiesData
    ? Array.isArray(companiesData)
      ? companiesData.length
      : companiesData.total
    : undefined

  return (
    <div>
      <h1 className="text-2xl font-bold text-stone-100 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard label="Total Books" value={booksData?.total} loading={booksLoading} />
        <StatCard label="Total Authors" value={authorsData?.total} loading={authorsLoading} />
        <StatCard label="Total Companies" value={companiesTotal} loading={companiesLoading} />
        <StatCard
          label="Total Subscriptions"
          value={subscriptionsData?.total}
          loading={subsLoading}
        />
      </div>

      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-stone-100 mb-2">Recent Activity</h2>
        <p className="text-stone-500 text-sm">Dashboard coming soon</p>
      </div>
    </div>
  )
}
