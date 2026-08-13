'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function expiresIn(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const days = Math.floor(diff / 86_400_000)
  if (days > 0) return `expires in ${days}d`
  const hrs = Math.floor(diff / 3_600_000)
  return `expires in ${hrs}h`
}

interface ApiNotification {
  id: string
  type: string
  title: string
  body?: string
  link?: string
  readAt: string | null
  createdAt: string
  expiresAt?: string | null
}

interface NotificationsResponse {
  data: ApiNotification[]
  total: number
  page: number
  pageSize: number
}

type Tab = 'all' | 'unread'

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const queryKey = ['notifications', tab, page]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      authFetch<NotificationsResponse>(
        `/notifications?page=${page}&pageSize=${PAGE_SIZE}${tab === 'unread' ? '&unreadOnly=true' : ''}`,
      ),
  })

  const notifications = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }, [queryClient])

  const markReadMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => authFetch('/notifications/read-all', { method: 'POST' }),
    onSuccess: invalidate,
  })

  const deleteAllReadMutation = useMutation({
    mutationFn: () => authFetch('/notifications/read', { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  const handleTabChange = (t: Tab) => {
    setTab(t)
    setPage(1)
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell size={22} className="text-brand-400" />
          <h1 className="text-2xl font-bold text-stone-100">Notifications</h1>
          {total > 0 && (
            <span className="text-xs text-stone-500 bg-stone-800 px-2 py-0.5 rounded-full">
              {total}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending || unreadCount === 0}
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-brand-400 disabled:opacity-40 transition-colors"
          >
            <CheckCheck size={14} />
            Mark all read
          </button>
          <div className="w-px h-4 bg-stone-700" />
          <button
            onClick={() => deleteAllReadMutation.mutate()}
            disabled={deleteAllReadMutation.isPending}
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-rose-400 disabled:opacity-40 transition-colors"
          >
            <Trash2 size={14} />
            Delete read
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-stone-900 rounded-xl p-1 w-fit">
        {(['all', 'unread'] as const).map((t) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t
                ? 'bg-brand-400 text-stone-950'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="rounded-xl border border-stone-800 overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex justify-center">
            <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center text-stone-500">
            <Bell size={32} className="mx-auto mb-3 opacity-30" />
            <p>No notifications</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-4 px-5 py-4 border-b border-stone-800 last:border-0 transition-colors ${
                !n.readAt ? 'bg-brand-500/5' : 'bg-stone-900/50'
              }`}
            >
              {/* Unread dot */}
              <div className="mt-2 shrink-0">
                <div className={`w-2 h-2 rounded-full ${!n.readAt ? 'bg-brand-400' : 'bg-stone-700'}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug ${!n.readAt ? 'text-stone-100' : 'text-stone-400'}`}>
                  {n.title}
                </p>
                {n.body && <p className="text-sm text-stone-500 mt-1">{n.body}</p>}
                {n.link && n.link.startsWith('/') && (
                  <a
                    href={n.link}
                    className="text-xs text-brand-400 hover:underline mt-1 inline-block"
                  >
                    View →
                  </a>
                )}
                <p className="text-xs text-stone-600 mt-1.5">
                  {timeAgo(n.createdAt)}
                  {n.expiresAt && (
                    <span className="ml-2 text-stone-700">· {expiresIn(n.expiresAt)}</span>
                  )}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {!n.readAt && (
                  <button
                    onClick={() => markReadMutation.mutate(n.id)}
                    disabled={markReadMutation.isPending}
                    className="p-1.5 rounded-lg text-stone-500 hover:text-brand-400 hover:bg-stone-800 transition-colors"
                    title="Mark as read"
                  >
                    <Check size={14} />
                  </button>
                )}
                <button
                  onClick={() => deleteMutation.mutate(n.id)}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-stone-800 transition-colors"
                  title="Delete"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-stone-400">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg border border-stone-700 hover:border-brand-600 disabled:opacity-40 transition-colors"
          >
            ← Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-stone-700 hover:border-brand-600 disabled:opacity-40 transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
