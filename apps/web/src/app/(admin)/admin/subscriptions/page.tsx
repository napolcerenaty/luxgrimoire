'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import Link from 'next/link'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import type { ApiSubscription, ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import ImageUpload from '@/components/admin/ImageUpload'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'
const SELECT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'

const LANGUAGES = ['EN', 'PL', 'FR', 'DE', 'ES', 'IT', 'PT', 'NL', 'CS', 'HU', 'RO', 'UK', 'JA', 'KO', 'ZH']

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubFormData {
  companyId: string
  name: string
  description: string
  genres: string[]
  currency: string
  coverImage: string
  price: string
  language: string
  type: string
  contentType: string
  bookishMerch: boolean
  renewalDayUserSet: boolean
  renewalDay: string
  startingMonth: string
  isCombo: boolean
  parentSubscriptionId: string
  copyFromSlug: string
  componentIds: string[]
  isDiscontinued: boolean
  isHidden: boolean
  paymentOnStartup: boolean
  startDate: string
  endDate: string
  // Skip policy (saved separately via PUT /skip-policy/:slug)
  skipPolicyType: string
  skipMaxSkips: string
  skipMaxConsecutive: string
  skipWindowMonths: string
  skipDeadlineDaysBefore: string
  skipNotes: string
  skipHow: string
}

const EMPTY_FORM: SubFormData = {
  companyId: '',
  name: '',
  description: '',
  genres: [],
  currency: 'EUR',
  coverImage: '',
  price: '',
  language: '',
  type: '',
  contentType: 'MIX',
  bookishMerch: false,
  renewalDayUserSet: false,
  renewalDay: '',
  startingMonth: '',
  isCombo: false,
  parentSubscriptionId: '',
  copyFromSlug: '',
  componentIds: [],
  isDiscontinued: false,
  isHidden: false,
  paymentOnStartup: false,
  startDate: '',
  endDate: '',
  skipPolicyType: 'NONE',
  skipMaxSkips: '',
  skipMaxConsecutive: '',
  skipWindowMonths: '',
  skipDeadlineDaysBefore: '0',
  skipNotes: '',
  skipHow: '',
}

function subToForm(sub: ApiSubscription): SubFormData {
  const p = sub.skipPolicy
  return {
    companyId: sub.companyId,
    name: sub.name,
    description: sub.description ?? '',
    genres: sub.genres ?? [],
    currency: sub.currency ?? 'EUR',
    coverImage: sub.coverImage ?? '',
    price: sub.price ?? '',
    language: sub.language ?? '',
    type: sub.type ?? '',
    contentType: sub.contentType ?? 'MIX',
    bookishMerch: sub.bookishMerch ?? false,
    renewalDayUserSet: sub.renewalDayUserSet ?? false,
    renewalDay: sub.renewalDay != null ? String(sub.renewalDay) : '',
    startingMonth: sub.startingMonth != null ? String(sub.startingMonth) : '',
    isCombo: sub.isCombo ?? false,
    parentSubscriptionId: sub.parentSubscriptionId ?? '',
    copyFromSlug: '',
    componentIds: (sub as any).componentIds ?? [],
    isDiscontinued: sub.isDiscontinued,
    isHidden: sub.isHidden ?? false,
    paymentOnStartup: (sub as any).paymentOnStartup ?? false,
    startDate: sub.startDate ? sub.startDate.slice(0, 10) : '',
    endDate: sub.endDate ? sub.endDate.slice(0, 10) : '',
    skipPolicyType: p?.type ?? 'NONE',
    skipMaxSkips: p?.maxSkips != null ? String(p.maxSkips) : '',
    skipMaxConsecutive: p?.maxConsecutive != null ? String(p.maxConsecutive) : '',
    skipWindowMonths: p?.windowMonths != null ? String(p.windowMonths) : '',
    skipDeadlineDaysBefore: p?.skipDeadlineDaysBefore != null ? String(p.skipDeadlineDaysBefore) : '0',
    skipNotes: p?.notes ?? '',
    skipHow: (p as any)?.skipHow ?? '',
  }
}

