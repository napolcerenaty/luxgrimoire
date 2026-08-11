'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import type { ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'
import { Trash2, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface PurgeResult {
  deletedEditionImages: number
  deletedMonthImages: number
  deletedAnnouncementImages: number
  errors: string[]
}

// ── Purge Confirm Modal ──────────────────────────────────────────────────────

function PurgeModal({
  company,
  onClose,
}: {
  company: ApiBookBoxCompany
  onClose: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PurgeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const confirmed = confirmText.trim().toLowerCase() === company.name.trim().toLowerCase()

  const handlePurge = async () => {
    if (!confirmed) return
    setLoading(true)
    setError(null)
    try {
      const data = await authFetch<PurgeResult>(`/companies/${company.slug}/purge-official-images`, {
        method: 'POST',
      })
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-stone-800">
          <AlertTriangle size={20} className="text-red-400 shrink-0" />
          <h2 className="text-stone-100 font-semibold text-base">Purge Official Images</h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          {result ? (
            /* ── Success state ── */
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 size={18} />
                <span className="font-medium text-sm">Purge complete</span>
              </div>
              <div className="bg-stone-800 rounded-xl px-4 py-3 text-sm space-y-1">
                <p className="text-stone-300">
                  Edition images deleted: <span className="text-brand-400 font-medium">{result.deletedEditionImages}</span>
                </p>
                <p className="text-stone-300">
                  Subscription month images deleted: <span className="text-brand-400 font-medium">{result.deletedMonthImages}</span>
                </p>
                <p className="text-stone-300">
                  Sale announcement images deleted: <span className="text-brand-400 font-medium">{result.deletedAnnouncementImages}</span>
                </p>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-red-950/40 border border-red-700/40 rounded-xl px-4 py-3">
                  <p className="text-red-400 text-xs font-semibold mb-2">
                    {result.errors.length} error(s) during purge:
                  </p>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-red-300 text-xs font-mono break-all">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                onClick={onClose}
                className="w-full mt-2 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            /* ── Confirm state ── */
            <>
              <div className="bg-red-950/30 border border-red-700/30 rounded-xl px-4 py-3 text-sm text-red-300">
                This will permanently delete all official images for{' '}
                <span className="font-semibold text-red-200">{company.name}</span> from Cloudinary and the database.
                This includes edition images, subscription month covers, and sale announcement images.
                <br />
                <span className="font-semibold mt-1 block text-red-200">Community images will not be affected.</span>
                <span className="font-semibold text-red-200">This action cannot be undone.</span>
              </div>

              <div>
                <label className="block text-stone-400 text-xs mb-1.5">
                  Type the company name to confirm:{' '}
                  <span className="text-stone-200 font-medium">{company.name}</span>
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={company.name}
                  className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 text-sm placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs bg-red-950/30 border border-red-700/30 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePurge}
                  disabled={!confirmed || loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Purging…
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      Purge Images
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyImagePurgePage() {
  const { user } = useAuth()
  const [purgeTarget, setPurgeTarget] = useState<ApiBookBoxCompany | null>(null)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['companies-purge-list'],
    queryFn: () => authFetch<PaginatedResponse<ApiBookBoxCompany> | ApiBookBoxCompany[]>('/companies?page=1&pageSize=100'),
  })

  if (user?.role !== 'ADMIN') {
    return (
      <div className="text-stone-400 py-12 text-center text-sm">
        This section is restricted to admins.
      </div>
    )
  }

  const allCompanies = data ? (Array.isArray(data) ? data : data.data) : []
  const companies = search.trim()
    ? allCompanies.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : allCompanies

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-100">Image Purge</h1>
        <p className="text-stone-400 text-sm mt-1">
          Permanently remove all official images for a company from Cloudinary and the database.
          Use this when a company revokes image rights.
        </p>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 bg-red-950/30 border border-red-700/30 rounded-2xl px-5 py-4">
        <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
        <div className="text-sm text-red-300 space-y-1">
          <p className="font-semibold text-red-200">This action is irreversible.</p>
          <p>
            Purging removes edition additional images, subscription month cover images, and sale
            announcement images from Cloudinary and clears them from the database.
            Photo credits are also removed. Community images are not affected.
          </p>
        </div>
      </div>

      {/* Company list */}
      <div className="space-y-2">
        <h2 className="text-stone-300 text-sm font-semibold uppercase tracking-widest px-1">
          Companies
        </h2>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company name…"
          className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 text-sm placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />

        {isLoading ? (
          <div className="text-stone-400 text-sm py-6 text-center">Loading…</div>
        ) : companies.length === 0 ? (
          <div className="text-stone-500 text-sm py-6 text-center">
            {search.trim() ? 'No companies match your search.' : 'No companies found.'}
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-800 divide-y divide-stone-800 overflow-hidden">
            {companies.map((company) => (
              <div
                key={company.slug}
                className="flex items-center gap-4 px-5 py-4 bg-stone-900 hover:bg-stone-800/60 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-stone-100 font-medium text-sm truncate">{company.name}</p>
                  <p className="text-stone-500 text-xs">{company.slug}</p>
                </div>
                <button
                  onClick={() => setPurgeTarget(company)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-700/40 text-red-400 hover:text-red-300 text-xs font-medium transition-colors shrink-0"
                >
                  <Trash2 size={13} />
                  Purge Images
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {purgeTarget && (
        <PurgeModal
          company={purgeTarget}
          onClose={() => setPurgeTarget(null)}
        />
      )}
    </div>
  )
}
