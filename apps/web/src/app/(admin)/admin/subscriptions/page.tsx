'use client'

import { useState, useEffect } from 'react'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import Link from 'next/link'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import type { ApiSubscription, ApiBookBoxCompany, PaginatedResponse } from '@luxgrimoire/shared-types'
import DataTable from '@/components/admin/DataTable'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import ImageUpload from '@/components/admin/ImageUpload'
import { GenreTagsPicker } from '@/components/admin/pickers/GenreTagsPicker'
import { Pagination } from '@/components/admin/Pagination'
import { isValidCalendarDate } from '@/lib/dateValidation'

const INPUT_CLASS =
  'w-full bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 focus:outline-none focus:border-brand-400'
const LABEL_CLASS = 'block text-sm text-navy-400 mb-1'
const SELECT_CLASS =
  'w-full bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 focus:outline-none focus:border-brand-400'

const LANGUAGES = ['English', 'Polish', 'French', 'German', 'Spanish', 'Italian', 'Portuguese', 'Dutch', 'Czech', 'Hungarian', 'Romanian', 'Ukrainian', 'Japanese', 'Korean', 'Chinese']

// ─── Types ───────────────────────────────────────────────────────────────────

let _draftKeyCounter = 0
function newDraftKey() { return String(++_draftKeyCounter) }

interface SkipPolicyDraft {
  _key: string
  billingType: string // ALL | MONTHLY | PREPAID
  type: string        // NONE | UNLIMITED | CALENDAR_YEAR | FROM_FIRST_SKIP | FROM_SUB_START | PREPAID_WINDOW_SKIP
  maxSkips: string
  maxConsecutive: string
  windowMonths: string
  skipDeadlineType: string
  skipDeadlineDaysBefore: string
  skipDeadlineDayOfMonth: string
  notes: string
  skipHow: string
  allowUnskip: boolean
  unskipDeadlineType: string
  unskipDeadlineDaysBefore: string
  unskipDeadlineDayOfMonth: string
  unskipNotes: string
  unskipHow: string
}

function emptySkipPolicyDraft(billingType = 'ALL'): SkipPolicyDraft {
  return {
    _key: newDraftKey(),
    billingType,
    type: 'NONE',
    maxSkips: '',
    maxConsecutive: '',
    windowMonths: '',
    skipDeadlineType: 'DAYS_BEFORE',
    skipDeadlineDaysBefore: '0',
    skipDeadlineDayOfMonth: '',
    notes: '',
    skipHow: '',
    allowUnskip: false,
    unskipDeadlineType: 'DAYS_BEFORE',
    unskipDeadlineDaysBefore: '0',
    unskipDeadlineDayOfMonth: '',
    unskipNotes: '',
    unskipHow: '',
  }
}

function apiPolicyToDraft(p: { billingType: string; type: string; maxSkips: number | null; maxConsecutive: number | null; windowMonths: number | null; skipDeadlineDaysBefore: number; skipDeadlineType: string; skipDeadlineDayOfMonth: number | null; notes: string | null; skipHow: string | null; allowUnskip: boolean; unskipDeadlineType: string; unskipDeadlineDaysBefore: number; unskipDeadlineDayOfMonth: number | null; unskipNotes: string | null; unskipHow: string | null }): SkipPolicyDraft {
  return {
    _key: newDraftKey(),
    billingType: p.billingType,
    type: p.type,
    maxSkips: p.maxSkips != null ? String(p.maxSkips) : '',
    maxConsecutive: p.maxConsecutive != null ? String(p.maxConsecutive) : '',
    windowMonths: p.windowMonths != null ? String(p.windowMonths) : '',
    skipDeadlineType: p.skipDeadlineType ?? 'DAYS_BEFORE',
    skipDeadlineDaysBefore: p.skipDeadlineDaysBefore != null ? String(p.skipDeadlineDaysBefore) : '0',
    skipDeadlineDayOfMonth: p.skipDeadlineDayOfMonth != null ? String(p.skipDeadlineDayOfMonth) : '',
    notes: p.notes ?? '',
    skipHow: p.skipHow ?? '',
    allowUnskip: p.allowUnskip ?? false,
    unskipDeadlineType: p.unskipDeadlineType ?? 'DAYS_BEFORE',
    unskipDeadlineDaysBefore: p.unskipDeadlineDaysBefore != null ? String(p.unskipDeadlineDaysBefore) : '0',
    unskipDeadlineDayOfMonth: p.unskipDeadlineDayOfMonth != null ? String(p.unskipDeadlineDayOfMonth) : '',
    unskipNotes: p.unskipNotes ?? '',
    unskipHow: p.unskipHow ?? '',
  }
}

function resolveSkipTypeFromDraft(d: SkipPolicyDraft): string {
  if (d.type === 'UNLIMITED' && d.maxConsecutive) return 'UNLIMITED_MAX_CONSEC'
  return d.type
}

function draftToApiBody(d: SkipPolicyDraft, billingType: string) {
  return {
    type: resolveSkipTypeFromDraft(d),
    maxSkips: d.maxSkips ? parseInt(d.maxSkips, 10) : undefined,
    maxConsecutive: d.maxConsecutive ? parseInt(d.maxConsecutive, 10) : undefined,
    windowMonths: d.windowMonths ? parseInt(d.windowMonths, 10) : undefined,
    skipDeadlineType: d.skipDeadlineType || 'DAYS_BEFORE',
    skipDeadlineDaysBefore: d.skipDeadlineType === 'DAYS_BEFORE' ? parseInt(d.skipDeadlineDaysBefore || '0', 10) : 0,
    skipDeadlineDayOfMonth: d.skipDeadlineType === 'DAY_OF_MONTH' && d.skipDeadlineDayOfMonth ? parseInt(d.skipDeadlineDayOfMonth, 10) : undefined,
    notes: d.notes || undefined,
    skipHow: d.skipHow || undefined,
    allowUnskip: d.allowUnskip,
    unskipDeadlineType: d.unskipDeadlineType || 'DAYS_BEFORE',
    unskipDeadlineDaysBefore: d.unskipDeadlineType === 'DAYS_BEFORE' ? parseInt(d.unskipDeadlineDaysBefore || '0', 10) : 0,
    unskipDeadlineDayOfMonth: d.unskipDeadlineType === 'DAY_OF_MONTH' && d.unskipDeadlineDayOfMonth ? parseInt(d.unskipDeadlineDayOfMonth, 10) : undefined,
    unskipNotes: d.unskipNotes || undefined,
    unskipHow: d.unskipHow || undefined,
    billingType,
  }
}

interface SubFormData {
  companyId: string
  name: string
  description: string
  genres: string[]
  currency: string
  coverImage: string
  price: string
  language: string
  intervalMonths: string
  contentType: string
  bookishMerch: boolean
  renewalDayUserSet: boolean
  renewalDay: string
  startingMonth: string
  isCombo: boolean
  parentSubscriptionId: string
  componentIds: string[]
  isDiscontinued: boolean
  isHidden: boolean
  isContentStream: boolean
  isBundleSubscription: boolean
  hasBookChoiceMonths: boolean
  paymentOnStartup: boolean
  isUpcoming: boolean
  upcomingNote: string
  waitlistLink: string
  signupIncludesCurrentMonth: boolean
  renewalMonthOffset: string
  startDate: string
  endDate: string
  // Skip policies (saved separately via PUT /skip-policy/:slug)
  skipPoliciesDraft: SkipPolicyDraft[]
  /** Required when any tracked settings field changes (effectiveFrom for the history record) */
  settingsEffectiveFrom: string
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
  intervalMonths: '1',
  contentType: 'MONTH',
  bookishMerch: false,
  renewalDayUserSet: false,
  renewalDay: '',
  startingMonth: '',
  isCombo: false,
  parentSubscriptionId: '',
  componentIds: [],
  isDiscontinued: false,
  isHidden: false,
  isContentStream: false,
  isBundleSubscription: false,
  hasBookChoiceMonths: false,
  paymentOnStartup: false,
  isUpcoming: false,
  upcomingNote: '',
  waitlistLink: '',
  signupIncludesCurrentMonth: false,
  renewalMonthOffset: '0',
  startDate: '',
  endDate: '',
  skipPoliciesDraft: [],
  settingsEffectiveFrom: '',
}

