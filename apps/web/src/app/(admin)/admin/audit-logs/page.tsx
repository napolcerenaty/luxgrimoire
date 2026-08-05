'use client'

import { useState, useCallback } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiAuditLog, PaginatedResponse } from '@luxgrimoire/shared-types'
import { Pagination } from '@/components/admin/Pagination'

const PAGE_SIZE = 15

const ACTION_COLORS: Record<string, string> = {
  CREATE_EDITION: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  UPDATE_EDITION: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_EDITION: 'bg-red-900/60 text-red-300 border-red-700',
  CREATE_BOOK: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  UPDATE_BOOK: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_BOOK: 'bg-red-900/60 text-red-300 border-red-700',
  CREATE_COMPANY: 'bg-sky-900/60 text-sky-300 border-sky-700',
  UPDATE_COMPANY: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_COMPANY: 'bg-red-900/60 text-red-300 border-red-700',
  CREATE_AUTHOR: 'bg-violet-900/60 text-violet-300 border-violet-700',
  UPDATE_AUTHOR: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_AUTHOR: 'bg-red-900/60 text-red-300 border-red-700',
  CREATE_ARTIST: 'bg-pink-900/60 text-pink-300 border-pink-700',
  UPDATE_ARTIST: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_ARTIST: 'bg-red-900/60 text-red-300 border-red-700',
  CREATE_SUBSCRIPTION: 'bg-teal-900/60 text-teal-300 border-teal-700',
  UPDATE_SUBSCRIPTION: 'bg-amber-900/60 text-amber-300 border-amber-700',
  DELETE_SUBSCRIPTION: 'bg-red-900/60 text-red-300 border-red-700',
}

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_COLORS[action] ?? 'bg-stone-800 text-stone-400 border-stone-600'
  return (
    <span className={`inline-block text-[10px] font-mono font-semibold border rounded px-2 py-0.5 ${cls}`}>
      {action}
    </span>
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-stone-800 ${className}`} />
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AdminAuditLogsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [order, setOrder] = useState('desc')

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sortBy,
      order,
    })
    if (search) p.set('search', search)
    if (entityType) p.set('entityType', entityType)
    if (action) p.set('action', action)
    return p.toString()
  }, [page, sortBy, order, search, entityType, action])

  const { data: logsData, isLoading } = useQuery({
    queryKey: ['admin', 'audit-logs', buildParams()],
    queryFn: () => authFetch<PaginatedResponse<ApiAuditLog>>(`/admin/audit-logs?${buildParams()}`),
    placeholderData: keepPreviousData,
  })

  const logs = logsData?.data ?? []
  const totalPages = Math.ceil((logsData?.total ?? 0) / PAGE_SIZE)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-100 mb-1">Audit Log</h1>
        <p className="text-stone-400 text-sm">All admin actions across the system</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search user, action, entity…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="flex-1 min-w-[200px] bg-stone-900 border border-stone-800 rounded-xl px-4 py-2 text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-brand-500 transition-colors"
        />
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1) }}
          className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-brand-500">
          <option value="">All entities</option>
          {['edition', 'book', 'author', 'artist', 'company', 'subscription'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1) }}
          className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-brand-500">
          <option value="createdAt">Sort: Time</option>
          <option value="action">Sort: Action</option>
        </select>
        <select value={order} onChange={(e) => { setOrder(e.target.value); setPage(1) }}
          className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-brand-500">
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-800 bg-stone-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-800 text-stone-400 text-left">
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Entity</th>
              <th className="px-4 py-3 font-semibold">Title</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-stone-800">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                    ))}
                  </tr>
                ))
              : logs.length === 0
              ? <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-500">No log entries found</td></tr>
              : logs.map((log) => (
                <tr key={log.id} className="border-b border-stone-800 hover:bg-stone-800/40 transition-colors">
                  <td className="px-4 py-3 text-stone-400 text-xs whitespace-nowrap">{formatDate(log.createdAt as unknown as string)}</td>
                  <td className="px-4 py-3 text-stone-300 text-xs">{log.username ?? '—'}</td>
                  <td className="px-4 py-3"><ActionBadge action={log.action} /></td>
                  <td className="px-4 py-3 text-stone-400 text-xs">{log.entityType}</td>
                  <td className="px-4 py-3 text-stone-400 text-xs">{log.entityTitle ?? '—'}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={logsData?.total} />
    </div>
  )
}
