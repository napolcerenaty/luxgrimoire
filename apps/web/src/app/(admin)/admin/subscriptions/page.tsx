'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import Link from 'next/link'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import type { ApiSubscription, ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import ImageUpload from '@/components/admin/ImageUpload'

const INPUT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'
const LABEL_CLASS = 'block text-sm text-stone-400 mb-1'
const SELECT_CLASS =
  'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400'

const LANGUAGES = ['English', 'Polish', 'French', 'German', 'Spanish', 'Italian', 'Portuguese', 'Dutch', 'Czech', 'Hungarian', 'Romanian', 'Ukrainian', 'Japanese', 'Korean', 'Chinese']

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
  renewalMonthOffset: string
  startDate: string
  endDate: string
  // Skip policy (saved separately via PUT /skip-policy/:slug)
  skipPolicyType: string
  skipMaxSkips: string
  skipMaxConsecutive: string
  skipWindowMonths: string
  skipDeadlineDaysBefore: string
  skipDeadlineType: string
  skipDeadlineDayOfMonth: string
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
  contentType: 'MONTH',
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
  renewalMonthOffset: '0',
  startDate: '',
  endDate: '',
  skipPolicyType: 'NONE',
  skipMaxSkips: '',
  skipMaxConsecutive: '',
  skipWindowMonths: '',
  skipDeadlineDaysBefore: '0',
  skipDeadlineType: 'DAYS_BEFORE',
  skipDeadlineDayOfMonth: '',
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
    renewalMonthOffset: sub.renewalMonthOffset != null ? String(sub.renewalMonthOffset) : '0',
    startDate: sub.startDate ? sub.startDate.slice(0, 10) : '',
    endDate: sub.endDate ? sub.endDate.slice(0, 10) : '',
    skipPolicyType: p?.type ?? 'NONE',
    skipMaxSkips: p?.maxSkips != null ? String(p.maxSkips) : '',
    skipMaxConsecutive: p?.maxConsecutive != null ? String(p.maxConsecutive) : '',
    skipWindowMonths: p?.windowMonths != null ? String(p.windowMonths) : '',
    skipDeadlineDaysBefore: p?.skipDeadlineDaysBefore != null ? String(p.skipDeadlineDaysBefore) : '0',
    skipDeadlineType: (p as any)?.skipDeadlineType ?? 'DAYS_BEFORE',
    skipDeadlineDayOfMonth: (p as any)?.skipDeadlineDayOfMonth != null ? String((p as any).skipDeadlineDayOfMonth) : '',
    skipNotes: p?.notes ?? '',
    skipHow: (p as any)?.skipHow ?? '',
  }
}

// When user picks UNLIMITED + fills maxConsecutive, send UNLIMITED_MAX_CONSEC to API
function resolveSkipType(form: SubFormData): string {
  if (form.skipPolicyType === 'UNLIMITED' && form.skipMaxConsecutive) {
    return 'UNLIMITED_MAX_CONSEC'
  }
  return form.skipPolicyType
}