function subToForm(sub: ApiSubscription): SubFormData {
  return {
    companyId: sub.companyId,
    name: sub.name,
    description: sub.description ?? '',
    genres: sub.genres ?? [],
    currency: sub.currency ?? 'EUR',
    coverImage: sub.coverImage ?? '',
    price: sub.price ?? '',
    language: sub.language ?? '',
    intervalMonths: String(sub.intervalMonths ?? 1),
    contentType: sub.contentType ?? 'MIX',
    bookishMerch: sub.bookishMerch ?? false,
    renewalDayUserSet: sub.renewalDayUserSet ?? false,
    renewalDay: sub.renewalDay != null ? String(sub.renewalDay) : '',
    startingMonth: sub.startingMonth != null ? String(sub.startingMonth) : '',
    isCombo: sub.isCombo ?? false,
    parentSubscriptionId: sub.parentSubscriptionId ?? '',
    componentIds: (sub as any).componentIds ?? [],
    isDiscontinued: sub.isDiscontinued,
    isHidden: sub.isHidden ?? false,
    isContentStream: sub.isContentStream ?? false,
    isBundleSubscription: sub.isBundleSubscription ?? false,
    hasBookChoiceMonths: (sub as any).hasBookChoiceMonths ?? false,
    paymentOnStartup: sub.paymentOnStartup ?? false,
    isUpcoming: sub.isUpcoming ?? false,
    upcomingNote: sub.upcomingNote ?? '',
    waitlistLink: sub.waitlistLink ?? '',
    signupIncludesCurrentMonth: sub.signupIncludesCurrentMonth ?? false,
    renewalMonthOffset: sub.renewalMonthOffset != null ? String(sub.renewalMonthOffset) : '0',
    startDate: sub.startDate ? sub.startDate.slice(0, 10) : '',
    endDate: sub.endDate ? sub.endDate.slice(0, 10) : '',
    skipPoliciesDraft: (sub.skipPolicies ?? []).map(apiPolicyToDraft),
    settingsEffectiveFrom: '',
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
    price: form.price ? form.price.replace(',', '.') : undefined,
    language: form.language || undefined,
    intervalMonths: parseInt(form.intervalMonths, 10) || 1,
    contentType: form.contentType || 'MIX',
    bookishMerch: form.bookishMerch,
    renewalDayUserSet: form.renewalDayUserSet,
    renewalDay: form.renewalDay ? parseInt(form.renewalDay, 10) : undefined,
    startingMonth: form.startingMonth ? parseInt(form.startingMonth, 10) : undefined,
    isCombo: form.isCombo,
    parentSubscriptionId: form.parentSubscriptionId || undefined,
    componentIds: form.componentIds.length > 0 ? form.componentIds : undefined,
    isDiscontinued: form.isDiscontinued,
    isHidden: form.isHidden,
    isContentStream: form.isContentStream,
    isBundleSubscription: form.isBundleSubscription,
    hasBookChoiceMonths: form.hasBookChoiceMonths,
    paymentOnStartup: form.paymentOnStartup,
    isUpcoming: form.isUpcoming,
    upcomingNote: form.upcomingNote,
    waitlistLink: form.waitlistLink,
    signupIncludesCurrentMonth: form.signupIncludesCurrentMonth,
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
    intervalMonths: parseInt(form.intervalMonths, 10) || 1,
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
    isContentStream: form.isContentStream,
    isBundleSubscription: form.isBundleSubscription,
    hasBookChoiceMonths: form.hasBookChoiceMonths,
    paymentOnStartup: form.paymentOnStartup,
    isUpcoming: form.isUpcoming,
    upcomingNote: form.upcomingNote,
    waitlistLink: form.waitlistLink,
    signupIncludesCurrentMonth: form.signupIncludesCurrentMonth,
    renewalMonthOffset: form.renewalMonthOffset ? parseInt(form.renewalMonthOffset, 10) : 0,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    ...(form.settingsEffectiveFrom ? { settingsEffectiveFrom: form.settingsEffectiveFrom } : {}),
  }
}

// ─── SkipPolicyEditor component ────────────────────────────────────────────────

interface SkipPolicyEditorProps {
  draft: SkipPolicyDraft
  onChange: (d: SkipPolicyDraft) => void
  usedBillingTypes: string[]
  onSave: () => void
  onCancel: () => void
  INPUT_CLASS: string
  SELECT_CLASS: string
  LABEL_CLASS: string
}

