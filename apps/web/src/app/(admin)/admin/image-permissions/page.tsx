'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { BadgeCheck, Mail, Plus } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type PermissionStatus = 'PENDING' | 'GRANTED' | 'REVOKED' | 'DENIED'
type ContactChannel = 'EMAIL' | 'CONTACT_FORM' | 'OTHER'

interface PermissionRow {
  companyId: string
  companyName: string
  companySlug: string
  hasOfficialImagePermission: boolean
  status: PermissionStatus
  grantedByName: string | null
  grantedAt: string | null
  conditions: string[]
  emailContent: string | null
  updatedAt: string | null
}

interface CommunicationRow {
  id: string
  companyId: string
  sentAt: string
  channel: ContactChannel
  subject: string
  responded: boolean
  createdAt: string
}

const STATUS_STYLES: Record<PermissionStatus, string> = {
  PENDING: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  GRANTED: 'text-green-400 bg-green-500/10 border-green-500/30',
  REVOKED: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  DENIED: 'text-stone-400 bg-stone-700/30 border-stone-600/30',
}

const STATUS_OPTIONS: PermissionStatus[] = ['PENDING', 'GRANTED', 'REVOKED', 'DENIED']
const CHANNEL_OPTIONS: ContactChannel[] = ['EMAIL', 'CONTACT_FORM', 'OTHER']

