'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiAdminUser, ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'
import FormModal from '@/components/admin/FormModal'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'

const ROLES = ['USER', 'MODERATOR', 'COMPANY_MANAGER', 'ADMIN'] as const

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'text-red-400 bg-red-400/10 border border-red-400/20',
  MODERATOR: 'text-blue-400 bg-blue-400/10 border border-blue-400/20',
  COMPANY_MANAGER: 'text-amber-400 bg-amber-400/10 border border-amber-400/20',
  USER: 'text-stone-400 bg-stone-800 border border-stone-700',
}

interface AssignRoleFormData {
  role: string
  managedCompanyId: string
}

function AssignRoleForm({
  user,
  onSubmit,
  submitting,
}: {
  user: ApiAdminUser
  onSubmit: (data: AssignRoleFormData) => void
  submitting: boolean
}) {
  const [form, setForm] = useState<AssignRoleFormData>({
    role: user.role,
    managedCompanyId: user.managedCompanyId ?? '',
  })

  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => authFetch<PaginatedResponse<ApiBookBoxCompany>>('/companies?pageSize=100'),
  })

  const companies = companiesData?.data ?? []

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <p className="text-stone-300 text-sm mb-1">
          User: <span className="font-semibold text-stone-100">{user.username}</span>
        </p>
        <p className="text-stone-500 text-xs">{user.email}</p>
      </div>

      <div>
        <label className={LABEL_CLASS}>Role</label>
        <select
          className={INPUT_CLASS}
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, managedCompanyId: '' }))}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {form.role === 'COMPANY_MANAGER' && (
        <div>
          <label className={LABEL_CLASS}>Managed Company</label>
          <select
            className={INPUT_CLASS}
            value={form.managedCompanyId}
            onChange={(e) => setForm((f) => ({ ...f, managedCompanyId: e.target.value }))}
            required
          >
            <option value="">— Select company —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || (form.role === 'COMPANY_MANAGER' && !form.managedCompanyId)}
        className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Saving…' : 'Save Role'}
      </button>
    </form>
  )
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editUser, setEditUser] = useState<ApiAdminUser | null>(null)
  const [deleteUser, setDeleteUser] = useState<ApiAdminUser | null>(null)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' })
      if (search) params.set('search', search)
      return authFetch<PaginatedResponse<ApiAdminUser>>(`/admin/users?${params}`)
    },
  })

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, role, managedCompanyId }: { userId: string; role: string; managedCompanyId?: string }) =>
      authFetch(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role, managedCompanyId: managedCompanyId || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setEditUser(null)
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) =>
      authFetch(`/admin/users/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setDeleteUser(null)
      setDeleteConfirmEmail('')
      setDeleteError('')
    },
    onError: () => {
      setDeleteError('Failed to delete user. Please try again.')
    },
  })

  const handleDeleteConfirm = () => {
    if (!deleteUser) return
    if (deleteConfirmEmail.trim().toLowerCase() !== deleteUser.email.toLowerCase()) {
      setDeleteError('Email does not match. Please enter the exact email address.')
      return
    }
    deleteUserMutation.mutate(deleteUser.id)
  }

  const users = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Users</h1>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 w-full max-w-xs"
          placeholder="Search by username or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <>
          <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left px-4 py-3 text-stone-400 font-medium">Username</th>
                  <th className="text-left px-4 py-3 text-stone-400 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-stone-400 font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-stone-400 font-medium">Managed Company</th>
                  <th className="text-left px-4 py-3 text-stone-400 font-medium">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-stone-500 py-8">
                      No users found
                    </td>
                  </tr>
                )}
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                    <td className="px-4 py-3 text-stone-200 font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-stone-400 text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] ?? ROLE_COLORS.USER}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-400 text-xs">
                      {u.managedCompany ? (
                        <span className="text-amber-400">{u.managedCompany.name}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditUser(u)}
                          className="text-xs px-3 py-1 rounded-lg border border-stone-700 text-stone-300 hover:border-amber-500 hover:text-amber-400 transition-colors"
                        >
                          Assign Role
                        </button>
                        <button
                          onClick={() => { setDeleteUser(u); setDeleteConfirmEmail(''); setDeleteError('') }}
                          className="text-xs px-3 py-1 rounded-lg border border-red-900 text-red-400 hover:border-red-500 hover:bg-red-950/40 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded border border-stone-700 text-stone-400 disabled:opacity-40 hover:border-amber-500 hover:text-amber-400 transition-colors text-sm"
              >
                Prev
              </button>
              <span className="text-stone-500 text-sm">
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded border border-stone-700 text-stone-400 disabled:opacity-40 hover:border-amber-500 hover:text-amber-400 transition-colors text-sm"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      <FormModal open={editUser !== null} title="Assign Role" onClose={() => setEditUser(null)}>
        {editUser && (
          <AssignRoleForm
            user={editUser}
            submitting={assignRoleMutation.isPending}
            onSubmit={({ role, managedCompanyId }) =>
              assignRoleMutation.mutate({ userId: editUser.id, role, managedCompanyId })
            }
          />
        )}
      </FormModal>

      {/* Delete user confirmation modal */}
      <FormModal
        open={deleteUser !== null}
        title="Delete User"
        onClose={() => { setDeleteUser(null); setDeleteConfirmEmail(''); setDeleteError('') }}
      >
        {deleteUser && (
          <div className="flex flex-col gap-4">
            <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-3">
              <p className="text-red-400 text-sm font-semibold mb-1">⚠ This action is irreversible</p>
              <p className="text-stone-400 text-xs">
                Deleting <span className="text-stone-200 font-medium">{deleteUser.username}</span> will permanently remove
                all their data: collection, subscriptions, reviews, fees, and all other records.
              </p>
            </div>

            <div>
              <label className={LABEL_CLASS}>
                Type the user&apos;s email address to confirm:
                <span className="text-stone-200 ml-1">{deleteUser.email}</span>
              </label>
              <input
                className={INPUT_CLASS}
                type="email"
                placeholder={deleteUser.email}
                value={deleteConfirmEmail}
                onChange={(e) => { setDeleteConfirmEmail(e.target.value); setDeleteError('') }}
                autoComplete="off"
              />
            </div>

            {deleteError && (
              <p className="text-red-400 text-xs">{deleteError}</p>
            )}

            <button
              onClick={handleDeleteConfirm}
              disabled={deleteUserMutation.isPending || !deleteConfirmEmail}
              className="bg-red-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {deleteUserMutation.isPending ? 'Deleting…' : 'Delete User and All Data'}
            </button>
          </div>
        )}
      </FormModal>
    </div>
  )
}