function formToCreatePayload(form: SubFormData) {
  return {
    companyId: form.companyId,
    name: form.name,
    description: form.description || undefined,
    genres: form.genres.length > 0 ? form.genres : undefined,
    currency: form.currency || 'EUR',
    coverImage: form.coverImage || undefined,
    price: form.price ? form.price.replace(',', '.') : undefined,
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
    renewalMonthOffset: form.renewalMonthOffset ? parseInt(form.renewalMonthOffset, 10) : 0,
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
    coverImage: form.coverImage === null ? null : (form.coverImage || undefined),
    price: form.price ? form.price.replace(',', '.') : undefined,
    language: form.language || undefined,
    type: form.type || undefined,
    contentType: form.contentType || 'MIX',
    bookishMerch: form.bookishMerch,
    renewalDayUserSet: form.renewalDayUserSet,
    renewalDay: form.renewalDay ? parseInt(form.renewalDay, 10) : undefined,
    startingMonth: form.startingMonth ? parseInt(form.startingMonth, 10) : undefined,
    isCombo: form.isCombo,
    componentIds: form.componentIds,
    isDiscontinued: form.isDiscontinued,
    isHidden: form.isHidden,
    paymentOnStartup: form.paymentOnStartup,
    renewalMonthOffset: form.renewalMonthOffset ? parseInt(form.renewalMonthOffset, 10) : 0,
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

  const genreOptions = Array.from(
    new Set(allSubscriptions.flatMap((s) => s.genres ?? []).filter(Boolean)),
  ).sort()

  const addComponent = (id: string) => {
    if (id && !form.componentIds.includes(id)) setField('componentIds', [...form.componentIds, id])
  }
  const removeComponent = (id: string) =>
    setField('componentIds', form.componentIds.filter((c) => c !== id))
  const availableComponents = allSubscriptions.filter((s) => !form.componentIds.includes(s.id))

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }} className="space-y-6">

      {/* ── 2-column main grid ── */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">

        {/* LEFT: identity */}
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Company *</label>
            <select required disabled={isManager}
              className={`${SELECT_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`}
              value={form.companyId} onChange={setStr('companyId')}>
              <option value="">— Select company —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Name *</label>
            <input required className={INPUT_CLASS} value={form.name} onChange={setStr('name')} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Description</label>
            <textarea rows={4} className={INPUT_CLASS} value={form.description} onChange={setStr('description')} />
          </div>
          <ImageUpload label="Cover Image" folder="luxgrimoire/subscriptions"
            value={form.coverImage ?? ''} onChange={(id) => setField('coverImage', id)}
            onClear={() => setField('coverImage', null as unknown as string)}
            aspectRatio="2/3" />
        </div>

        {/* RIGHT: settings */}
        <div className="space-y-4">
          {/* Price / Currency / Language */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL_CLASS}>Price</label>
              <input className={INPUT_CLASS} value={form.price} onChange={setStr('price')} placeholder="59.99" />
            </div>
            <div>
              <label className={LABEL_CLASS}>Currency</label>
              <select className={SELECT_CLASS} value={form.currency} onChange={setStr('currency')}>
                {['EUR','USD','GBP','PLN','CAD','AUD','CHF','SEK','NOK','DKK','CZK','HUF'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Language</label>
              <select className={INPUT_CLASS} value={form.language} onChange={setStr('language')}>
                <option value="">— select —</option>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Type / Content type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Type</label>
              <select className={SELECT_CLASS} value={form.type} onChange={setStr('type')}>
                <option value="">— Select type —</option>
                <option value="MONTHLY">Monthly</option>
                <option value="BIMONTHLY">Bi-monthly</option>
                <option value="QUARTERLY">Quarterly</option>
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

          {/* Start / End date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Start Date</label>
              <input type="date" className={INPUT_CLASS} value={form.startDate} onChange={setStr('startDate')} />
            </div>
            <div>
              <label className={LABEL_CLASS}>End Date</label>
              <input type="date" className={INPUT_CLASS} value={form.endDate} onChange={setStr('endDate')} />
            </div>
          </div>

          {/* Renewal settings */}
          <div className="border border-stone-700 rounded-lg p-3 space-y-3">
            <p className="text-xs text-stone-400 font-semibold uppercase tracking-wide">Renewal</p>
            <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
              <input type="checkbox" checked={form.renewalDayUserSet}
                onChange={(e) => setField('renewalDayUserSet', e.target.checked)}
                className="accent-amber-400 w-4 h-4" />
              Use subscriber's sign-up day
            </label>
            {!form.renewalDayUserSet && (
              <div>
                <label className={LABEL_CLASS}>Fixed renewal day (1–28)</label>
                <input type="number" min={1} max={28} className={INPUT_CLASS}
                  value={form.renewalDay} onChange={setStr('renewalDay')} placeholder="e.g. 15" />
              </div>
            )}
            <div>
              <label className={LABEL_CLASS}>Renewal month offset (0 = same month, 1 = charged 1 month before box)</label>
              <input type="number" min={0} max={11} className={INPUT_CLASS}
                value={form.renewalMonthOffset} onChange={setStr('renewalMonthOffset')} placeholder="0" />
            </div>
            {(form.type === 'BIMONTHLY' || form.type === 'QUARTERLY') && (
              <div>
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

          {/* Flags */}
          <div className="border border-stone-700 rounded-lg p-3 space-y-2">
            <p className="text-xs text-stone-400 font-semibold uppercase tracking-wide">Flags</p>
            {([
              { field: 'bookishMerch', label: 'Bookish Merch included' },
              { field: 'paymentOnStartup', label: 'Payment on signup (charged immediately)' },
              { field: 'isDiscontinued', label: 'Discontinued' },
              { field: 'isHidden', label: 'Hidden (draft / historical data)' },
            ] as { field: keyof SubFormData; label: string }[]).map(({ field, label }) => (
              <label key={field} className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer">
                <input type="checkbox" checked={form[field] as boolean}
                  onChange={(e) => setField(field, e.target.checked)}
                  className="accent-amber-400 w-4 h-4" />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── Full-width sections ── */}

      {/* Genres */}
      <div>
        <label className={LABEL_CLASS}>Genres</label>
        <div className="flex flex-wrap gap-1 mb-2">
          {form.genres.map((g) => (
            <span key={g} className="flex items-center gap-1 bg-stone-700 text-stone-200 text-xs px-2 py-0.5 rounded-full">
              {g}
              <button type="button" onClick={() => setField('genres', form.genres.filter((x) => x !== g))}
                className="text-stone-400 hover:text-red-400 leading-none">×</button>
            </span>
          ))}
        </div>
        <input list="genres-datalist" className={INPUT_CLASS}
          placeholder="Add genre — press Enter or comma"
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
          }} />
        <datalist id="genres-datalist">
          {genreOptions.map((g) => <option key={g} value={g} />)}
        </datalist>
      </div>

      {/* Variant of | Copy from */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className={LABEL_CLASS}>Variant of</label>
          <select className={SELECT_CLASS} value={form.parentSubscriptionId} onChange={setStr('parentSubscriptionId')}>
            <option value="">— None —</option>
            {(form.companyId ? allSubscriptions.filter((s) => s.companyId === form.companyId) : allSubscriptions)
              .map((s) => <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>Copy months from</label>
          <select className={SELECT_CLASS} value={form.copyFromSlug} onChange={setStr('copyFromSlug')}>
            <option value="">— None —</option>
            {(form.companyId ? allSubscriptions.filter((s) => s.companyId === form.companyId) : allSubscriptions)
              .map((s) => <option key={s.id} value={s.slug}>{s.name} ({s.slug})</option>)}
          </select>
          <p className="text-xs text-stone-500 mt-1">Copies all months and books from the selected subscription</p>
        </div>
      </div>

      {/* Combo / Bundle */}
      <div>
        <label className="flex items-center gap-2 text-stone-300 text-sm cursor-pointer mb-2">
          <input type="checkbox" checked={form.isCombo}
            onChange={(e) => setField('isCombo', e.target.checked)}
            className="accent-amber-400 w-4 h-4" />
          Combo / Bundle subscription
        </label>
        {form.isCombo && (
          <div className="border border-stone-700 rounded-lg p-3 space-y-2">
            <label className={LABEL_CLASS}>Component subscriptions</label>
            {form.componentIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.componentIds.map((id) => {
                  const sub = allSubscriptions.find((s) => s.id === id)
                  return (
                    <span key={id} className="flex items-center gap-1 bg-stone-700 text-stone-200 text-xs px-2 py-1 rounded-full">
                      {sub ? sub.name : id}
                      <button type="button" onClick={() => removeComponent(id)}
                        className="text-stone-400 hover:text-red-400 leading-none" aria-label="Remove">×</button>
                    </span>
                  )
                })}
              </div>
            )}
            <select className={SELECT_CLASS} value=""
              onChange={(e) => { addComponent(e.target.value); e.target.value = '' }}>
              <option value="">+ Add component…</option>
              {availableComponents.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Skip Policy */}
      <div className="border border-stone-700 rounded-lg p-4 space-y-4">
        <p className="text-sm font-semibold text-amber-400">Skip Policy</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>Policy type</label>
            <select className={SELECT_CLASS} value={form.skipPolicyType} onChange={setStr('skipPolicyType')}>
              <option value="NONE">No skips allowed</option>
              <option value="UNLIMITED">Unlimited skips</option>
              <option value="CALENDAR_YEAR">X skips per calendar year</option>
              <option value="FROM_FIRST_SKIP">X skips from first skip date</option>
              <option value="FROM_SUB_START">X skips from subscription start</option>
            </select>
          </div>
          {form.skipPolicyType !== 'NONE' && (
            <div className="space-y-2">
              <div>
                <label className={LABEL_CLASS}>Deadline type</label>
                <select className={SELECT_CLASS} value={form.skipDeadlineType} onChange={setStr('skipDeadlineType')}>
                  <option value="DAYS_BEFORE">Days before renewal</option>
                  <option value="DAY_OF_MONTH">Specific day of month</option>
                </select>
              </div>
              {form.skipDeadlineType === 'DAYS_BEFORE' ? (
                <div>
                  <label className={LABEL_CLASS}>Days before renewal</label>
                  <input type="number" min={0} max={60} className={INPUT_CLASS}
                    value={form.skipDeadlineDaysBefore} onChange={setStr('skipDeadlineDaysBefore')} placeholder="0" />
                  <p className="text-xs text-stone-500 mt-1">0 = day of renewal</p>
                </div>
              ) : (
                <div>
                  <label className={LABEL_CLASS}>Day of month (1–28)</label>
                  <input type="number" min={1} max={28} className={INPUT_CLASS}
                    value={form.skipDeadlineDayOfMonth} onChange={setStr('skipDeadlineDayOfMonth')} placeholder="e.g. 15" />
                  <p className="text-xs text-stone-500 mt-1">Skip must be submitted by this date each month</p>
                </div>
              )}
            </div>
          )}
        </div>

        {form.skipPolicyType !== 'NONE' && (
          <div className="grid grid-cols-3 gap-3">
            {form.skipPolicyType !== 'UNLIMITED' && (
              <div>
                <label className={LABEL_CLASS}>Max skips</label>
                <input type="number" min={1} className={INPUT_CLASS}
                  value={form.skipMaxSkips} onChange={setStr('skipMaxSkips')} placeholder="e.g. 2" />
              </div>
            )}
            {(form.skipPolicyType === 'FROM_FIRST_SKIP' || form.skipPolicyType === 'FROM_SUB_START') && (
              <div>
                <label className={LABEL_CLASS}>Reset period (months)</label>
                <input type="number" min={1} className={INPUT_CLASS}
                  value={form.skipWindowMonths} onChange={setStr('skipWindowMonths')} placeholder="e.g. 12" />
                <p className="text-xs text-stone-500 mt-1">Skip count resets after this many months</p>
              </div>
            )}
            <div>
              <label className={LABEL_CLASS}>Max consecutive skips</label>
              <input type="number" min={1} className={INPUT_CLASS}
                value={form.skipMaxConsecutive} onChange={setStr('skipMaxConsecutive')} placeholder="optional" />
              <p className="text-xs text-stone-500 mt-1">Skips in a row (leave blank = no limit)</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>Policy notes (shown to users)</label>
            <textarea rows={2} className={INPUT_CLASS} value={form.skipNotes} onChange={setStr('skipNotes')}
              placeholder="e.g. You can skip up to 2 boxes per calendar year." />
          </div>
          <div>
            <label className={LABEL_CLASS}>How to submit a skip request</label>
            <textarea rows={2} className={INPUT_CLASS} value={form.skipHow} onChange={setStr('skipHow')}
              placeholder="e.g. Email support@example.com before the deadline." />
          </div>
        </div>
      </div>

      <button type="submit" disabled={submitting}
        className="bg-amber-400 text-stone-950 font-semibold px-6 py-2.5 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors">
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

// ─── Prepay Options Panel ─────────────────────────────────────────────────────

interface PrepayOption {
  id: string
  months: number
  price: string
  label: string | null
  validFrom: string | null
  validUntil: string | null
}

function PrepayOptionsPanel({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newForm, setNewForm] = useState({ months: '', price: '', label: '', validFrom: '', validUntil: '' })
  const [editForm, setEditForm] = useState({ months: '', price: '', label: '', validFrom: '', validUntil: '' })
  const [adding, setAdding] = useState(false)

  const { data: options = [], isLoading } = useQuery<PrepayOption[]>({
    queryKey: ['prepay-options', slug],
    queryFn: () => authFetch<PrepayOption[]>(`/subscriptions/${slug}/prepay-options`),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      authFetch(`/subscriptions/${slug}/prepay-options`, {
        method: 'POST',
        body: JSON.stringify({
          months: parseInt(newForm.months, 10),
          price: newForm.price,
          label: newForm.label || undefined,
          validFrom: newForm.validFrom || undefined,
          validUntil: newForm.validUntil || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepay-options', slug] })
      setNewForm({ months: '', price: '', label: '', validFrom: '', validUntil: '' })
      setAdding(false)
    },
    onError: (err: Error) => alert(`Error: ${err.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      authFetch(`/subscriptions/${slug}/prepay-options/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          months: editForm.months ? parseInt(editForm.months, 10) : undefined,
          price: editForm.price || undefined,
          label: editForm.label || null,
          validFrom: editForm.validFrom || null,
          validUntil: editForm.validUntil || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepay-options', slug] })
      setEditingId(null)
    },
    onError: (err: Error) => alert(`Error: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      authFetch(`/subscriptions/${slug}/prepay-options/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prepay-options', slug] }),
    onError: (err: Error) => alert(`Error: ${err.message}`),
  })

  const startEdit = (o: PrepayOption) => {
    setEditingId(o.id)
    setEditForm({
      months: String(o.months),
      price: o.price,
      label: o.label ?? '',
      validFrom: o.validFrom ? o.validFrom.slice(0, 10) : '',
      validUntil: o.validUntil ? o.validUntil.slice(0, 10) : '',
    })
  }

  return (
    <div className="border border-stone-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-amber-400">Prepay Options</p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs bg-amber-400 text-stone-950 px-2 py-1 rounded hover:bg-amber-300 transition-colors"
          >
            + Add Option
          </button>
        )}
      </div>

      {isLoading && <p className="text-xs text-stone-500">Loading…</p>}

      {options.length === 0 && !isLoading && !adding && (
        <p className="text-xs text-stone-500 italic">No prepay options yet</p>
      )}

      {options.map((o) =>
        editingId === o.id ? (
          <div key={o.id} className="flex flex-wrap gap-2 items-end bg-stone-800 rounded p-2">
            <div>
              <label className={LABEL_CLASS}>Months</label>
              <input type="number" min={1} className={`${INPUT_CLASS} w-20`} value={editForm.months}
                onChange={(e) => setEditForm((f) => ({ ...f, months: e.target.value }))} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Price</label>
              <input className={`${INPUT_CLASS} w-28`} value={editForm.price}
                onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))} placeholder="e.g. 169.99" />
            </div>
            <div>
              <label className={LABEL_CLASS}>Label</label>
              <input className={`${INPUT_CLASS} w-40`} value={editForm.label}
                onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Half-year" />
            </div>
            <div>
              <label className={LABEL_CLASS}>Valid From</label>
              <input type="date" className={`${INPUT_CLASS} w-36`} value={editForm.validFrom}
                onChange={(e) => setEditForm((f) => ({ ...f, validFrom: e.target.value }))} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Valid Until</label>
              <input type="date" className={`${INPUT_CLASS} w-36`} value={editForm.validUntil}
                onChange={(e) => setEditForm((f) => ({ ...f, validUntil: e.target.value }))} />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate(o.id)}
                className="text-xs bg-amber-400 text-stone-950 px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50">
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditingId(null)}
                className="text-xs text-stone-400 hover:text-stone-200">Cancel</button>
            </div>
          </div>
        ) : (
          <div key={o.id} className="flex items-center justify-between gap-2 text-sm text-stone-300 bg-stone-800/50 rounded px-3 py-2">
            <span>
              <span className="font-semibold text-stone-100">{o.label ?? `${o.months} months`}</span>
              {' '}— {o.months} mo · {o.price}
              {(o.validFrom || o.validUntil) && (
                <span className="text-xs text-stone-500 ml-2">
                  {o.validFrom ? `from ${o.validFrom.slice(0, 10)}` : ''}
                  {o.validFrom && o.validUntil ? ' · ' : ''}
                  {o.validUntil ? `until ${o.validUntil.slice(0, 10)}` : ''}
                </span>
              )}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => startEdit(o)}
                className="text-xs text-amber-400 hover:underline">Edit</button>
              <button type="button" disabled={deleteMutation.isPending}
                onClick={() => { if (confirm('Delete this prepay option?')) deleteMutation.mutate(o.id) }}
                className="text-xs text-red-400 hover:underline disabled:opacity-50">Delete</button>
            </div>
          </div>
        )
      )}

      {adding && (
        <div className="flex flex-wrap gap-2 items-end bg-stone-800 rounded p-2">
          <div>
            <label className={LABEL_CLASS}>Months *</label>
            <input type="number" min={1} required className={`${INPUT_CLASS} w-20`} value={newForm.months}
              onChange={(e) => setNewForm((f) => ({ ...f, months: e.target.value }))} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Price *</label>
            <input required className={`${INPUT_CLASS} w-28`} value={newForm.price}
              onChange={(e) => setNewForm((f) => ({ ...f, price: e.target.value }))} placeholder="e.g. 169.99" />
          </div>
          <div>
            <label className={LABEL_CLASS}>Label</label>
            <input className={`${INPUT_CLASS} w-40`} value={newForm.label}
              onChange={(e) => setNewForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Half-year" />
          </div>
          <div>
            <label className={LABEL_CLASS}>Valid From</label>
            <input type="date" className={`${INPUT_CLASS} w-36`} value={newForm.validFrom}
              onChange={(e) => setNewForm((f) => ({ ...f, validFrom: e.target.value }))} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Valid Until</label>
            <input type="date" className={`${INPUT_CLASS} w-36`} value={newForm.validUntil}
              onChange={(e) => setNewForm((f) => ({ ...f, validUntil: e.target.value }))} />
          </div>
          <div className="flex gap-2 mt-4">
            <button type="button" disabled={createMutation.isPending || !newForm.months || !newForm.price}
              onClick={() => createMutation.mutate()}
              className="text-xs bg-amber-400 text-stone-950 px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50">
              {createMutation.isPending ? 'Adding…' : 'Add'}
            </button>
            <button type="button" onClick={() => setAdding(false)}
              className="text-xs text-stone-400 hover:text-stone-200">Cancel</button>
          </div>
        </div>
      )}
    </div>
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
            type: resolveSkipType(form),
            maxSkips: form.skipMaxSkips ? parseInt(form.skipMaxSkips, 10) : undefined,
            maxConsecutive: form.skipMaxConsecutive ? parseInt(form.skipMaxConsecutive, 10) : undefined,
            windowMonths: form.skipWindowMonths ? parseInt(form.skipWindowMonths, 10) : undefined,
            skipDeadlineType: form.skipDeadlineType || 'DAYS_BEFORE',
            skipDeadlineDaysBefore: form.skipDeadlineType === 'DAYS_BEFORE' ? parseInt(form.skipDeadlineDaysBefore || '0', 10) : 0,
            skipDeadlineDayOfMonth: form.skipDeadlineType === 'DAY_OF_MONTH' && form.skipDeadlineDayOfMonth ? parseInt(form.skipDeadlineDayOfMonth, 10) : undefined,
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
          type: resolveSkipType(form) || 'NONE',
          maxSkips: form.skipMaxSkips ? parseInt(form.skipMaxSkips, 10) : undefined,
          maxConsecutive: form.skipMaxConsecutive ? parseInt(form.skipMaxConsecutive, 10) : undefined,
          windowMonths: form.skipWindowMonths ? parseInt(form.skipWindowMonths, 10) : undefined,
          skipDeadlineType: form.skipDeadlineType || 'DAYS_BEFORE',
          skipDeadlineDaysBefore: form.skipDeadlineType === 'DAYS_BEFORE' ? parseInt(form.skipDeadlineDaysBefore || '0', 10) : 0,
          skipDeadlineDayOfMonth: form.skipDeadlineType === 'DAY_OF_MONTH' && form.skipDeadlineDayOfMonth ? parseInt(form.skipDeadlineDayOfMonth, 10) : undefined,
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
      render: (row: ApiSubscription) => (
        <div className="flex flex-col gap-0.5">
          {row.isHidden ? (
            <span className="text-stone-500 text-xs font-medium">Hidden</span>
          ) : row.isDiscontinued ? (
            <span className="text-red-400 text-xs font-medium">Discontinued</span>
          ) : (
            <span className="text-emerald-400 text-xs font-medium">Active</span>
          )}
          {row.parentSubscriptionId && (() => {
            const parent = subs.find((s) => s.id === row.parentSubscriptionId)
            return (
              <span className="text-sky-400 text-[10px]">
                Copy of {parent?.name ?? row.parentSubscriptionId}
              </span>
            )
          })()}
        </div>
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
          {row.contentType !== 'SERIES' && !row.isCombo && (
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
          <Link
            href={`/admin/subscriptions/${row.slug}/months#price-changes`}
            className="text-emerald-400 text-xs hover:underline ml-3"
          >
            💰 Prices →
          </Link>
        </>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-100">Subscriptions</h1>
        {!createOpen && !editSub && (
          <button
            onClick={() => setCreateOpen(true)}
            className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
          >
            + Add Subscription
          </button>
        )}
      </div>

      {/* Inline Create panel */}
      {createOpen && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-100">Add Subscription</h2>
            <button onClick={() => setCreateOpen(false)} className="text-stone-400 hover:text-stone-200 text-sm transition-colors">✕ Cancel</button>
          </div>
          <SubscriptionForm
            {...commonFormProps}
            initial={EMPTY_FORM}
            submitLabel="Create Subscription"
            submitting={createMutation.isPending}
            onSubmit={(form) => createMutation.mutate(form)}
          />
        </div>
      )}

      {/* Inline Edit panel */}
      {editSub && (
        <div className="bg-stone-900 border border-amber-500/30 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-100">Edit — {editSub.name}</h2>
            <button onClick={() => setEditSub(null)} className="text-stone-400 hover:text-stone-200 text-sm transition-colors">✕ Cancel</button>
          </div>
          <SubscriptionForm
            key={editSub.id}
            {...commonFormProps}
            initial={subToForm(editSub)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={(form) => editMutation.mutate({ slug: editSub.slug, form })}
          />
          <PrepayOptionsPanel slug={editSub.slug} />
        </div>
      )}

      {subsLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={subs}
            onEdit={(row) => { setEditSub(row); setCreateOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
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

      <ConfirmDialog
        open={deleteSub !== null}
        message={`Delete subscription "${deleteSub?.name}"? This cannot be undone.`}
        onConfirm={() => deleteSub && deleteMutation.mutate(deleteSub.slug)}
        onCancel={() => setDeleteSub(null)}
      />
    </div>
  )
}