function SkipPolicyEditor({ draft, onChange, usedBillingTypes, onSave, onCancel, INPUT_CLASS, SELECT_CLASS, LABEL_CLASS }: SkipPolicyEditorProps) {
  const set = (field: keyof SkipPolicyDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...draft, [field]: e.target.value })
  const setChecked = (field: keyof SkipPolicyDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...draft, [field]: e.target.checked })

  const allBillingTypes = ['ALL', 'MONTHLY', 'PREPAID']
  const availableForThis = allBillingTypes.filter(bt => !usedBillingTypes.includes(bt))

  return (
    <div className="p-4 space-y-4 bg-navy-900/50">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLASS}>Applies to billing type</label>
          <select className={SELECT_CLASS} value={draft.billingType} onChange={set('billingType')}>
            {availableForThis.map(bt => (
              <option key={bt} value={bt}>
                {bt === 'ALL' ? 'All subscribers' : bt === 'MONTHLY' ? 'Monthly billing only' : 'Prepaid billing only'}
              </option>
            ))}
            {!availableForThis.includes(draft.billingType) && (
              <option value={draft.billingType}>{draft.billingType}</option>
            )}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>Policy type</label>
          <select className={SELECT_CLASS} value={draft.type} onChange={set('type')}>
            <option value="NONE">No skips allowed</option>
            <option value="UNLIMITED">Unlimited skips</option>
            <option value="CALENDAR_YEAR">X skips per calendar year</option>
            <option value="FROM_FIRST_SKIP">X skips from first skip date</option>
            <option value="FROM_SUB_START">X skips from subscription start</option>
            <option value="FROM_FIRST_BOX">X skips per rolling window from first box month</option>
            <option value="PREPAID_WINDOW_SKIP">Prepaid window skip</option>
          </select>
        </div>
      </div>

      {draft.type !== 'NONE' && (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div>
                <label className={LABEL_CLASS}>Deadline type</label>
                <select className={SELECT_CLASS} value={draft.skipDeadlineType} onChange={set('skipDeadlineType')}>
                  <option value="DAYS_BEFORE">Days before renewal</option>
                  <option value="DAY_OF_MONTH">Specific day of month</option>
                </select>
              </div>
              {draft.skipDeadlineType === 'DAYS_BEFORE' ? (
                <div>
                  <label className={LABEL_CLASS}>Days before renewal</label>
                  <input type="number" min={0} max={60} className={INPUT_CLASS}
                    value={draft.skipDeadlineDaysBefore} onChange={set('skipDeadlineDaysBefore')} placeholder="0" />
                  <p className="text-xs text-navy-500 mt-1">0 = day of renewal</p>
                </div>
              ) : (
                <div>
                  <label className={LABEL_CLASS}>Day of month (1–28)</label>
                  <input type="number" min={1} max={28} className={INPUT_CLASS}
                    value={draft.skipDeadlineDayOfMonth} onChange={set('skipDeadlineDayOfMonth')} placeholder="e.g. 15" />
                </div>
              )}
            </div>
            <div className="space-y-3">
              {draft.type !== 'UNLIMITED' && (
                <div>
                  <label className={LABEL_CLASS}>Max skips</label>
                  <input type="number" min={1} className={INPUT_CLASS}
                    value={draft.maxSkips} onChange={set('maxSkips')} placeholder="e.g. 2" />
                </div>
              )}
              {(draft.type === 'FROM_FIRST_SKIP' || draft.type === 'FROM_SUB_START' || draft.type === 'FROM_FIRST_BOX') && (
                <div>
                  <label className={LABEL_CLASS}>Reset period (months)</label>
                  <input type="number" min={1} className={INPUT_CLASS}
                    value={draft.windowMonths} onChange={set('windowMonths')} placeholder="e.g. 6 or 12" />
                  {draft.type === 'FROM_FIRST_BOX' && (
                    <p className="text-xs text-navy-500 mt-1">
                      Resets every {draft.windowMonths || 'N'} months from the user&apos;s first box month (e.g. 12 = anniversary reset).
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className={LABEL_CLASS}>Max consecutive skips</label>
                <input type="number" min={1} className={INPUT_CLASS}
                  value={draft.maxConsecutive} onChange={set('maxConsecutive')} placeholder="optional" />
                <p className="text-xs text-navy-500 mt-1">Leave blank = no limit</p>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Policy notes (shown to users)</label>
              <textarea rows={2} className={INPUT_CLASS} value={draft.notes} onChange={set('notes')}
                placeholder="e.g. You can skip up to 2 boxes per calendar year." />
            </div>
            <div>
              <label className={LABEL_CLASS}>How to submit a skip request</label>
              <textarea rows={2} className={INPUT_CLASS} value={draft.skipHow} onChange={set('skipHow')}
                placeholder="e.g. Email support@example.com before the deadline." />
            </div>
          </div>

          {/* Unskip */}
          <div className="border border-navy-700 rounded-lg p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={draft.allowUnskip} onChange={setChecked('allowUnskip')} />
              <span className="text-sm text-navy-300 font-medium">Allow unskipping</span>
            </label>
            {draft.allowUnskip && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div>
                      <label className={LABEL_CLASS}>Unskip deadline type</label>
                      <select className={SELECT_CLASS} value={draft.unskipDeadlineType} onChange={set('unskipDeadlineType')}>
                        <option value="DAYS_BEFORE">Days before renewal</option>
                        <option value="DAY_OF_MONTH">Specific day of month</option>
                      </select>
                    </div>
                    {draft.unskipDeadlineType === 'DAYS_BEFORE' ? (
                      <div>
                        <label className={LABEL_CLASS}>Days before renewal</label>
                        <input type="number" min={0} max={60} className={INPUT_CLASS}
                          value={draft.unskipDeadlineDaysBefore} onChange={set('unskipDeadlineDaysBefore')} placeholder="0" />
                      </div>
                    ) : (
                      <div>
                        <label className={LABEL_CLASS}>Day of month (1–28)</label>
                        <input type="number" min={1} max={28} className={INPUT_CLASS}
                          value={draft.unskipDeadlineDayOfMonth} onChange={set('unskipDeadlineDayOfMonth')} placeholder="e.g. 15" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLASS}>Unskip notes (shown to users)</label>
                    <textarea rows={2} className={INPUT_CLASS} value={draft.unskipNotes} onChange={set('unskipNotes')}
                      placeholder="e.g. You can reverse a skip before the renewal day." />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>How to submit an unskip request</label>
                    <textarea rows={2} className={INPUT_CLASS} value={draft.unskipHow} onChange={set('unskipHow')}
                      placeholder="e.g. Email support@example.com" />
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onSave}
          className="px-4 py-1.5 rounded-lg bg-brand-500 text-navy-950 text-sm font-semibold hover:bg-brand-400 transition-colors">
          Save policy
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-1.5 rounded-lg border border-navy-700 text-navy-400 text-sm hover:text-navy-200 hover:border-navy-500 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Form component ───────────────────────────────────────────────────────────

interface SubFormProps {
  initial: SubFormData
  onSubmit: (data: SubFormData) => void
  submitting: boolean
  submitLabel: string
  companies: ApiBookBoxCompany[]
  allSubscriptions: ApiSubscription[]
  allSubs: ApiSubscription[]
  user: { role: string; managedCompanyId?: string | null } | null
}

function SubscriptionForm({
  initial,
  onSubmit,
  submitting,
  submitLabel,
  companies,
  allSubscriptions,
  allSubs,
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

  const TRACKED_FIELDS: (keyof SubFormData)[] = [
    'renewalDay', 'renewalDayUserSet', 'paymentOnStartup', 'signupIncludesCurrentMonth', 'renewalMonthOffset',
  ]
  const isEditMode = !!initial.companyId // create form has no companyId yet
  const trackedSettingsDirty = isEditMode && TRACKED_FIELDS.some(f => String(form[f]) !== String(initial[f]))

  // Skip policy inline editor state
  const [editingPolicyKey, setEditingPolicyKey] = useState<string | null>(null)
  const [addingPolicy, setAddingPolicy] = useState(false)
  const [policyDraft, setPolicyDraft] = useState<SkipPolicyDraft | null>(null)

  const usedBillingTypes = form.skipPoliciesDraft.map(d => d.billingType)
  const availableBillingTypes = (['ALL', 'MONTHLY', 'PREPAID'] as const).filter(bt => !usedBillingTypes.includes(bt))

  function startAddPolicy() {
    const bt = availableBillingTypes[0] ?? 'ALL'
    setPolicyDraft(emptySkipPolicyDraft(bt))
    setAddingPolicy(true)
    setEditingPolicyKey(null)
  }

  function startEditPolicy(d: SkipPolicyDraft) {
    setPolicyDraft({ ...d })
    setEditingPolicyKey(d._key)
    setAddingPolicy(false)
  }

  function cancelPolicyEdit() {
    setEditingPolicyKey(null)
    setAddingPolicy(false)
    setPolicyDraft(null)
  }

  function savePolicyDraft() {
    if (!policyDraft) return
    if (addingPolicy) {
      setField('skipPoliciesDraft', [...form.skipPoliciesDraft, policyDraft])
    } else {
      setField('skipPoliciesDraft', form.skipPoliciesDraft.map(d => d._key === policyDraft._key ? policyDraft : d))
    }
    cancelPolicyEdit()
  }

  function deletePolicy(key: string) {
    setField('skipPoliciesDraft', form.skipPoliciesDraft.filter(d => d._key !== key))
    if (editingPolicyKey === key) cancelPolicyEdit()
  }

  const BILLING_TYPE_LABELS: Record<string, string> = {
    ALL: 'All subscribers',
    MONTHLY: 'Monthly billing',
    PREPAID: 'Prepaid billing',
  }
  const SKIP_TYPE_LABELS: Record<string, string> = {
    NONE: 'No skips allowed',
    UNLIMITED: 'Unlimited skips',
    CALENDAR_YEAR: 'X per calendar year',
    FROM_FIRST_SKIP: 'X from first skip',
    FROM_SUB_START: 'X from sub start',
    FROM_FIRST_BOX: 'X from first box (rolling)',
    PREPAID_WINDOW_SKIP: 'Prepaid window skip',
  }

  const genreOptions = Array.from(
    new Set(allSubscriptions.flatMap((s) => s.genres ?? []).filter(Boolean)),
  ).sort()

  const addComponent = (id: string) => {
    if (id && !form.componentIds.includes(id)) setField('componentIds', [...form.componentIds, id])
  }
  const removeComponent = (id: string) =>
    setField('componentIds', form.componentIds.filter((c) => c !== id))
  const availableComponents = (form.companyId
    ? allSubs.filter((s) => s.companyId === form.companyId)
    : allSubs
  ).filter((s) => !form.componentIds.includes(s.id) && !s.isContentStream)

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      if (form.startDate && !isValidCalendarDate(form.startDate)) return alert('Start Date is not a valid date')
      if (form.endDate && !isValidCalendarDate(form.endDate)) return alert('End Date is not a valid date')
      if (form.settingsEffectiveFrom && !isValidCalendarDate(form.settingsEffectiveFrom)) return alert('Settings Effective From is not a valid date')
      onSubmit(form)
    }} className="space-y-6">

      {/* ── 2-column main grid — only at xl+ so fields aren't cramped ── */}
      <div className="grid xl:grid-cols-2 gap-x-8 gap-y-4">

        {/* LEFT: identity */}
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Company *</label>
            <select required disabled={isManager}
              className={`${SELECT_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`}
              value={form.companyId} onChange={(e) => {
                const id = e.target.value
                setField('companyId', id)
                if (!isEditMode && id) {
                  const co = companies.find((c) => c.id === id)
                  if (co?.defaultCurrency) setField('currency', co.defaultCurrency)
                }
              }}>
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
          <div>
            <label className={LABEL_CLASS}>Waitlist link</label>
            <input
              className={INPUT_CLASS}
              value={form.waitlistLink}
              onChange={setStr('waitlistLink')}
              placeholder="https://..."
            />
          </div>
        </div>

        {/* RIGHT: settings */}
        <div className="space-y-4">
          {/* Price / Currency / Language */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={LABEL_CLASS}>Price</label>
              <input className={INPUT_CLASS} value={form.price} onChange={setStr('price')} placeholder="59.99" />
              <p className="text-xs text-navy-500 mt-1">Sets the initial base price. Add price changes below for future changes.</p>
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

          {/* Billing Interval / Content type */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Billing Interval</label>
              <select className={SELECT_CLASS} value={form.intervalMonths} onChange={setStr('intervalMonths')}>
                <option value="1">Monthly</option>
                <option value="2">Bimonthly (every 2 months)</option>
                <option value="3">Quarterly (every 3 months)</option>
                <option value="custom">Custom…</option>
              </select>
              {form.intervalMonths !== '1' && form.intervalMonths !== '2' && form.intervalMonths !== '3' && (
                <input type="number" min={1} max={12} className={`${INPUT_CLASS} mt-2`}
                  value={form.intervalMonths} onChange={setStr('intervalMonths')} placeholder="Months between renewals" />
              )}
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
          <div className="grid sm:grid-cols-2 gap-3">
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
          <div className="border border-navy-700 rounded-lg p-3 space-y-3">
            <p className="text-xs text-navy-400 font-semibold uppercase tracking-wide">Renewal</p>
            <label className="flex items-center gap-2 text-navy-300 text-sm cursor-pointer">
              <input type="checkbox" checked={form.renewalDayUserSet}
                onChange={(e) => setField('renewalDayUserSet', e.target.checked)}
                className="accent-brand-400 w-4 h-4" />
              Use subscriber's sign-up day
            </label>
            {!form.renewalDayUserSet && (
              <div>
                <label className={LABEL_CLASS}>Fixed renewal day (1–31)</label>
                <input type="number" min={1} max={31} className={INPUT_CLASS}
                  value={form.renewalDay} onChange={setStr('renewalDay')} placeholder="e.g. 15" />
              </div>
            )}
            <div>
              <label className={LABEL_CLASS}>Renewal month offset (0 = same month, 1 = charged 1 month before box, -2 = renewal is 2 months after box start)</label>
              <input type="number" min={-11} max={11} className={INPUT_CLASS}
                value={form.renewalMonthOffset} onChange={setStr('renewalMonthOffset')} placeholder="0" />
            </div>
            {(parseInt(form.intervalMonths, 10) > 1 || form.intervalMonths === 'custom') && (
              <div>
                <label className={LABEL_CLASS}>Starting month of cycle</label>
                <p className="text-xs text-navy-500 mb-1">
                  The first <strong>box/content month</strong> of the cycle — NOT the payment month.
                  E.g. bi-monthly with offset=1: if boxes ship Jun/Aug/Oct/…, set this to <strong>June</strong>,
                  even though payment is charged in May/Jul/Sep/… . Use the offset field above to shift billing
                  relative to this month.
                </p>
                <select className={SELECT_CLASS} value={form.startingMonth} onChange={setStr('startingMonth')}>
                  <option value="">— Select month —</option>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Settings effective from — shown only when tracked renewal settings are changed */}
          {trackedSettingsDirty && (
            <div className="border border-brand-600 bg-brand-950/30 rounded-lg p-3 space-y-1">
              <label className={`${LABEL_CLASS} text-brand-400`}>
                Settings effective from * <span className="font-normal text-brand-300">(required — renewal settings changed)</span>
              </label>
              <input
                type="date"
                required
                className={INPUT_CLASS}
                value={form.settingsEffectiveFrom}
                onChange={setStr('settingsEffectiveFrom')}
              />
              <p className="text-xs text-brand-700">
                New renewal settings take effect from this date. Subscribers whose next renewal is on or after this date will be updated.
                Defaults to 1st of next month if unsure.
              </p>
            </div>
          )}

          {/* Flags */}
          <div className="border border-navy-700 rounded-lg p-3 space-y-2">
            <p className="text-xs text-navy-400 font-semibold uppercase tracking-wide">Flags</p>
            {([
              { field: 'bookishMerch', label: 'Bookish Merch included' },
              { field: 'paymentOnStartup', label: 'Payment on signup (charged immediately)' },
              { field: 'signupIncludesCurrentMonth', label: 'Signup includes current month (default: next month)' },
              { field: 'isUpcoming', label: 'Upcoming (not yet launched)' },
              { field: 'isDiscontinued', label: 'Discontinued' },
              { field: 'isHidden', label: 'Hidden (draft / historical data)' },
              { field: 'isContentStream', label: 'Content stream (hidden parent, holds all months)' },
              { field: 'hasBookChoiceMonths', label: 'Has book-choice months (subscribers pick between book alternatives)' },
            ] as { field: keyof SubFormData; label: string }[]).map(({ field, label }) => (
              <label key={field} className="flex items-center gap-2 text-navy-300 text-sm cursor-pointer">
                <input type="checkbox" checked={form[field] as boolean}
                  onChange={(e) => setField(field, e.target.checked)}
                  className="accent-brand-400 w-4 h-4" />
                {label}
              </label>
            ))}
            {(parseInt(form.intervalMonths, 10) > 2 || form.intervalMonths === 'custom') && (
              <label className="flex items-center gap-2 text-brand-300 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isBundleSubscription}
                  onChange={(e) => setField('isBundleSubscription', e.target.checked)}
                  className="accent-brand-400 w-4 h-4" />
                Bundle — ships multiple months as one package
              </label>
            )}
          </div>

          {form.isUpcoming && (
            <div>
              <label className={LABEL_CLASS}>Upcoming note</label>
              <input
                className={INPUT_CLASS}
                value={form.upcomingNote}
                onChange={setStr('upcomingNote')}
                placeholder="e.g. Launching Spring 2026"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Full-width sections ── */}

      {/* Genres */}
      <div>
        <label className={LABEL_CLASS}>Genres</label>
        <GenreTagsPicker
          genres={form.genres}
          onChange={(v) => setField('genres', v)}
          endpoint="/subscriptions/genres"
        />
      </div>

      {/* Variant of | Copy from */}
      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <label className={LABEL_CLASS}>Variant of</label>
          <select className={SELECT_CLASS} value={form.parentSubscriptionId} onChange={setStr('parentSubscriptionId')}>
            <option value="">— None —</option>
            {(form.companyId ? allSubscriptions.filter((s) => s.companyId === form.companyId && s.isContentStream) : allSubscriptions.filter((s) => s.isContentStream))
              .map((s) => <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>)}
          </select>
        </div>
      </div>

      {/* Combo / Bundle */}
      <div>
        <label className="flex items-center gap-2 text-navy-300 text-sm cursor-pointer mb-2">
          <input type="checkbox" checked={form.isCombo}
            onChange={(e) => setField('isCombo', e.target.checked)}
            className="accent-brand-400 w-4 h-4" />
          Combo / Bundle subscription
        </label>
        {form.isCombo && (
          <div className="border border-navy-700 rounded-lg p-3 space-y-2">
            <label className={LABEL_CLASS}>Component subscriptions</label>
            {form.componentIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.componentIds.map((id) => {
                  const sub = allSubs.find((s) => s.id === id)
                  return (
                    <span key={id} className="flex items-center gap-1 bg-navy-700 text-navy-200 text-xs px-2 py-1 rounded-full">
                      {sub ? sub.name : id}
                      <button type="button" onClick={() => removeComponent(id)}
                        className="text-navy-400 hover:text-red-400 leading-none" aria-label="Remove">×</button>
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

      {/* Skip Policies */}
      <div className="border border-navy-700 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-brand-400">Skip Policies</p>
          {availableBillingTypes.length > 0 && !addingPolicy && (
            <button type="button" onClick={startAddPolicy}
              className="text-xs px-2.5 py-1 rounded-lg bg-navy-800 border border-navy-600 text-navy-300 hover:border-brand-500 hover:text-brand-400 transition-colors">
              + Add policy
            </button>
          )}
        </div>

        {/* Existing policies list */}
        {form.skipPoliciesDraft.length === 0 && !addingPolicy && (
          <p className="text-xs text-navy-500 italic">No skip policies configured.</p>
        )}

        {form.skipPoliciesDraft.map(d => (
          <div key={d._key} className="border border-navy-700 rounded-lg overflow-hidden">
            {editingPolicyKey === d._key && policyDraft ? (
              <SkipPolicyEditor
                draft={policyDraft}
                onChange={setPolicyDraft}
                usedBillingTypes={usedBillingTypes.filter(bt => bt !== d.billingType)}
                onSave={savePolicyDraft}
                onCancel={cancelPolicyEdit}
                INPUT_CLASS={INPUT_CLASS}
                SELECT_CLASS={SELECT_CLASS}
                LABEL_CLASS={LABEL_CLASS}
              />
            ) : (
              <div className="flex items-center gap-3 px-3 py-2">
                <span className="text-xs font-medium text-brand-400 shrink-0 w-28">{BILLING_TYPE_LABELS[d.billingType] ?? d.billingType}</span>
                <span className="text-xs text-navy-300 flex-1">{SKIP_TYPE_LABELS[d.type] ?? d.type}</span>
                {d.allowUnskip && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-900/50 border border-teal-700/50 text-teal-400">Unskip ✓</span>}
                <button type="button" onClick={() => startEditPolicy(d)}
                  className="text-xs text-navy-500 hover:text-brand-400 transition-colors px-1.5">Edit</button>
                <button type="button" onClick={() => deletePolicy(d._key)}
                  className="text-xs text-navy-500 hover:text-red-400 transition-colors px-1.5">✕</button>
              </div>
            )}
          </div>
        ))}

        {/* Add new policy inline */}
        {addingPolicy && policyDraft && (
          <div className="border border-brand-600/40 rounded-lg overflow-hidden">
            <SkipPolicyEditor
              draft={policyDraft}
              onChange={setPolicyDraft}
              usedBillingTypes={usedBillingTypes}
              onSave={savePolicyDraft}
              onCancel={cancelPolicyEdit}
              INPUT_CLASS={INPUT_CLASS}
              SELECT_CLASS={SELECT_CLASS}
              LABEL_CLASS={LABEL_CLASS}
            />
          </div>
        )}
      </div>

      <button type="submit" disabled={submitting}
        className="bg-brand-400 text-navy-950 font-semibold px-6 py-2.5 rounded-lg hover:bg-brand-300 disabled:opacity-50 transition-colors">
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

// ─── Settings History Panel ───────────────────────────────────────────────────

interface SettingsHistoryRecord {
  id: string
  effectiveFrom: string
  renewalDay: number | null
  renewalDayUserSet: boolean
  paymentOnStartup: boolean
  signupIncludesCurrentMonth: boolean
  renewalMonthOffset: number
  changedBy: string | null
  notes: string | null
  createdAt: string
}

// ─── Skip window recompute panel ───────────────────────────────────────────────
// Recomputes skip windows for a subscription's SAVED skip policy (not the local draft) — run
// after changing a policy's type/windowMonths, since existing UserSkipRecord.windowKey values
// were computed under the OLD config. Manual only, never triggered automatically on save.

function SkipWindowRecomputePanel({ slug, policies }: { slug: string; policies: { billingType: string; type: string; windowMonths: number | null }[] }) {
  const [billingType, setBillingType] = useState(policies[0]?.billingType ?? 'ALL')
  const [preview, setPreview] = useState<{ trackedUsers: number; windowWouldChange: number } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<{ recomputedCount: number; totalActive: number } | null>(null)

  if (policies.length === 0) return null
  const policy = policies.find(p => p.billingType === billingType) ?? policies[0]

  async function runPreview() {
    if (!policy) return
    setPreviewing(true)
    setResult(null)
    try {
      const res = await authFetch<{ trackedUsers: number; windowWouldChange: number }>(
        `/skip-policy/${slug}/policies/${policy.billingType}/recompute-preview`,
        { method: 'POST', body: JSON.stringify({ type: policy.type, windowMonths: policy.windowMonths ?? undefined }) },
      )
      setPreview(res)
    } finally {
      setPreviewing(false)
    }
  }

  async function runApply() {
    if (!policy) return
    if (!confirm(`Recompute skip windows for ${preview?.trackedUsers ?? 'all tracked'} user(s) under the ${policy.billingType} policy?`)) return
    setApplying(true)
    try {
      const res = await authFetch<{ recomputedCount: number; totalActive: number }>(
        `/skip-policy/${slug}/policies/${policy.billingType}/recompute`,
        { method: 'POST' },
      )
      setResult(res)
      setPreview(null)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="border border-navy-700 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-brand-400">Recompute Skip Windows</p>
      <p className="text-xs text-navy-500">
        Run this after changing a policy&apos;s type or reset period above (and saving) — it re-buckets
        every active user&apos;s skip history under the currently saved policy. Nothing recomputes
        automatically when you save a policy change.
      </p>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className={LABEL_CLASS}>Billing type</label>
          <select className={SELECT_CLASS} value={billingType}
            onChange={(e) => { setBillingType(e.target.value); setPreview(null); setResult(null) }}>
            {policies.map(p => <option key={p.billingType} value={p.billingType}>{p.billingType}</option>)}
          </select>
        </div>
        <button type="button" onClick={runPreview} disabled={previewing}
          className="text-xs px-3 py-2 rounded-lg bg-navy-800 border border-navy-600 text-navy-300 hover:border-brand-500 hover:text-brand-400 transition-colors disabled:opacity-50">
          {previewing ? 'Checking…' : 'Preview impact'}
        </button>
        {preview && (
          <button type="button" onClick={runApply} disabled={applying}
            className="text-xs px-3 py-2 rounded-lg bg-brand-500 text-navy-950 font-semibold hover:bg-brand-400 transition-colors disabled:opacity-50">
            {applying ? 'Recomputing…' : 'Recompute now'}
          </button>
        )}
      </div>
      {preview && (
        <p className="text-xs text-navy-400">
          {preview.trackedUsers} active user(s) have tracked skip usage under this policy — an estimated{' '}
          {preview.windowWouldChange} would have their window recalculated.
        </p>
      )}
      {result && (
        <p className="text-xs text-teal-400">Recomputed {result.recomputedCount} of {result.totalActive} active user(s).</p>
      )}
    </div>
  )
}

interface SettingsHistoryEditState {
  effectiveFrom: string
  notes: string
  renewalDay: string
  renewalDayUserSet: boolean
  paymentOnStartup: boolean
  signupIncludesCurrentMonth: boolean
  renewalMonthOffset: string
}

function isInitialSentinel(effectiveFrom: string) {
  return new Date(effectiveFrom).getTime() === 0
}

function SettingsHistoryPanel({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<SettingsHistoryEditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: records = [], isLoading } = useQuery<SettingsHistoryRecord[]>({
    queryKey: ['settings-history', slug],
    queryFn: () => authFetch<SettingsHistoryRecord[]>(`/subscriptions/${slug}/settings-history`),
    enabled: open,
  })

  const startEdit = (r: SettingsHistoryRecord) => {
    setEditingId(r.id)
    setEditState({
      effectiveFrom: r.effectiveFrom.slice(0, 10),
      notes: r.notes ?? '',
      renewalDay: r.renewalDay != null ? String(r.renewalDay) : '',
      renewalDayUserSet: r.renewalDayUserSet,
      paymentOnStartup: r.paymentOnStartup,
      signupIncludesCurrentMonth: r.signupIncludesCurrentMonth,
      renewalMonthOffset: String(r.renewalMonthOffset ?? 0),
    })
  }

  const handleEditSave = async (r: SettingsHistoryRecord) => {
    if (!editState) return
    const isSentinel = isInitialSentinel(r.effectiveFrom)
    if (!isSentinel && !isValidCalendarDate(editState.effectiveFrom)) {
      alert('Effective From is not a valid date')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        notes: editState.notes || undefined,
        renewalDay: editState.renewalDay !== '' ? Number(editState.renewalDay) : null,
        renewalDayUserSet: editState.renewalDayUserSet,
        paymentOnStartup: editState.paymentOnStartup,
        signupIncludesCurrentMonth: editState.signupIncludesCurrentMonth,
        renewalMonthOffset: Number(editState.renewalMonthOffset) || 0,
      }
      if (!isSentinel) body.effectiveFrom = editState.effectiveFrom
      await authFetch(`/subscriptions/${slug}/settings-history/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await queryClient.invalidateQueries({ queryKey: ['settings-history', slug] })
      setEditingId(null)
      setEditState(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this settings history entry? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await authFetch(`/subscriptions/${slug}/settings-history/${id}`, { method: 'DELETE' })
      await queryClient.invalidateQueries({ queryKey: ['settings-history', slug] })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  const setField = (field: keyof SettingsHistoryEditState, value: string | boolean) =>
    setEditState(s => s ? { ...s, [field]: value } : s)

  return (
    <div className="border border-navy-700 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-navy-300 hover:text-navy-100 transition-colors"
      >
        <span>⚙️ Settings History ({records.length} records)</span>
        <span className="text-navy-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 text-xs">
          {isLoading ? (
            <p className="text-navy-500">Loading…</p>
          ) : records.length === 0 ? (
            <p className="text-navy-500">No settings history records.</p>
          ) : (
            <div className="overflow-x-auto space-y-1">
              {records.map(r => {
                const sentinel = isInitialSentinel(r.effectiveFrom)
                const isEditing = editingId === r.id
                return (
                  <div key={r.id} className={`border rounded p-2 ${sentinel ? 'border-brand-700/50 bg-brand-950/20' : 'border-navy-800'}`}>
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-navy-300">
                        {sentinel
                          ? '📌 Initial snapshot'
                          : new Date(r.effectiveFrom).toLocaleDateString()}
                      </span>
                      <span className="flex gap-1 shrink-0">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleEditSave(r)}
                              className="text-brand-400 hover:text-brand-200 disabled:opacity-50 px-1"
                            >
                              {saving ? '…' : '✓ Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingId(null); setEditState(null) }}
                              className="text-navy-500 hover:text-navy-300 px-1"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(r)}
                              className="text-navy-500 hover:text-brand-400 transition-colors px-1"
                              title="Edit"
                            >
                              ✏️
                            </button>
                            {!sentinel && (
                              <button
                                type="button"
                                disabled={deletingId === r.id}
                                onClick={() => handleDelete(r.id)}
                                className="text-navy-600 hover:text-red-400 transition-colors disabled:opacity-50 px-1"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    </div>

                    {/* Edit form */}
                    {isEditing && editState ? (
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {!sentinel && (
                          <label className="col-span-2 flex flex-col gap-0.5">
                            <span className="text-navy-500">Effective From</span>
                            <input
                              type="date"
                              value={editState.effectiveFrom}
                              onChange={e => setField('effectiveFrom', e.target.value)}
                              className="bg-navy-800 border border-brand-500 rounded px-1.5 py-0.5 text-navy-100 text-xs"
                            />
                          </label>
                        )}
                        <label className="flex flex-col gap-0.5">
                          <span className="text-navy-500">Renewal Day</span>
                          <input
                            type="number"
                            min={1}
                            max={31}
                            value={editState.renewalDay}
                            onChange={e => setField('renewalDay', e.target.value)}
                            placeholder="null"
                            className="bg-navy-800 border border-navy-600 rounded px-1.5 py-0.5 text-navy-100 text-xs w-20"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-navy-500">Offset (months)</span>
                          <input
                            type="number"
                            min={-11}
                            max={11}
                            value={editState.renewalMonthOffset}
                            onChange={e => setField('renewalMonthOffset', e.target.value)}
                            className="bg-navy-800 border border-navy-600 rounded px-1.5 py-0.5 text-navy-100 text-xs w-20"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editState.renewalDayUserSet}
                            onChange={e => setField('renewalDayUserSet', e.target.checked)}
                            className="accent-brand-500"
                          />
                          <span className="text-navy-400">User-set day</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editState.paymentOnStartup}
                            onChange={e => setField('paymentOnStartup', e.target.checked)}
                            className="accent-brand-500"
                          />
                          <span className="text-navy-400">Prepaid</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editState.signupIncludesCurrentMonth}
                            onChange={e => setField('signupIncludesCurrentMonth', e.target.checked)}
                            className="accent-brand-500"
                          />
                          <span className="text-navy-400">Includes current month</span>
                        </label>
                        <label className="col-span-2 flex flex-col gap-0.5">
                          <span className="text-navy-500">Notes</span>
                          <input
                            type="text"
                            value={editState.notes}
                            onChange={e => setField('notes', e.target.value)}
                            placeholder="Notes…"
                            className="bg-navy-800 border border-navy-600 rounded px-1.5 py-0.5 text-navy-100 text-xs"
                          />
                        </label>
                      </div>
                    ) : (
                      /* Read-only row */
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-navy-500">
                        <span>Day: <span className="text-navy-300">{r.renewalDay ?? '—'}</span></span>
                        <span>Offset: <span className="text-navy-300">{r.renewalMonthOffset ?? 0}</span></span>
                        <span>User-set: <span className="text-navy-300">{r.renewalDayUserSet ? '✓' : '—'}</span></span>
                        <span>Prepaid: <span className="text-navy-300">{r.paymentOnStartup ? '✓' : '—'}</span></span>
                        <span>Curr. month: <span className="text-navy-300">{r.signupIncludesCurrentMonth ? '✓' : '—'}</span></span>
                        {r.notes && <span className="text-navy-500 italic">{r.notes}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Prepay Options Panel ─────────────────────────────────────────────────────

const COMMON_CURRENCIES = ['EUR','GBP','USD','CAD','AUD','CHF','PLN','SEK','NOK','DKK','CZK','HUF']

interface PrepayOption {
  id: string
  months: number
  price: string
  currency: string
  label: string | null
  validFrom: string | null
  validUntil: string | null
  grandfatheredPrice: boolean
}

function PrepayGrandfatheredToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-2 py-1 basis-full">
      <input
        type="checkbox"
        id="prepay-grandfathered-toggle"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 accent-brand-400 cursor-pointer"
      />
      <label htmlFor="prepay-grandfathered-toggle" className="text-xs text-navy-300 cursor-pointer leading-tight">
        <span className="font-medium text-brand-400/90">Grandfathered price</span>
        <span className="text-navy-400"> — subscribers already active before this option started keep whichever price they qualified for; new subscribers pay this price.</span>
      </label>
    </div>
  )
}

function PrepayOptionsPanel({ slug, subscriptionCurrency }: { slug: string; subscriptionCurrency: string }) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newForm, setNewForm] = useState({ months: '', price: '', currency: subscriptionCurrency, label: '', validFrom: '', validUntil: '' })
  const [newGrandfathered, setNewGrandfathered] = useState(false)
  const [editForm, setEditForm] = useState({ months: '', price: '', currency: '', label: '', validFrom: '', validUntil: '' })
  const [editGrandfathered, setEditGrandfathered] = useState(false)
  const [adding, setAdding] = useState(false)

  const validDates = (validFrom: string, validUntil: string): boolean => {
    if (validFrom && !isValidCalendarDate(validFrom)) { alert('Valid From is not a valid date'); return false }
    if (validUntil && !isValidCalendarDate(validUntil)) { alert('Valid Until is not a valid date'); return false }
    return true
  }

  // Admin-only raw list (not the customer-facing /prepay-options, which collapses rows down to
  // one resolved winner per months+currency group) — the admin panel needs to see and edit
  // every row, including ones auto-closed by a more recent option for the same group.
  const { data: options = [], isLoading } = useQuery<PrepayOption[]>({
    queryKey: ['prepay-options-admin', slug],
    queryFn: () => authFetch<PrepayOption[]>(`/subscriptions/${slug}/prepay-options/admin`),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      authFetch(`/subscriptions/${slug}/prepay-options`, {
        method: 'POST',
        body: JSON.stringify({
          months: parseInt(newForm.months, 10),
          price: newForm.price.replace(',', '.'),
          currency: newForm.currency,
          label: newForm.label || undefined,
          validFrom: newForm.validFrom || undefined,
          validUntil: newForm.validUntil || undefined,
          grandfatheredPrice: newGrandfathered,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepay-options-admin', slug] })
      setNewForm({ months: '', price: '', currency: subscriptionCurrency, label: '', validFrom: '', validUntil: '' })
      setNewGrandfathered(false)
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
          price: editForm.price ? editForm.price.replace(',', '.') : undefined,
          currency: editForm.currency || undefined,
          label: editForm.label || null,
          validFrom: editForm.validFrom || null,
          validUntil: editForm.validUntil || null,
          grandfatheredPrice: editGrandfathered,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepay-options-admin', slug] })
      setEditingId(null)
    },
    onError: (err: Error) => alert(`Error: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      authFetch(`/subscriptions/${slug}/prepay-options/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prepay-options-admin', slug] }),
    onError: (err: Error) => alert(`Error: ${err.message}`),
  })

  const startEdit = (o: PrepayOption) => {
    setEditingId(o.id)
    setEditForm({
      months: String(o.months),
      price: o.price,
      currency: o.currency,
      label: o.label ?? '',
      validFrom: o.validFrom ? o.validFrom.slice(0, 10) : '',
      validUntil: o.validUntil ? o.validUntil.slice(0, 10) : '',
    })
    setEditGrandfathered(o.grandfatheredPrice)
  }

  return (
    <div className="border border-navy-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-400">Prepay Options</p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs bg-brand-400 text-navy-950 px-2 py-1 rounded hover:bg-brand-300 transition-colors"
          >
            + Add Option
          </button>
        )}
      </div>

      {isLoading && <p className="text-xs text-navy-500">Loading…</p>}

      {options.length === 0 && !isLoading && !adding && (
        <p className="text-xs text-navy-500 italic">No prepay options yet</p>
      )}

      {options.map((o) =>
        editingId === o.id ? (
          <div key={o.id} className="flex flex-wrap gap-2 items-end bg-navy-800 rounded p-2">
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
              <label className={LABEL_CLASS}>Currency</label>
              <select className={`${INPUT_CLASS} w-24`} value={editForm.currency}
                onChange={(e) => setEditForm((f) => ({ ...f, currency: e.target.value }))}>
                {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                {!COMMON_CURRENCIES.includes(editForm.currency) && editForm.currency && (
                  <option value={editForm.currency}>{editForm.currency}</option>
                )}
              </select>
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
            <PrepayGrandfatheredToggle value={editGrandfathered} onChange={setEditGrandfathered} />
            <div className="flex gap-2 mt-4">
              <button type="button" disabled={updateMutation.isPending}
                onClick={() => { if (validDates(editForm.validFrom, editForm.validUntil)) updateMutation.mutate(o.id) }}
                className="text-xs bg-brand-400 text-navy-950 px-3 py-1.5 rounded hover:bg-brand-300 disabled:opacity-50">
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditingId(null)}
                className="text-xs text-navy-400 hover:text-navy-200">Cancel</button>
            </div>
          </div>
        ) : (
          <div key={o.id} className="flex items-center justify-between gap-2 text-sm text-navy-300 bg-navy-800/50 rounded px-3 py-2">
            <span>
              <span className="font-semibold text-navy-100">{o.label ?? `${o.months} months`}</span>
              {' '}— {o.months} mo · {o.price} <span className="text-navy-400">{o.currency}</span>
              {(o.validFrom || o.validUntil) && (
                <span className="text-xs text-navy-500 ml-2">
                  {o.validFrom ? `from ${o.validFrom.slice(0, 10)}` : ''}
                  {o.validFrom && o.validUntil ? ' · ' : ''}
                  {o.validUntil ? `until ${o.validUntil.slice(0, 10)}` : ''}
                </span>
              )}
              {o.grandfatheredPrice && (
                <span className="text-xs text-brand-400/90 ml-2">Grandfathered</span>
              )}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => startEdit(o)}
                className="text-xs text-brand-400 hover:underline">Edit</button>
              <button type="button" disabled={deleteMutation.isPending}
                onClick={() => { if (confirm('Delete this prepay option?')) deleteMutation.mutate(o.id) }}
                className="text-xs text-red-400 hover:underline disabled:opacity-50">Delete</button>
            </div>
          </div>
        )
      )}

      {adding && (
        <div className="flex flex-wrap gap-2 items-end bg-navy-800 rounded p-2">
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
            <label className={LABEL_CLASS}>Currency *</label>
            <select required className={`${INPUT_CLASS} w-24`} value={newForm.currency}
              onChange={(e) => setNewForm((f) => ({ ...f, currency: e.target.value }))}>
              {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              {!COMMON_CURRENCIES.includes(newForm.currency) && newForm.currency && (
                <option value={newForm.currency}>{newForm.currency}</option>
              )}
            </select>
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
          <PrepayGrandfatheredToggle value={newGrandfathered} onChange={setNewGrandfathered} />
          <div className="flex gap-2 mt-4">
            <button type="button" disabled={createMutation.isPending || !newForm.months || !newForm.price}
              onClick={() => { if (validDates(newForm.validFrom, newForm.validUntil)) createMutation.mutate() }}
              className="text-xs bg-brand-400 text-navy-950 px-3 py-1.5 rounded hover:bg-brand-300 disabled:opacity-50">
              {createMutation.isPending ? 'Adding…' : 'Add'}
            </button>
            <button type="button" onClick={() => setAdding(false)}
              className="text-xs text-navy-400 hover:text-navy-200">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const SS_KEY = 'admin-subs-filter'

export default function AdminSubscriptionsPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const createModal = useModalState()
  const [editSub, setEditSub] = useState<ApiSubscription | null>(null)
  const [editSubLoading, setEditSubLoading] = useState(false)
  const [deleteSub, setDeleteSub] = useState<ApiSubscription | null>(null)
  const PAGE_SIZE = 15

  // Persist filter state in sessionStorage so navigating to months/prices and back restores it
  const [page, setPageState] = useState<number>(() => {
    try { return JSON.parse(sessionStorage.getItem(SS_KEY) ?? '{}').page ?? 1 } catch { return 1 }
  })
  const [search, setSearchState] = useState<string>(() => {
    try { return JSON.parse(sessionStorage.getItem(SS_KEY) ?? '{}').search ?? '' } catch { return '' }
  })
  const [filterCompanyId, setFilterCompanyIdState] = useState<string>(() => {
    try { return JSON.parse(sessionStorage.getItem(SS_KEY) ?? '{}').companyId ?? '' } catch { return '' }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({ page, search, companyId: filterCompanyId }))
    } catch { /* ignore */ }
  }, [page, search, filterCompanyId])

  const setPage = (p: number) => setPageState(p)
  const setSearch = (s: string) => { setSearchState(s); setPageState(1) }
  const setFilterCompanyId = (id: string) => { setFilterCompanyIdState(id); setPageState(1) }

  const isManager = user?.role === 'COMPANY_MANAGER'
  const managerCompanyId = user?.managedCompanyId

  const { data: subsData, isLoading: subsLoading } = useQuery({
    queryKey: ['admin', 'subscriptions', page, isManager ? managerCompanyId : null, search, filterCompanyId],
    queryFn: () => {
      const companyFilter = isManager && managerCompanyId
        ? `&companyId=${managerCompanyId}`
        : filterCompanyId ? `&companyId=${filterCompanyId}` : ''
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : ''
      return authFetch<PaginatedResponse<ApiSubscription>>(`/subscriptions?page=${page}&pageSize=${PAGE_SIZE}&includeHidden=true${companyFilter}${searchParam}`)
    },
    enabled: user !== null,
    placeholderData: keepPreviousData,
  })

  const { data: contentStreamsData } = useQuery({
    queryKey: ['admin', 'subscriptions', 'content-streams'],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiSubscription>>(`/subscriptions?isContentStream=true&includeHidden=true&pageSize=100`),
    enabled: user !== null,
  })

  const { data: allSubsData } = useQuery({
    queryKey: ['admin', 'subscriptions', 'all-for-combo'],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiSubscription>>(`/subscriptions?includeHidden=true&pageSize=500`),
    enabled: user !== null,
  })

  const { data: companiesData } = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () =>
      authFetch<PaginatedResponse<ApiBookBoxCompany> | ApiBookBoxCompany[]>(
        '/companies?page=1&pageSize=100',
      ),
  })

  const subs = subsData?.data ?? []
  const contentStreams = contentStreamsData?.data ?? []
  const allSubs = allSubsData?.data ?? []
  const companies = Array.isArray(companiesData)
    ? companiesData
    : (companiesData as PaginatedResponse<ApiBookBoxCompany> | undefined)?.data ?? []

  const createMutation = useMutation({
    mutationFn: async (form: SubFormData) => {
      const sub = await authFetch<ApiSubscription>('/subscriptions', {
        method: 'POST',
        body: JSON.stringify(formToCreatePayload(form)),
      })
      for (const d of form.skipPoliciesDraft) {
        await authFetch(`/skip-policy/${sub.slug}/policies/${d.billingType}`, {
          method: 'PUT',
          body: JSON.stringify(draftToApiBody(d, d.billingType)),
        })
      }
      return sub
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      createModal.close()
    },
    onError: (err: Error) => alert(`Error creating subscription: ${err.message}`),
  })

  const editMutation = useMutation({
    mutationFn: async ({ slug, form, originalBillingTypes }: { slug: string; form: SubFormData; originalBillingTypes: string[] }) => {
      const sub = await authFetch<ApiSubscription>(`/subscriptions/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify(formToUpdatePayload(form)),
      })
      const draftBillingTypes = new Set(form.skipPoliciesDraft.map(d => d.billingType))
      // Delete policies removed from the list
      for (const bt of originalBillingTypes) {
        if (!draftBillingTypes.has(bt)) {
          await authFetch(`/skip-policy/${slug}/policies/${bt}`, { method: 'DELETE' })
        }
      }
      // Upsert all drafts
      for (const d of form.skipPoliciesDraft) {
        await authFetch(`/skip-policy/${slug}/policies/${d.billingType}`, {
          method: 'PUT',
          body: JSON.stringify(draftToApiBody(d, d.billingType)),
        })
      }
      return sub
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      setEditSub(null)
    },
    onError: (err: Error) => alert(`Error editing subscription: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/subscriptions/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      setDeleteSub(null)
    },
    onError: (err: Error) => alert(`Error deleting subscription: ${err.message}`),
  })

  const commonFormProps = { companies, allSubscriptions: contentStreams, allSubs, user }

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
          <span className="text-brand-400 text-xs font-medium">✓ Merch</span>
        ) : null,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row: ApiSubscription) => (
        <div className="flex flex-col gap-0.5">
          {row.isContentStream ? (
            <span className="text-purple-400 text-xs font-medium">Content Stream</span>
          ) : row.isHidden ? (
            <span className="text-navy-500 text-xs font-medium">Hidden</span>
          ) : row.isDiscontinued ? (
            <span className="text-red-400 text-xs font-medium">Discontinued</span>
          ) : row.isUpcoming ? (
            <span className="text-brand-300 text-xs font-medium">Upcoming</span>
          ) : (
            <span className="text-emerald-400 text-xs font-medium">Active</span>
          )}
          {row.parentSubscriptionId && (() => {
            const parent = contentStreams.find((s) => s.id === row.parentSubscriptionId)
            return (
              <span className="text-sky-400 text-[10px]">
                {row.isBundleSubscription
                  ? `Bundle (${row.intervalMonths}mo) of ${parent?.name ?? row.parentSubscriptionId}`
                  : `Variant of ${parent?.name ?? row.parentSubscriptionId}`}
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
          {row.contentType !== 'SERIES' && !row.isCombo && !row.parentSubscriptionId && (
            <Link
              href={`/admin/subscriptions/${row.slug}/months`}
              className="text-brand-400 text-xs hover:underline"
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
            href={`/admin/subscriptions/${row.slug}/prices`}
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
        <h1 className="text-2xl font-bold text-navy-100">Subscriptions</h1>
        {!createModal.isOpen && !editSub && (
          <button
            onClick={() => createModal.open()}
            className="bg-brand-400 text-navy-950 font-semibold px-4 py-2 rounded-lg hover:bg-brand-300 transition-colors"
          >
            + Add Subscription
          </button>
        )}
      </div>

      {/* Inline Create panel */}
      {createModal.isOpen && (
        <div className="bg-navy-900 border border-navy-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-navy-100">Add Subscription</h2>
            <button onClick={() => createModal.close()} className="text-navy-400 hover:text-navy-200 text-sm transition-colors">✕ Cancel</button>
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
      {editSubLoading && (
        <div className="bg-navy-900 border border-brand-500/30 rounded-2xl p-6 text-center text-navy-400 text-sm">
          Loading subscription…
        </div>
      )}
      {editSub && (
        <div className="bg-navy-900 border border-brand-500/30 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-navy-100">Edit — {editSub.name}</h2>
            <button onClick={() => setEditSub(null)} className="text-navy-400 hover:text-navy-200 text-sm transition-colors">✕ Cancel</button>
          </div>
          <SubscriptionForm
            key={editSub.id}
            {...commonFormProps}
            initial={subToForm(editSub)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={(form) => editMutation.mutate({ slug: editSub.slug, form, originalBillingTypes: (editSub.skipPolicies ?? []).map(p => p.billingType) })}
          />
          <SettingsHistoryPanel slug={editSub.slug} />
          <PrepayOptionsPanel slug={editSub.slug} subscriptionCurrency={editSub.currency} />
          <SkipWindowRecomputePanel slug={editSub.slug} policies={editSub.skipPolicies ?? []} />
        </div>
      )}

      {subsLoading ? (
        <div className="text-navy-400 py-8 text-center">Loading…</div>
      ) : (
        <>
          {/* Search & filter bar */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="search"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => { setSearch(e.target.value) }}
              className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 text-sm focus:outline-none focus:border-brand-400 w-64"
            />
            {!isManager && companies.length > 0 && (
              <select
                value={filterCompanyId}
                onChange={(e) => { setFilterCompanyId(e.target.value) }}
                className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-navy-100 text-sm focus:outline-none focus:border-brand-400"
              >
                <option value="">All companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {(search || filterCompanyId) && (
              <button
                onClick={() => { setSearchState(''); setFilterCompanyIdState(''); setPageState(1) }}
                className="text-xs text-navy-400 hover:text-navy-200"
              >
                ✕ Clear
              </button>
            )}
          </div>
          <DataTable
            columns={columns}
            data={subs}
            onEdit={async (row) => {
              createModal.close()
              setEditSubLoading(true)
              try {
                const full = await authFetch<ApiSubscription>(`/subscriptions/${row.slug}`)
                setEditSub(full)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              } finally {
                setEditSubLoading(false)
              }
            }}
            onDelete={isManager ? undefined : (row) => setDeleteSub(row)}
          />
          <Pagination page={page} totalPages={subsData?.totalPages ?? 1} onPageChange={setPage} total={subsData?.total} />
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