function formToCreatePayload(form: SubFormData) {
  return {
    companyId: form.companyId,
    name: form.name,
    description: form.description || undefined,
    genres: form.genres.length > 0 ? form.genres : undefined,
    currency: form.currency || 'EUR',
    coverImage: form.coverImage || undefined,
    price: form.price || undefined,
    language: form.language || undefined,
    type: form.type || undefined,
    contentType: form.contentType || 'MIX',
    bookishMerch: form.bookishMerch,
    renewalDayUserSet: form.renewalDayUserSet,
    renewalDay: form.renewalDay ? parseInt(form.renewalDay, 10) : undefined,
    startingMonth: form.startingMonth ? parseInt(form.startingMonth, 10) : undefined,
    isCombo: form.isCombo,
    parentSubscriptionId: form.parentSubscriptionId || undefined,
    copyFromSlug: form.copyFromSlug || undefined,
    componentIds: form.componentIds.length > 0 ? form.componentIds : undefined,
    isDiscontinued: form.isDiscontinued,
    isHidden: form.isHidden,
    paymentOnStartup: form.paymentOnStartup,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
  }
}

function formToUpdatePayload(form: SubFormData) {
  return {
    name: form.name,
    description: form.description || undefined,
    genres: form.genres,
    currency: form.currency || 'EUR',
    coverImage: form.coverImage || undefined,
    price: form.price || undefined,
    language: form.language || undefined,
    type: form.type || undefined,
    contentType: form.contentType || 'MIX',
    bookishMerch: form.bookishMerch,
    renewalDayUserSet: form.renewalDayUserSet,
    renewalDay: form.renewalDay ? parseInt(form.renewalDay, 10) : undefined,
    startingMonth: form.startingMonth ? parseInt(form.startingMonth, 10) : undefined,
    isCombo: form.isCombo,
    parentSubscriptionId: form.parentSubscriptionId || undefined,
    componentIds: form.componentIds,
    isDiscontinued: form.isDiscontinued,
    isHidden: form.isHidden,
    paymentOnStartup: form.paymentOnStartup,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
  }
}

// ─── Form component ───────────────────────────────────────────────────────────

interface SubFormProps {
  initial: SubFormData
  onSubmit: (data: SubFormData) => void
  submitting: boolean
  submitLabel: string
  companies: ApiBookBoxCompany[]
  allSubscriptions: ApiSubscription[]
  user: { role: string; managedCompanyId?: string | null } | null
}

