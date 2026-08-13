'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Icons from 'lucide-react'
import type { ComponentType } from 'react'
import { authFetch } from '@/lib/authFetch'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { BTN_GHOST, BTN_PRIMARY, LBL, INP } from '@/lib/adminFormStyles'

interface HomepageFeature {
  id: string
  title: string
  description: string
  iconName: string
  ctaLabel: string | null
  ctaHref: string | null
  sortOrder: number
  isActive: boolean
}

interface FeatureFormState {
  title: string
  description: string
  iconName: string
  ctaLabel: string
  ctaHref: string
  sortOrder: number
  isActive: boolean
}

const ICON_OPTIONS = ['BookOpen', 'Bell', 'BarChart2', 'Heart', 'Star', 'Bookmark', 'Library', 'Package', 'ShoppingBag', 'Calendar', 'Search', 'Users', 'Zap', 'Trophy', 'Gift', 'Sparkles', 'Tag', 'Lock', 'Globe', 'Layers']

function LucideIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = (Icons as unknown as Record<string, ComponentType<{ size?: number }>>)[name] ?? Icons.Star
  return <Icon size={size} />
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={LBL}>Icon</label>
      <div className="grid grid-cols-5 gap-2 rounded-lg border border-navy-700 bg-navy-950 p-2">
        {ICON_OPTIONS.map((icon) => (
          <button
            key={icon}
            type="button"
            title={icon}
            onClick={() => onChange(icon)}
            className={`flex flex-col items-center gap-1 rounded-lg p-2 text-center transition-colors ${
              value === icon
                ? 'bg-brand-600 text-navy-950'
                : 'text-navy-400 hover:bg-navy-800 hover:text-navy-200'
            }`}
          >
            <LucideIcon name={icon} />
            <span className="text-[9px] leading-none">{icon}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const EMPTY_FORM: FeatureFormState = {
  title: '',
  description: '',
  iconName: 'Star',
  ctaLabel: '',
  ctaHref: '',
  sortOrder: 0,
  isActive: true,
}

function FeatureForm({
  initial,
  loading,
  error,
  onSubmit,
  onCancel,
}: {
  initial: FeatureFormState
  loading: boolean
  error?: string
  onSubmit: (data: FeatureFormState) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FeatureFormState>(initial)

  const setField = <K extends keyof FeatureFormState>(key: K, value: FeatureFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(form)
      }}
      className="space-y-4"
    >
      <div>
        <label className={LBL}>Title</label>
        <input
          required
          className={INP}
          value={form.title}
          onChange={(event) => setField('title', event.target.value)}
        />
      </div>

      <div>
        <label className={LBL}>Description</label>
        <textarea
          required
          rows={4}
          className={INP}
          value={form.description}
          onChange={(event) => setField('description', event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <IconPicker value={form.iconName} onChange={(v) => setField('iconName', v)} />

        <div>
          <label className={LBL}>Sort order</label>
          <input
            type="number"
            className={INP}
            value={form.sortOrder}
            onChange={(event) => setField('sortOrder', Number(event.target.value))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LBL}>CTA label <span className="text-navy-500">(optional)</span></label>
          <input
            className={INP}
            placeholder="e.g. Get started free"
            value={form.ctaLabel}
            onChange={(event) => setField('ctaLabel', event.target.value)}
          />
        </div>

        <div>
          <label className={LBL}>CTA href <span className="text-navy-500">(optional)</span></label>
          <input
            className={INP}
            placeholder="e.g. /register"
            value={form.ctaHref}
            onChange={(event) => setField('ctaHref', event.target.value)}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-navy-300">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => setField('isActive', event.target.checked)}
        />
        Active
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={BTN_GHOST}>
          Cancel
        </button>
        <button type="submit" disabled={loading} className={BTN_PRIMARY}>
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

export default function HomepageFeaturesAdminPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<HomepageFeature | null>(null)
  const [deleting, setDeleting] = useState<HomepageFeature | null>(null)
  const [formError, setFormError] = useState<string>()

  const { data: features = [], isLoading } = useQuery<HomepageFeature[]>({
    queryKey: ['admin', 'homepage-features'],
    queryFn: () => authFetch<HomepageFeature[]>('/homepage-features/admin'),
  })

  const orderedFeatures = useMemo(
    () => [...features].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)),
    [features],
  )

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'homepage-features'] })

  const createMutation = useMutation({
    mutationFn: (payload: FeatureFormState) => authFetch<HomepageFeature>('/homepage-features', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        ctaLabel: payload.ctaLabel.trim() || null,
        ctaHref: payload.ctaHref.trim() || null,
      }),
    }),
    onSuccess: async () => {
      setCreateOpen(false)
      setFormError(undefined)
      await invalidate()
    },
    onError: (error: unknown) => setFormError(error instanceof Error ? error.message : 'Failed to create feature'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<FeatureFormState> & { ctaLabel?: string | null; ctaHref?: string | null } }) =>
      authFetch<HomepageFeature>(`/homepage-features/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setEditing(null)
      setFormError(undefined)
      await invalidate()
    },
    onError: (error: unknown) => setFormError(error instanceof Error ? error.message : 'Failed to update feature'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/homepage-features/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDeleting(null)
      await invalidate()
    },
  })

  const updateSortMutation = useMutation({
    mutationFn: ({ id, sortOrder }: { id: string; sortOrder: number }) =>
      authFetch<HomepageFeature>(`/homepage-features/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sortOrder }),
      }),
    onSuccess: invalidate,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      authFetch<HomepageFeature>(`/homepage-features/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: invalidate,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-100">Homepage Features</h1>
          <p className="mt-1 text-sm text-navy-400">Manage the homepage feature carousel and CTA cards.</p>
        </div>
        <button
          onClick={() => {
            setFormError(undefined)
            setCreateOpen(true)
          }}
          className={BTN_PRIMARY}
        >
          Add Feature
        </button>
      </div>

      <div className="grid gap-4">
        {isLoading && (
          <div className="rounded-2xl border border-navy-800 bg-navy-900 p-6 text-sm text-navy-400">
            Loading…
          </div>
        )}

        {!isLoading && orderedFeatures.length === 0 && (
          <div className="rounded-2xl border border-dashed border-navy-700 bg-navy-900/70 p-8 text-center text-sm text-navy-400">
            No homepage features yet.
          </div>
        )}

        {orderedFeatures.map((feature) => (
          <div
            key={feature.id}
            className="rounded-2xl border border-navy-800 bg-navy-900 p-5"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-navy-800 px-2.5 py-1 text-xs text-navy-300">
                    {feature.iconName}
                  </span>
                  <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs text-brand-300">
                    sort {feature.sortOrder}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-navy-100">{feature.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-navy-400">{feature.description}</p>
                <p className="mt-3 text-xs text-navy-500">
                  {feature.ctaHref ? `CTA: ${feature.ctaLabel ?? '—'} → ${feature.ctaHref}` : 'No CTA link'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center overflow-hidden rounded-lg border border-navy-700">
                  <button
                    onClick={() => updateSortMutation.mutate({ id: feature.id, sortOrder: feature.sortOrder - 1 })}
                    className="px-3 py-2 text-navy-300 transition-colors hover:bg-navy-800 hover:text-navy-100"
                    aria-label={`Move ${feature.title} up`}
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => updateSortMutation.mutate({ id: feature.id, sortOrder: feature.sortOrder + 1 })}
                    className="border-l border-navy-700 px-3 py-2 text-navy-300 transition-colors hover:bg-navy-800 hover:text-navy-100"
                    aria-label={`Move ${feature.title} down`}
                  >
                    ▼
                  </button>
                </div>

                <label className="flex items-center gap-2 rounded-lg border border-navy-700 px-3 py-2 text-sm text-navy-300">
                  <input
                    type="checkbox"
                    checked={feature.isActive}
                    onChange={(event) => toggleMutation.mutate({ id: feature.id, isActive: event.target.checked })}
                  />
                  Active
                </label>

                <button
                  onClick={() => {
                    setFormError(undefined)
                    setEditing(feature)
                  }}
                  className={BTN_GHOST}
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleting(feature)}
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <FormModal open={createOpen} title="Add Homepage Feature" onClose={() => setCreateOpen(false)}>
        <FeatureForm
          initial={EMPTY_FORM}
          loading={createMutation.isPending}
          error={formError}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
        />
      </FormModal>

      <FormModal open={editing !== null} title="Edit Homepage Feature" onClose={() => setEditing(null)}>
        {editing && (
          <FeatureForm
            initial={{
              title: editing.title,
              description: editing.description,
              iconName: editing.iconName,
              ctaLabel: editing.ctaLabel ?? '',
              ctaHref: editing.ctaHref ?? '',
              sortOrder: editing.sortOrder,
              isActive: editing.isActive,
            }}
            loading={updateMutation.isPending}
            error={formError}
            onCancel={() => setEditing(null)}
            onSubmit={(payload) => updateMutation.mutate({ id: editing.id, payload: {
              ...payload,
              ctaLabel: payload.ctaLabel.trim() || null as unknown as string,
              ctaHref: payload.ctaHref.trim() || null as unknown as string,
            } })}
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleting !== null}
        message={deleting ? `Delete "${deleting.title}"?` : ''}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  )
}
