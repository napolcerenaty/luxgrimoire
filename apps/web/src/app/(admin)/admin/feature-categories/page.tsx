'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { INPUT_CLASS, LABEL_CLASS, BTN_PRIMARY, BTN_GHOST } from '@/lib/adminFormStyles'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

// ─── Types ──────────────────────────────────────────────────────────────────

const GROUPS = ['signed', 'edges', 'cover', 'binding', 'extras', 'interior', 'format'] as const
type Group = typeof GROUPS[number]

interface FeatureCategory {
  id: string
  slug: string
  label: string
  group: string
  isActive: boolean
  sortOrder: number
  includePatterns: string[]
  excludePatterns: string[]
  createdAt: string
  updatedAt: string
}

interface CategoryFormState {
  slug: string
  label: string
  group: string
  isActive: boolean
  sortOrder: number
  includePatterns: string
  excludePatterns: string
}

const EMPTY_FORM: CategoryFormState = {
  slug: '',
  label: '',
  group: 'cover',
  isActive: true,
  sortOrder: 0,
  includePatterns: '',
  excludePatterns: '',
}

// ─── Form ────────────────────────────────────────────────────────────────────

function CategoryForm({
  initial,
  onSubmit,
  onCancel,
  loading,
  error,
}: {
  initial: CategoryFormState
  onSubmit: (data: CategoryFormState) => void
  onCancel: () => void
  loading: boolean
  error?: string
}) {
  const [form, setForm] = useState<CategoryFormState>(initial)
  const set = (k: keyof CategoryFormState, v: string | boolean | number) =>
    setForm(f => ({ ...f, [k]: v }))

  return (
    <form
      onSubmit={e => { e.preventDefault(); onSubmit(form) }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLASS}>Slug *</label>
          <input
            required
            className={INPUT_CLASS}
            placeholder="e.g. foil"
            value={form.slug}
            onChange={e => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Label *</label>
          <input
            required
            className={INPUT_CLASS}
            placeholder="e.g. Foil"
            value={form.label}
            onChange={e => set('label', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLASS}>Group *</label>
          <select
            className={INPUT_CLASS}
            value={form.group}
            onChange={e => set('group', e.target.value)}
          >
            {GROUPS.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>Sort Order</label>
          <input
            type="number"
            min={0}
            className={INPUT_CLASS}
            value={form.sortOrder}
            onChange={e => set('sortOrder', Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS}>
          Include Patterns <span className="text-stone-500">(one regex per line)</span>
        </label>
        <textarea
          rows={5}
          className={`${INPUT_CLASS} font-mono text-xs`}
          placeholder={'\\bfoil\\b\n\\bfoiling\\b'}
          value={form.includePatterns}
          onChange={e => set('includePatterns', e.target.value)}
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>
          Exclude Patterns <span className="text-stone-500">(one regex per line)</span>
        </label>
        <textarea
          rows={3}
          className={`${INPUT_CLASS} font-mono text-xs`}
          placeholder={'\\bgilded edges\\b'}
          value={form.excludePatterns}
          onChange={e => set('excludePatterns', e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={e => set('isActive', e.target.checked)}
          className="accent-amber-400"
        />
        Active (used by tagger)
      </label>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
        <button type="submit" disabled={loading} className={BTN_PRIMARY}>
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function patternsToLines(patterns: string[]): string {
  return patterns.join('\n')
}

function linesToPatterns(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}

function categoryToForm(c: FeatureCategory): CategoryFormState {
  return {
    slug: c.slug,
    label: c.label,
    group: c.group,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    includePatterns: patternsToLines(c.includePatterns),
    excludePatterns: patternsToLines(c.excludePatterns),
  }
}

function formToPayload(f: CategoryFormState) {
  return {
    slug: f.slug,
    label: f.label,
    group: f.group,
    isActive: f.isActive,
    sortOrder: f.sortOrder,
    includePatterns: linesToPatterns(f.includePatterns),
    excludePatterns: linesToPatterns(f.excludePatterns),
  }
}

const GROUP_LABELS: Record<string, string> = {
  signed: '✍️ Signed',
  edges: '🎨 Edges',
  cover: '📕 Cover',
  binding: '📚 Binding',
  extras: '🎁 Extras',
  interior: '📖 Interior',
  format: '📐 Format',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FeatureCategoriesPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editCategory, setEditCategory] = useState<FeatureCategory | null>(null)
  const [deleteCategory, setDeleteCategory] = useState<FeatureCategory | null>(null)
  const [mutationError, setMutationError] = useState<string | undefined>()
  const [showInactive, setShowInactive] = useState(false)
  const [groupFilter, setGroupFilter] = useState<string>('')

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['admin', 'feature-categories', showInactive],
    queryFn: () =>
      authFetch<FeatureCategory[]>(
        `/feature-categories${showInactive ? '?includeInactive=true' : ''}`,
      ),
  })

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      authFetch<FeatureCategory>('/feature-categories', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-categories'] })
      setCreateOpen(false)
      setMutationError(undefined)
    },
    onError: (e: Error) => setMutationError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReturnType<typeof formToPayload> }) =>
      authFetch<FeatureCategory>(`/feature-categories/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-categories'] })
      setEditCategory(null)
      setMutationError(undefined)
    },
    onError: (e: Error) => setMutationError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      authFetch(`/feature-categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-categories'] })
      setDeleteCategory(null)
    },
  })

  // Group categories
  const grouped = categories.reduce<Record<string, FeatureCategory[]>>((acc, c) => {
    if (groupFilter && c.group !== groupFilter) return acc
    ;(acc[c.group] ??= []).push(c)
    return acc
  }, {})

  const allGroups = Array.from(
    new Set([...GROUPS, ...Object.keys(grouped)])
  ).filter(g => g in grouped)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Feature Categories</h1>
          <p className="text-stone-400 text-sm mt-1">
            Manage normalization categories for edition feature tags.
          </p>
        </div>
        <button
          onClick={() => { setMutationError(undefined); setCreateOpen(true) }}
          className={BTN_PRIMARY}
        >
          + New Category
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <select
          value={groupFilter}
          onChange={e => setGroupFilter(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-300 focus:outline-none focus:border-amber-400 text-sm"
        >
          <option value="">All groups</option>
          {GROUPS.map(g => (
            <option key={g} value={g}>{GROUP_LABELS[g] ?? g}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-stone-400 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="accent-amber-400"
          />
          Show inactive
        </label>
        <span className="text-stone-500 text-sm">{categories.length} categories</span>
      </div>

      {/* Table by group */}
      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : allGroups.length === 0 ? (
        <div className="text-stone-500 py-8 text-center">
          No categories yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-6">
          {allGroups.map(group => (
            <section key={group}>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-2 px-1">
                {GROUP_LABELS[group] ?? group}
              </h2>
              <div className="rounded-2xl border border-stone-800 overflow-x-auto">
                <table className="w-full text-sm text-stone-200">
                  <thead>
                    <tr className="border-b border-stone-800 bg-stone-900/80">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Slug</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Label</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Include patterns</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Excl.</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Order</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Status</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(grouped[group] ?? []).map(cat => (
                      <tr
                        key={cat.id}
                        className={`border-b border-stone-800/50 hover:bg-stone-800/40 transition-colors ${
                          !cat.isActive ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono text-amber-400 text-xs whitespace-nowrap">{cat.slug}</td>
                        <td className="px-4 py-2.5 text-stone-200">{cat.label}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {cat.includePatterns.slice(0, 3).map((p, i) => (
                              <code key={i} className="text-xs bg-stone-800 px-1.5 py-0.5 rounded text-stone-300 font-mono">
                                {p.length > 30 ? p.slice(0, 30) + '…' : p}
                              </code>
                            ))}
                            {cat.includePatterns.length > 3 && (
                              <span className="text-xs text-stone-500">+{cat.includePatterns.length - 3} more</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-stone-500 text-xs">{cat.excludePatterns.length}</td>
                        <td className="px-4 py-2.5 text-stone-400 text-xs">{cat.sortOrder}</td>
                        <td className="px-4 py-2.5">
                          {cat.isActive
                            ? <span className="text-xs text-emerald-400">Active</span>
                            : <span className="text-xs text-stone-500">Inactive</span>
                          }
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setMutationError(undefined); setEditCategory(cat) }}
                              className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteCategory(cat)}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors"
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
            </section>
          ))}
        </div>
      )}

      {/* Create modal */}
      <FormModal open={createOpen} title="New Feature Category" onClose={() => setCreateOpen(false)}>
        <CategoryForm
          initial={EMPTY_FORM}
          onSubmit={f => createMutation.mutate(formToPayload(f))}
          onCancel={() => setCreateOpen(false)}
          loading={createMutation.isPending}
          error={mutationError}
        />
      </FormModal>

      {/* Edit modal */}
      <FormModal
        open={editCategory !== null}
        title={`Edit: ${editCategory?.slug ?? ''}`}
        onClose={() => setEditCategory(null)}
      >
        {editCategory && (
          <CategoryForm
            initial={categoryToForm(editCategory)}
            onSubmit={f => updateMutation.mutate({ id: editCategory.id, payload: formToPayload(f) })}
            onCancel={() => setEditCategory(null)}
            loading={updateMutation.isPending}
            error={mutationError}
          />
        )}
      </FormModal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteCategory !== null}
        message={`Delete category "${deleteCategory?.label}"? This will also remove all edition feature tags using this category.`}
        onConfirm={() => deleteCategory && deleteMutation.mutate(deleteCategory.id)}
        onCancel={() => setDeleteCategory(null)}
      />
    </div>
  )
}
