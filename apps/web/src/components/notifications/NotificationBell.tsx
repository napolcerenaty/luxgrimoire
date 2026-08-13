'use client'

import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bell, X, Check, CheckCheck } from 'lucide-react'
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

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [notifications, setNotifications] = useState<ApiNotification[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({ right: 0 })

  const fetchCount = useCallback(async () => {
    try {
      const res = await authFetch<{ count: number }>('/notifications/unread-count')
      setUnread(res.count)
    } catch {
      // silently fail
    }
  }, [])

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch<{ data: ApiNotification[] }>('/notifications?pageSize=8')
      setNotifications(res.data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll every 60s for unread count
  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => clearInterval(interval)
  }, [fetchCount])

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const handleOpen = () => {
    if (!open) {
      fetchNotifications()
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        const vw = window.innerWidth
        const dropW = Math.min(320, vw - 8)
        // How much to shift right so left edge stays >= 4px from viewport
        const neededShift = Math.max(0, dropW + 4 - rect.right)
        const maxShift = Math.max(0, vw - 4 - rect.right)
        const rightOffset = -Math.min(neededShift, maxShift)
        setDropdownStyle({ right: rightOffset, width: dropW })
      }
    }
    setOpen((o) => !o)
  }

  const markRead = async (id: string) => {
    await authFetch(`/notifications/${id}/read`, { method: 'POST' })
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    )
    setUnread((c) => Math.max(0, c - 1))
  }

  const deleteOne = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const wasUnread = notifications.find((n) => n.id === id)?.readAt === null
    await authFetch(`/notifications/${id}`, { method: 'DELETE' })
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    if (wasUnread) setUnread((c) => Math.max(0, c - 1))
  }

  const markAllRead = async () => {
    await authFetch('/notifications/read-all', { method: 'POST' })
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    )
    setUnread(0)
  }

  const handleNotificationClick = (n: ApiNotification) => {
    if (!n.readAt) markRead(n.id)
    if (n.link?.startsWith('/')) {
      setOpen(false)
      router.push(n.link)
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="relative p-1.5 rounded-lg text-navy-400 hover:text-brand-400 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-brand-400 text-navy-950 text-[10px] font-bold flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute mt-2 rounded-xl border border-navy-700 bg-navy-900 shadow-2xl z-[300] overflow-hidden"
          style={dropdownStyle}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-navy-800">
            <span className="text-sm font-semibold text-navy-100">Notifications</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-navy-400 hover:text-brand-400 transition-colors flex items-center gap-1"
                title="Mark all as read"
              >
                <CheckCheck size={13} />
                All read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="py-8 flex justify-center">
                <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="text-navy-500 text-sm text-center py-8">No notifications</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`group flex items-start gap-3 px-4 py-3 border-b border-navy-800 last:border-0 transition-colors hover:bg-navy-800 ${
                    !n.readAt ? 'bg-brand-500/5' : ''
                  }`}
                >
                  <div className="mt-1.5 shrink-0">
                    <div className={`w-2 h-2 rounded-full ${!n.readAt ? 'bg-brand-400' : 'bg-navy-700'}`} />
                  </div>

                  {n.link?.startsWith('/') ? (
                    <Link
                      href={n.link}
                      className="flex-1 min-w-0"
                      onClick={() => { if (!n.readAt) markRead(n.id); setOpen(false) }}
                    >
                      <p className={`text-sm leading-snug break-words ${!n.readAt ? 'text-navy-100' : 'text-navy-400'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-navy-500 mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-xs text-navy-600 mt-1">{timeAgo(n.createdAt)}</p>
                    </Link>
                  ) : (
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleNotificationClick(n)}
                    >
                      <p className={`text-sm leading-snug break-words ${!n.readAt ? 'text-navy-100' : 'text-navy-400'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-navy-500 mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-xs text-navy-600 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.readAt && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markRead(n.id) }}
                        className="p-1 rounded hover:text-brand-400 text-navy-500 transition-colors"
                        title="Mark as read"
                      >
                        <Check size={13} />
                      </button>
                    )}
                    <button
                      onClick={(e) => deleteOne(e, n.id)}
                      className="p-1 rounded hover:text-rose-400 text-navy-500 transition-colors"
                      title="Delete"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-navy-800">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