function toDateInputValue(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

// ── Edit modal ───────────────────────────────────────────────────────────────

function PermissionModal({ row, onClose }: { row: PermissionRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<PermissionStatus>(row.status)
  const [grantedByName, setGrantedByName] = useState(row.grantedByName ?? '')
  const [grantedAt, setGrantedAt] = useState(toDateInputValue(row.grantedAt))
  const [conditions, setConditions] = useState(row.conditions.join('\n'))
  const [emailContent, setEmailContent] = useState(row.emailContent ?? '')

  const [commSentAt, setCommSentAt] = useState('')
  const [commChannel, setCommChannel] = useState<ContactChannel>('EMAIL')
  const [commSubject, setCommSubject] = useState('')

  const { data: communications, isLoading: commLoading } = useQuery({
    queryKey: ['admin', 'image-permissions', row.companyId, 'communications'],
    queryFn: () => authFetch<CommunicationRow[]>(`/admin/image-permissions/${row.companyId}/communications`),
  })

  const savePermission = useMutation({
    mutationFn: () =>
      authFetch(`/admin/image-permissions/${row.companyId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          grantedByName: grantedByName.trim() || undefined,
          grantedAt: grantedAt || undefined,
          conditions: conditions.split('\n').map((c) => c.trim()).filter(Boolean),
          emailContent: emailContent.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-permissions'] })
      onClose()
    },
  })

  const addCommunication = useMutation({
    mutationFn: () =>
      authFetch(`/admin/image-permissions/${row.companyId}/communications`, {
        method: 'POST',
        body: JSON.stringify({ sentAt: commSentAt, channel: commChannel, subject: commSubject }),
      }),
    onSuccess: () => {
      setCommSentAt('')
      setCommSubject('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-permissions', row.companyId, 'communications'] })
    },
  })

  const toggleResponded = useMutation({
    mutationFn: ({ id, responded }: { id: string; responded: boolean }) =>
      authFetch(`/admin/image-permissions/communications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ responded }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-permissions', row.companyId, 'communications'] })
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-lg my-8 shadow-2xl">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-stone-800">
          <BadgeCheck size={20} className="text-brand-400 shrink-0" />
          <h2 className="text-stone-100 font-semibold text-base">{row.companyName}</h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-stone-400 text-xs mb-1.5">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PermissionStatus)}
              className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-stone-400 text-xs mb-1.5">Contact at company</label>
              <input
                type="text"
                value={grantedByName}
                onChange={(e) => setGrantedByName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 text-sm placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
            <div>
              <label className="block text-stone-400 text-xs mb-1.5">Granted on</label>
              <input
                type="date"
                value={grantedAt}
                onChange={(e) => setGrantedAt(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-stone-400 text-xs mb-1.5">Conditions (one per line)</label>
            <textarea
              rows={3}
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder={'Photo credit required\nNo edited/altered use'}
              className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 text-sm placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>

          <div>
            <label className="block text-stone-400 text-xs mb-1.5">Permission email (full text, kept for reference)</label>
            <textarea
              rows={4}
              value={emailContent}
              onChange={(e) => setEmailContent(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 text-sm placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              disabled={savePermission.isPending}
              className="flex-1 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => savePermission.mutate()}
              disabled={savePermission.isPending}
              className="flex-1 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-stone-950 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {savePermission.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* Communication history */}
          <div className="pt-3 border-t border-stone-800 space-y-3">
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-stone-500" />
              <h3 className="text-stone-300 text-sm font-semibold">Communication history</h3>
            </div>

            {commLoading ? (
              <p className="text-stone-500 text-xs">Loading…</p>
            ) : !communications || communications.length === 0 ? (
              <p className="text-stone-500 text-xs">No communication logged yet.</p>
            ) : (
              <div className="rounded-xl border border-stone-800 divide-y divide-stone-800 overflow-hidden">
                {communications.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-xs bg-stone-950/40">
                    <span className="text-stone-500 shrink-0 w-24">{new Date(c.sentAt).toLocaleDateString()}</span>
                    <span className="text-stone-400 shrink-0 w-24">{c.channel.replace('_', ' ')}</span>
                    <span className="text-stone-300 flex-1 truncate">{c.subject}</span>
                    <label className="flex items-center gap-1.5 shrink-0 cursor-pointer text-stone-400">
                      <input
                        type="checkbox"
                        checked={c.responded}
                        onChange={(e) => toggleResponded.mutate({ id: c.id, responded: e.target.checked })}
                        className="accent-brand-400 w-3.5 h-3.5"
                      />
                      Responded
                    </label>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2 items-end">
              <div>
                <label className="block text-stone-500 text-[11px] mb-1">Sent on</label>
                <input
                  type="date"
                  value={commSentAt}
                  onChange={(e) => setCommSentAt(e.target.value)}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-2 py-1.5 text-stone-100 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              <div>
                <label className="block text-stone-500 text-[11px] mb-1">Channel</label>
                <select
                  value={commChannel}
                  onChange={(e) => setCommChannel(e.target.value as ContactChannel)}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-2 py-1.5 text-stone-100 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-stone-500 text-[11px] mb-1">Subject</label>
                <input
                  type="text"
                  value={commSubject}
                  onChange={(e) => setCommSubject(e.target.value)}
                  placeholder="Image permission request"
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-2 py-1.5 text-stone-100 text-xs placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              <button
                onClick={() => addCommunication.mutate()}
                disabled={!commSentAt || !commSubject.trim() || addCommunication.isPending}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={12} /> Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ImagePermissionsPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const preselectSlug = searchParams.get('company')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<PermissionRow | null>(null)
  const hasAutoOpened = useRef(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'image-permissions'],
    queryFn: () => authFetch<PermissionRow[]>('/admin/image-permissions'),
  })

  const rows = data ?? []

  // Deep link from the company edit form's "Manage →" link — opens once when the list loads.
  useEffect(() => {
    if (hasAutoOpened.current || !preselectSlug || rows.length === 0) return
    const match = rows.find((r) => r.companySlug === preselectSlug)
    if (match) {
      hasAutoOpened.current = true
      setEditing(match)
    }
  }, [preselectSlug, rows])

  if (user?.role !== 'ADMIN') {
    return (
      <div className="text-stone-400 py-12 text-center text-sm">
        This section is restricted to admins.
      </div>
    )
  }

  const filtered = search.trim()
    ? rows.filter((r) => r.companyName.toLowerCase().includes(search.trim().toLowerCase()))
    : rows

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-100">Image Permissions</h1>
        <p className="text-stone-400 text-sm mt-1">
          Track which publishers and subscription companies have granted permission to use their
          official promotional materials — status, contact, and communication history.
        </p>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by company name…"
        className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 text-sm placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />

      {isLoading ? (
        <div className="text-stone-400 text-sm py-6 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-stone-500 text-sm py-6 text-center">
          {search.trim() ? 'No companies match your search.' : 'No companies found.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-stone-800 divide-y divide-stone-800 overflow-hidden">
          {filtered.map((row) => (
            <div
              key={row.companyId}
              className="flex items-center gap-4 px-5 py-4 bg-stone-900 hover:bg-stone-800/60 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-stone-100 font-medium text-sm truncate">{row.companyName}</p>
                {row.grantedByName && (
                  <p className="text-stone-500 text-xs">
                    {row.grantedByName}
                    {row.grantedAt && ` · ${new Date(row.grantedAt).toLocaleDateString()}`}
                  </p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${STATUS_STYLES[row.status]}`}>
                {row.status}
              </span>
              <button
                onClick={() => setEditing(row)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-400 text-xs font-medium transition-colors shrink-0"
              >
                Manage
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <PermissionModal row={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
