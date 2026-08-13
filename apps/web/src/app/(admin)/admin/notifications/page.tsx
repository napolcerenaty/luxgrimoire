'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Send, Trash2, Settings, Users, CheckCheck } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-brand-400 text-sm'
const LABEL_CLASS = 'block text-xs text-stone-400 mb-1 font-medium uppercase tracking-wide'

type TargetType = 'all' | 'role' | 'users'

const ROLES = ['USER', 'COMPANY_MANAGER', 'MODERATOR', 'ADMIN'] as const

interface ApiUser {
  id: string
  username: string
  email: string
  role: string
}

export default function AdminNotificationsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  // ─── Send form state ─────────────────────────────────────────────────────────
  const [targetType, setTargetType] = useState<TargetType>('all')
  const [selectedRole, setSelectedRole] = useState<string>('USER')
  const [userSearch, setUserSearch] = useState('')
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<ApiUser[]>([])
  const [title, setTitle] = useState('')
  const [body, setBodyText] = useState('')
  const [link, setLink] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('')
  const [sendResult, setSendResult] = useState<string | null>(null)

  // ─── TTL settings state ───────────────────────────────────────────────────────
  const [ttlInput, setTtlInput] = useState('')

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const { data: settingsData, refetch: refetchSettings } = useQuery({
    queryKey: ['admin', 'notification-settings'],
    queryFn: () => authFetch<{ ttlDays: number }>('/notifications/admin/settings'),
  })

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedUserSearch(userSearch.trim()), 300)
    return () => clearTimeout(timeout)
  }, [userSearch])

  const { data: usersData, isFetching: isFetchingUsers } = useQuery({
    queryKey: ['admin', 'users-list', debouncedUserSearch],
    queryFn: () =>
      authFetch<{ data: ApiUser[] }>(`/users?page=1&pageSize=20&search=${encodeURIComponent(debouncedUserSearch)}`),
    enabled: targetType === 'users' && debouncedUserSearch.length >= 2,
  })

  const filteredUsers = (usersData?.data ?? []).filter(
    (u) => !selectedUsers.find((s) => s.id === u.id),
  )

  // ─── Mutations ────────────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: () =>
      authFetch<{ sent: number }>('/notifications/admin/send', {
        method: 'POST',
        body: JSON.stringify({
          targetType,
          role: targetType === 'role' ? selectedRole : undefined,
          userIds: targetType === 'users' ? selectedUsers.map((u) => u.id) : undefined,
          title,
          bodyText: body || undefined,
          link: link || undefined,
          expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        }),
      }),
    onSuccess: (res) => {
      setSendResult(`✓ Sent to ${res.sent} user${res.sent !== 1 ? 's' : ''}`)
      setTitle('')
      setBodyText('')
      setLink('')
      setExpiresInDays('')
      setSelectedUsers([])
      setUserSearch('')
      setTimeout(() => setSendResult(null), 4000)
    },
    onError: (err: Error) => setSendResult(`✗ Error: ${err.message}`),
  })

  const cleanupMutation = useMutation({
    mutationFn: () =>
      authFetch<{ deleted: number }>('/notifications/admin/cleanup', { method: 'POST' }),
    onSuccess: (res) => {
      alert(`Cleaned up ${res.deleted} expired notification${res.deleted !== 1 ? 's' : ''}`)
    },
  })

  const saveTtlMutation = useMutation({
    mutationFn: (days: number) =>
      authFetch('/notifications/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ ttlDays: days }),
      }),
    onSuccess: () => {
      refetchSettings()
      setTtlInput('')
    },
  })

  if (user && user.role !== 'ADMIN') {
    router.replace('/admin')
    return null
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Bell size={22} className="text-brand-400" />
        <h1 className="text-2xl font-bold text-stone-100">Notifications</h1>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* ─── Send Notification ─────────────────────────────────────────────── */}
        <section className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Send size={16} className="text-brand-400" />
            <h2 className="text-base font-semibold text-stone-100">Send Notification</h2>
          </div>

          <div className="flex flex-col gap-4">
            {/* Target */}
            <div>
              <label className={LABEL_CLASS}>Target</label>
              <div className="flex gap-2">
                {(['all', 'role', 'users'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTargetType(t); setSelectedUsers([]) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      targetType === t
                        ? 'bg-brand-400 text-stone-950'
                        : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {t === 'all' ? 'All users' : t === 'role' ? 'By role' : 'Specific users'}
                  </button>
                ))}
              </div>
            </div>

            {/* Role picker */}
            {targetType === 'role' && (
              <div>
                <label className={LABEL_CLASS}>Role</label>
                <select
                  className={INPUT_CLASS}
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            {/* User picker */}
            {targetType === 'users' && (
              <div>
                <label className={LABEL_CLASS}>Users</label>

                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedUsers.map((u) => (
                      <span
                        key={u.id}
                        className="flex items-center gap-1 bg-stone-800 text-stone-300 text-xs px-2 py-1 rounded-lg"
                      >
                        {u.username}
                        <button
                          onClick={() => setSelectedUsers((prev) => prev.filter((x) => x.id !== u.id))}
                          className="text-stone-500 hover:text-rose-400"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <input
                  className={INPUT_CLASS}
                  placeholder="Type to search users…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
                {userSearch.trim() === '' && (
                  <div className="mt-1 text-xs text-stone-500">Type to search users…</div>
                )}
                {userSearch.trim() !== '' && debouncedUserSearch.length < 2 && (
                  <div className="mt-1 text-xs text-stone-500">Type at least 2 characters…</div>
                )}
                {debouncedUserSearch.length >= 2 && isFetchingUsers && (
                  <div className="mt-1 text-xs text-stone-500">Searching users…</div>
                )}
                {debouncedUserSearch.length >= 2 && !isFetchingUsers && filteredUsers.length > 0 && (
                  <div className="mt-1 bg-stone-800 border border-stone-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    {filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          setSelectedUsers((prev) => [...prev, u])
                          setUserSearch('')
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-stone-700 transition-colors"
                      >
                        <span className="text-sm text-stone-200">{u.username}</span>
                        <span className="text-xs text-stone-500">{u.email}</span>
                        <span className="ml-auto text-xs text-stone-600">{u.role}</span>
                      </button>
                    ))}
                  </div>
                )}
                {debouncedUserSearch.length >= 2 && !isFetchingUsers && filteredUsers.length === 0 && (
                  <div className="mt-1 text-xs text-stone-500">No users found.</div>
                )}
              </div>
            )}

            {/* Title */}
            <div>
              <label className={LABEL_CLASS}>Title *</label>
              <input
                required
                className={INPUT_CLASS}
                placeholder="Notification title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Body */}
            <div>
              <label className={LABEL_CLASS}>Message</label>
              <textarea
                rows={3}
                className={INPUT_CLASS}
                placeholder="Optional message body…"
                value={body}
                onChange={(e) => setBodyText(e.target.value)}
              />
            </div>

            {/* Link */}
            <div>
              <label className={LABEL_CLASS}>Link (optional)</label>
              <input
                className={INPUT_CLASS}
                placeholder="e.g. /subscriptions/my-sub"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>

            {/* Expiry override */}
            <div>
              <label className={LABEL_CLASS}>
                Expires in days (leave empty for default: {settingsData?.ttlDays ?? '…'} days)
              </label>
              <input
                type="number"
                min={0}
                className={INPUT_CLASS}
                placeholder={String(settingsData?.ttlDays ?? 30)}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => sendMutation.mutate()}
                disabled={!title.trim() || sendMutation.isPending || (targetType === 'users' && selectedUsers.length === 0)}
                className="flex items-center gap-2 bg-brand-400 text-stone-950 font-semibold px-5 py-2 rounded-lg hover:bg-brand-300 disabled:opacity-50 transition-colors text-sm"
              >
                <Send size={14} />
                {sendMutation.isPending ? 'Sending…' : 'Send'}
              </button>
              {sendResult && (
                <span className={`text-sm ${sendResult.startsWith('✓') ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {sendResult}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ─── Settings ─────────────────────────────────────────────────────── */}
        <section className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Settings size={16} className="text-brand-400" />
            <h2 className="text-base font-semibold text-stone-100">Settings</h2>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className={LABEL_CLASS}>
                Default TTL — days before notification expires (0 = never)
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={0}
                  className={`${INPUT_CLASS} max-w-[120px]`}
                  placeholder={String(settingsData?.ttlDays ?? 30)}
                  value={ttlInput}
                  onChange={(e) => setTtlInput(e.target.value)}
                />
                <button
                  onClick={() => saveTtlMutation.mutate(Number(ttlInput))}
                  disabled={ttlInput === '' || saveTtlMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-stone-700 text-stone-200 hover:bg-stone-600 disabled:opacity-50 transition-colors text-sm"
                >
                  {saveTtlMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                {settingsData && (
                  <span className="text-stone-500 text-xs">Current: {settingsData.ttlDays} days</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Cleanup ──────────────────────────────────────────────────────── */}
        <section className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Trash2 size={16} className="text-brand-400" />
            <h2 className="text-base font-semibold text-stone-100">Maintenance</h2>
          </div>
          <p className="text-stone-500 text-sm mb-4">
            Expired notifications are purged automatically once a day. You can also trigger a manual cleanup.
          </p>
          <button
            onClick={() => cleanupMutation.mutate()}
            disabled={cleanupMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-800 border border-stone-700 text-stone-300 hover:border-rose-600 hover:text-rose-400 disabled:opacity-50 transition-colors text-sm"
          >
            <Trash2 size={14} />
            {cleanupMutation.isPending ? 'Running…' : 'Purge expired now'}
          </button>
        </section>
      </div>
    </div>
  )
}