function SubscriptionForm({
  initial,
  onSubmit,
  submitting,
  submitLabel,
  companies,
  allSubscriptions,
  user,
}: SubFormProps) {
  const isManager = user?.role === 'COMPANY_MANAGER'

  const [form, setForm] = useState<SubFormData>(() => {
    if (isManager && user?.managedCompanyId && !initial.companyId) {
      return { ...initial, companyId: user.managedCompanyId }
    }
    return initial
  })

  const setField = <K extends keyof SubFormData>(field: K, value: SubFormData[K]) =>
    setForm((f) => ({ ...f, [field]: value }))

  const setStr = (field: keyof SubFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setField(field, e.target.value as SubFormData[typeof field])

  // Unique genres from all subscriptions (across genres arrays)
  const genreOptions = Array.from(
    new Set(allSubscriptions.flatMap((s) => s.genres ?? []).filter(Boolean)),
  ).sort()

  // Component subscription helpers
  const addComponent = (id: string) => {
    if (id && !form.componentIds.includes(id)) {
      setField('componentIds', [...form.componentIds, id])
    }
  }
  const removeComponent = (id: string) =>
    setField('componentIds', form.componentIds.filter((c) => c !== id))

  const availableComponents = allSubscriptions.filter(
    (s) => !form.componentIds.includes(s.id),
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
      className="flex flex-col gap-4"
    >
      {/* Company */}
      <div>
        <label className={LABEL_CLASS}>Company *</label>
        <select
          required
          disabled={isManager}
          className={`${SELECT_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`}
          value={form.companyId}
          onChange={setStr('companyId')}
        >
          <option value="">— Select company —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Name */}
      <div>
        <label className={LABEL_CLASS}>Name *</label>
        <input
          required
          className={INPUT_CLASS}
          value={form.name}
          onChange={setStr('name')}
        />
      </div>

      {/* Description */}
      <div>
        <label className={LABEL_CLASS}>Description</label>
        <textarea
          rows={3}
          className={INPUT_CLASS}
          value={form.description}
          onChange={setStr('description')}
        />
      </div>

      {/* Genres (multi-tag) | Start Date | End Date */}
      <div className="flex flex-col gap-2">
        <label className={LABEL_CLASS}>Genres</label>
        <div className="flex flex-wrap gap-1 mb-1">
          {form.genres.map((g) => (
            <span key={g} className="flex items-center gap-1 bg-stone-700 text-stone-200 text-xs px-2 py-0.5 rounded-full">
              {g}
              <button type="button" onClick={() => setField('genres', form.genres.filter((x) => x !== g))} className="text-stone-400 hover:text-red-400 leading-none">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            list="genres-datalist"
            className={INPUT_CLASS + ' flex-1'}
            placeholder="Add genre (Enter or comma)"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                const val = e.currentTarget.value.trim()
                if (val && !form.genres.includes(val)) setField('genres', [...form.genres, val])
                e.currentTarget.value = ''
              }
            }}
            onBlur={(e) => {
              const val = e.target.value.trim()
              if (val && !form.genres.includes(val)) setField('genres', [...form.genres, val])
              e.target.value = ''
            }}
          />
        </div>
        <datalist id="genres-datalist">
          {genreOptions.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>

      {/* Start Date | End Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLASS}>Start Date</label>
          <input
            type="date"
            className={INPUT_CLASS}
            value={form.startDate}
            onChange={setStr('startDate')}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>End Date</label>
          <input
            type="date"
            className={INPUT_CLASS}
            value={form.endDate}
            onChange={setStr('endDate')}
          />
        </div>
      </div>

      {/* Price | Currency | Language | Type */}
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className={LABEL_CLASS}>Price</label>
          <input
            className={INPUT_CLASS}
            value={form.price}
            onChange={setStr('price')}
            placeholder="59.99"
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Currency</label>
          <input
            list="currency-datalist"
            className={INPUT_CLASS}
            value={form.currency}
            onChange={setStr('currency')}
            placeholder="EUR"
          />
          <datalist id="currency-datalist">
            {['EUR', 'USD', 'GBP', 'PLN', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF'].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={LABEL_CLASS}>Language</label>
          <input
            list="language-datalist"
            className={INPUT_CLASS}
            value={form.language}
            onChange={setStr('language')}
            placeholder="EN"
          />
          <datalist id="language-datalist">
            {LANGUAGES.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={LABEL_CLASS}>Type</label>
          <select className={SELECT_CLASS} value={form.type} onChange={setStr('type')}>
            <option value="">— Select type —</option>
            <option value="MONTHLY">Monthly</option>
            <option value="BIMONTHLY">Bi-monthly (every 2 months)</option>
            <option value="QUARTERLY">Quarterly (every 3 months)</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>Content Type</label>
          <select className={SELECT_CLASS} value={form.contentType} onChange={setStr('contentType')}>
            <option value="MIX">Mix (months + series)</option>
            <option value="MONTH">Monthly boxes only</option>
            <option value="SERIES">Series only</option>
          </select>
        </div>
      </div>

      {/* Renewal Settings */}
      <div className="border border-stone-700 rounded-lg p-3 flex flex-col gap-3">
        <p className="text-sm text-stone-400 font-semibold">Renewal Settings</p>
        <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.renewalDayUserSet}
            onChange={(e) => setField('renewalDayUserSet', e.target.checked)}
            className="accent-amber-400 w-4 h-4"
          />
          Use subscriber's sign-up day as renewal day
        </label>
        {!form.renewalDayUserSet && (
          <div className="w-40">
            <label className={LABEL_CLASS}>Fixed renewal day (1–28)</label>
            <input
              type="number"
              min={1}
              max={28}
              className={INPUT_CLASS}
              value={form.renewalDay}
              onChange={setStr('renewalDay')}
              placeholder="e.g. 15"
            />
          </div>
        )}
        {(form.type === 'BIMONTHLY' || form.type === 'QUARTERLY') && (
          <div className="w-48">
            <label className={LABEL_CLASS}>Starting month of cycle</label>
            <select className={SELECT_CLASS} value={form.startingMonth} onChange={setStr('startingMonth')}>
              <option value="">— Select month —</option>
              {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Cover Image */}
      <ImageUpload
        label="Cover Image"
        folder="luxgrimoire/subscriptions"
        value={form.coverImage}
        onChange={(id) => setField('coverImage', id)}
        aspectRatio="2/3"
      />

      {/* Bookish Merch */}
      <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.bookishMerch}
          onChange={(e) => setField('bookishMerch', e.target.checked)}
          className="accent-amber-400 w-4 h-4"
        />
        Bookish Merch included
      </label>

      {/* Variant of (parentSubscriptionId) */}
      <div>
        <label className={LABEL_CLASS}>Variant of</label>
        <select
          className={SELECT_CLASS}
          value={form.parentSubscriptionId}
          onChange={setStr('parentSubscriptionId')}
        >
          <option value="">— None —</option>
          {allSubscriptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.slug})
            </option>
          ))}
        </select>
      </div>

      {/* Copy months from (copyFromSlug) */}
      <div>
        <label className={LABEL_CLASS}>Copy months from</label>
        <select
          className={SELECT_CLASS}
          value={form.copyFromSlug}
          onChange={setStr('copyFromSlug')}
        >
          <option value="">— None —</option>
          {allSubscriptions.map((s) => (
            <option key={s.id} value={s.slug}>
              {s.name} ({s.slug})
            </option>
          ))}
        </select>
        <p className="text-xs text-stone-500 mt-1">
          Copies all months and books from the selected subscription
        </p>
      </div>

      {/* isCombo + component picker */}
      <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.isCombo}
          onChange={(e) => setField('isCombo', e.target.checked)}
          className="accent-amber-400 w-4 h-4"
        />
        Combo / Bundle subscription
      </label>

      {form.isCombo && (
        <div className="border border-stone-700 rounded-lg p-3 flex flex-col gap-2">
          <label className={LABEL_CLASS}>Component subscriptions</label>

          {/* Selected tags */}
          {form.componentIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.componentIds.map((id) => {
                const sub = allSubscriptions.find((s) => s.id === id)
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1 bg-stone-700 text-stone-200 text-xs px-2 py-1 rounded-full"
                  >
                    {sub ? sub.name : id}
                    <button
                      type="button"
                      onClick={() => removeComponent(id)}
                      className="text-stone-400 hover:text-red-400 leading-none"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {/* Add component dropdown */}
          <select
            className={SELECT_CLASS}
            value=""
            onChange={(e) => {
              addComponent(e.target.value)
              e.target.value = ''
            }}
          >
            <option value="">+ Add component…</option>
            {availableComponents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.slug})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Discontinued */}
      <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.isDiscontinued}
          onChange={(e) => setField('isDiscontinued', e.target.checked)}
          className="accent-amber-400 w-4 h-4"
        />
        Discontinued
      </label>

      {/* Hidden */}
      <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.isHidden}
          onChange={(e) => setField('isHidden', e.target.checked)}
          className="accent-amber-400 w-4 h-4"
        />
        Hidden (not visible on public pages — for drafts/historical data)
      </label>

      {/* Payment on startup */}
      <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.paymentOnStartup}
          onChange={(e) => setField('paymentOnStartup', e.target.checked)}
          className="accent-amber-400 w-4 h-4"
        />
        Payment on signup (first box charged immediately at signup, not on renewal day)
      </label>

      {/* ── Skip Policy ──────────────────────────────────────────── */}
      <div className="border border-stone-700 rounded-lg p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-amber-400">Skip Policy</p>

        <div>
          <label className={LABEL_CLASS}>Policy type</label>
          <select
            className={SELECT_CLASS}
            value={form.skipPolicyType}
            onChange={setStr('skipPolicyType')}
          >
            <option value="NONE">No skips allowed</option>
            <option value="UNLIMITED">Unlimited skips</option>
            <option value="UNLIMITED_MAX_CONSEC">Unlimited (max consecutive)</option>
            <option value="CALENDAR_YEAR">X skips per calendar year</option>
            <option value="FROM_FIRST_SKIP">X skips from first skip date</option>
            <option value="FROM_SUB_START">X skips from user's subscription start</option>
          </select>
        </div>

        {form.skipPolicyType !== 'NONE' && form.skipPolicyType !== 'UNLIMITED' && (
          <div className="grid grid-cols-3 gap-3">
            {form.skipPolicyType !== 'UNLIMITED_MAX_CONSEC' && (
              <div>
                <label className={LABEL_CLASS}>Max skips</label>
                <input
                  type="number"
                  min={1}
                  className={INPUT_CLASS}
                  value={form.skipMaxSkips}
                  onChange={setStr('skipMaxSkips')}
                  placeholder="e.g. 2"
                />
              </div>
            )}

            {form.skipPolicyType === 'UNLIMITED_MAX_CONSEC' && (
              <div>
                <label className={LABEL_CLASS}>Max consecutive</label>
                <input
                  type="number"
                  min={1}
                  className={INPUT_CLASS}
                  value={form.skipMaxConsecutive}
                  onChange={setStr('skipMaxConsecutive')}
                  placeholder="e.g. 3"
                />
              </div>
            )}

            {(form.skipPolicyType === 'FROM_FIRST_SKIP' ||
              form.skipPolicyType === 'FROM_SUB_START') && (
              <div>
                <label className={LABEL_CLASS}>Window (months)</label>
                <input
                  type="number"
                  min={1}
                  className={INPUT_CLASS}
                  value={form.skipWindowMonths}
                  onChange={setStr('skipWindowMonths')}
                  placeholder="e.g. 12"
                />
              </div>
            )}
          </div>
        )}

        <div>
          <label className={LABEL_CLASS}>Policy notes (shown to users)</label>
          <textarea
            rows={2}
            className={INPUT_CLASS}
            value={form.skipNotes}
            onChange={setStr('skipNotes')}
            placeholder="e.g. You can skip up to 2 boxes per calendar year without losing your spot."
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>How to submit a skip request (shown to users)</label>
          <textarea
            rows={2}
            className={INPUT_CLASS}
            value={form.skipHow}
            onChange={setStr('skipHow')}
            placeholder="e.g. Email support@example.com with subject 'Skip [Month Year]' before the deadline."
          />
        </div>

        {form.skipPolicyType !== 'NONE' && (
          <div>
            <label className={LABEL_CLASS}>
              Skip deadline — days before renewal (0 = day of renewal, default)
            </label>
            <input
              type="number"
              min={0}
              max={60}
              className={INPUT_CLASS}
              value={form.skipDeadlineDaysBefore}
              onChange={setStr('skipDeadlineDaysBefore')}
              placeholder="0"
            />
            <p className="text-xs text-stone-500 mt-1">
              e.g. 3 → skip window closes 3 days before the renewal date. Requires renewal day to be set on the subscription.
            </p>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSubscriptionsPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [editSub, setEditSub] = useState<ApiSubscription | null>(null)
  const [deleteSub, setDeleteSub] = useState<ApiSubscription | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15

  const isManager = user?.role === 'COMPANY_MANAGER'
  const managerCompanyId = user?.managedCompanyId

  const { data: subsData, isLoading: subsLoading } = useQuery({
    queryKey: ['admin', 'subscriptions', page, isManager ? managerCompanyId : null],
    queryFn: () => {
      const companyFilter = isManager && managerCompanyId ? `&companyId=${managerCompanyId}` : ''
      return authFetch<PaginatedResponse<ApiSubscription>>(`/subscriptions?page=${page}&pageSize=${PAGE_SIZE}&includeHidden=true${companyFilter}`)
    },
    enabled: user !== null,
    placeholderData: keepPreviousData,
  })

  const { data: companiesData } = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiBookBoxCompany> | ApiBookBoxCompany[]>(
        '/companies?page=1&pageSize=100',
      ),
  })

  const subs = subsData?.data ?? []
  const companies = Array.isArray(companiesData)
    ? companiesData
    : (companiesData as PaginatedResponse<ApiBookBoxCompany> | undefined)?.data ?? []

  const createMutation = useMutation({
    mutationFn: async (form: SubFormData) => {
      const sub = await authFetch<ApiSubscription>('/subscriptions', {
        method: 'POST',
        body: JSON.stringify(formToCreatePayload(form)),
      })
      if (form.skipPolicyType && form.skipPolicyType !== 'NONE') {
        await authFetch(`/skip-policy/${sub.slug}`, {
          method: 'PUT',
          body: JSON.stringify({
            type: form.skipPolicyType,
            maxSkips: form.skipMaxSkips ? parseInt(form.skipMaxSkips, 10) : undefined,
            maxConsecutive: form.skipMaxConsecutive ? parseInt(form.skipMaxConsecutive, 10) : undefined,
            windowMonths: form.skipWindowMonths ? parseInt(form.skipWindowMonths, 10) : undefined,
            skipDeadlineDaysBefore: parseInt(form.skipDeadlineDaysBefore || '0', 10),
            notes: form.skipNotes || undefined,
            skipHow: form.skipHow || undefined,
          }),
        })
      }
      return sub
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      setCreateOpen(false)
    },
    onError: (err: Error) => alert(`Błąd tworzenia subskrypcji: ${err.message}`),
  })

  const editMutation = useMutation({
    mutationFn: async ({ slug, form }: { slug: string; form: SubFormData }) => {
      const sub = await authFetch<ApiSubscription>(`/subscriptions/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify(formToUpdatePayload(form)),
      })
      await authFetch(`/skip-policy/${slug}`, {
        method: 'PUT',
        body: JSON.stringify({
          type: form.skipPolicyType || 'NONE',
          maxSkips: form.skipMaxSkips ? parseInt(form.skipMaxSkips, 10) : undefined,
          maxConsecutive: form.skipMaxConsecutive ? parseInt(form.skipMaxConsecutive, 10) : undefined,
          windowMonths: form.skipWindowMonths ? parseInt(form.skipWindowMonths, 10) : undefined,
          skipDeadlineDaysBefore: parseInt(form.skipDeadlineDaysBefore || '0', 10),
          notes: form.skipNotes || undefined,
          skipHow: form.skipHow || undefined,
        }),
      })
      return sub
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      setEditSub(null)
    },
    onError: (err: Error) => alert(`Błąd edycji subskrypcji: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/subscriptions/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      setDeleteSub(null)
    },
    onError: (err: Error) => alert(`Błąd usuwania: ${err.message}`),
  })

  const commonFormProps = { companies, allSubscriptions: subs, user }

  const columns = [
    { key: 'name', label: 'Name', render: (row: ApiSubscription) => row.name },
    {
      key: 'company',
      label: 'Company',
      render: (row: ApiSubscription) => row.company?.name ?? row.companyId,
    },
    {
      key: 'genres',
      label: 'Genres',
      render: (row: ApiSubscription) =>
        row.genres?.length ? row.genres.join(', ') : (row.genre ?? '—'),
    },
    {
      key: 'merch',
      label: 'Merch',
      render: (row: ApiSubscription) =>
        row.bookishMerch ? (
          <span className="text-amber-400 text-xs font-medium">✓ Merch</span>
        ) : null,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row: ApiSubscription) =>
        row.isHidden ? (
          <span className="text-stone-500 text-xs font-medium">Hidden</span>
        ) : row.isDiscontinued ? (
          <span className="text-red-400 text-xs font-medium">Discontinued</span>
        ) : (
          <span className="text-emerald-400 text-xs font-medium">Active</span>
        ),
    },
    {
      key: 'months',
      label: 'Months',
      render: (row: ApiSubscription) => row.months?.length ?? '—',
    },
    {
      key: 'manage',
      label: 'Manage',
      render: (row: ApiSubscription) => (
        <>
          {row.contentType !== 'SERIES' && (
            <Link
              href={`/admin/subscriptions/${row.slug}/months`}
              className="text-amber-400 text-xs hover:underline"
            >
              View Months →
            </Link>
          )}
          {row.contentType !== 'MONTH' && (
            <Link
              href={`/admin/subscriptions/${row.slug}/series`}
              className="text-purple-400 text-xs hover:underline ml-3"
            >
              Series →
            </Link>
          )}
        </>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Subscriptions</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
        >
          Add Subscription
        </button>
      </div>

      {subsLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={subs}
            onEdit={(row) => setEditSub(row)}
            onDelete={isManager ? undefined : (row) => setDeleteSub(row)}
          />
          {(subsData?.totalPages ?? 1) > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-stone-400">
              <span>Page {page} of {subsData?.totalPages ?? 1} ({subsData?.total ?? 0} total)</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(subsData?.totalPages ?? 1, p + 1))}
                  disabled={page >= (subsData?.totalPages ?? 1)}
                  className="px-3 py-1.5 rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <FormModal open={createOpen} title="Add Subscription" onClose={() => setCreateOpen(false)}>
        <SubscriptionForm
          {...commonFormProps}
          initial={EMPTY_FORM}
          submitLabel="Create Subscription"
          submitting={createMutation.isPending}
          onSubmit={(form) => createMutation.mutate(form)}
        />
      </FormModal>

      <FormModal
        open={editSub !== null}
        title="Edit Subscription"
        onClose={() => setEditSub(null)}
      >
        {editSub && (
          <SubscriptionForm
            {...commonFormProps}
            initial={subToForm(editSub)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={(form) =>
              editMutation.mutate({ slug: editSub.slug, form })
            }
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteSub !== null}
        message={`Delete subscription "${deleteSub?.name}"? This cannot be undone.`}
        onConfirm={() => deleteSub && deleteMutation.mutate(deleteSub.slug)}
        onCancel={() => setDeleteSub(null)}
      />
    </div>
  )
}
