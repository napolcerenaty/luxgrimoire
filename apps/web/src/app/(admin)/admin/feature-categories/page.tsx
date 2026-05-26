'use client'

import { useState, useMemo } from 'react'
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

// ─── Pattern helpers ─────────────────────────────────────────────────────────

/**
 * Converts a plain phrase entered by a non-programmer into a regex pattern.
 * e.g. "foil"         → \bfoil\w*\b
 *      "hand signed"  → \bhand[\s\-]*signed\w*\b
 *      "UV-spot"      → \bUV[\s\-]*spot\w*\b
 */
function phraseToRegex(phrase: string): string {
  const words = phrase.trim().split(/[\s\-]+/).filter(Boolean)
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return `\\b${escaped.join('[\\s\\-]*')}\\b`
}

/**
 * Strips regex syntax to produce a human-readable keyword string.
 * e.g.  \bfoil\w*\b  →  "foil…"
 *       \bhand.?signed\b  →  "hand signed"
 *       \bbound.?in author letter with.{0,10}digital signature\b  →  "bound in author letter with … digital signature"
 */
function simplifyPattern(raw: string): string {
  return raw
    .replace(/\\b/g, '')                           // word boundaries
    .replace(/\\.?\{0,\d+\}/g, ' … ')              // .{0,N}
    .replace(/\\w[\*\+\?]*/g, '…')                 // \w* \w+ \w?
    .replace(/\(\?:[^)]+\)/g, m =>                 // (?:a|b) → a/b
      m.slice(3, -1).replace(/\|/g, '/'))
    .replace(/\[^[^\]]+\]/g, '…')                  // [^x]
    .replace(/\\\./g, '.')                          // \. → literal dot
    .replace(/\\[a-z]/g, '')                        // remaining \x escapes
    .replace(/\.[\?]/g, ' ')                        // .? → space
    .replace(/\.\*/g, '…')                          // .* → …
    .replace(/\.\+/g, '…')                          // .+ → …
    .replace(/[\[\]()?+*]/g, '')                    // stray metacharacters
    .replace(/\|/g, '/')                            // alternatives
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*…\s*/g, '…')
    .trim()
}

/** Try to compile a regex; return null if invalid */
function tryRegex(pattern: string): RegExp | null {
  try { return new RegExp(pattern, 'i') } catch { return null }
}

/** Quick phrase → regex adder. Appends generated pattern to a textarea. */
function QuickAddPhrase({
  onAdd,
  placeholder,
}: {
  onAdd: (regex: string) => void
  placeholder?: string
}) {
  const [phrase, setPhrase] = useState('')

  const submit = () => {
    const trimmed = phrase.trim()
    if (!trimmed) return
    onAdd(phraseToRegex(trimmed))
    setPhrase('')
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        className="flex-1 bg-stone-800/60 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20"
        placeholder={placeholder ?? 'Type a phrase and press Enter…'}
        value={phrase}
        onChange={e => setPhrase(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!phrase.trim()}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-700 text-stone-200 hover:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
      >
        + Add
      </button>
    </div>
  )
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
  const [testValue, setTestValue] = useState('')
  const [showRegex, setShowRegex] = useState(false)

  const set = (k: keyof CategoryFormState, v: string | boolean | number) =>
    setForm(f => ({ ...f, [k]: v }))

  // ── Live pattern test ──────────────────────────────────────────────────────
  const testResult = useMemo(() => {
    const val = testValue.trim()
    if (!val) return null
    const includes = linesToPatterns(form.includePatterns)
    const excludes = linesToPatterns(form.excludePatterns)
    const matchedIncludes = includes.filter(p => tryRegex(p)?.test(val) ?? false)
    const matchedExcludes = excludes.filter(p => tryRegex(p)?.test(val) ?? false)
    const wouldMatch = matchedIncludes.length > 0 && matchedExcludes.length === 0
    return { matchedIncludes, matchedExcludes, wouldMatch }
  }, [testValue, form.includePatterns, form.excludePatterns])

  // ── Pattern preview ────────────────────────────────────────────────────────
  const includeKeywords = useMemo(
    () => linesToPatterns(form.includePatterns).map(simplifyPattern).filter(Boolean),
    [form.includePatterns]
  )
  const excludeKeywords = useMemo(
    () => linesToPatterns(form.excludePatterns).map(simplifyPattern).filter(Boolean),
    [form.excludePatterns]
  )

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

      {/* Pattern mode toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500">
          Patterns — type a phrase and press Enter, or edit regex directly below
        </span>
        <button
          type="button"
          onClick={() => setShowRegex(v => !v)}
          className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
        >
          {showRegex ? '👁 Hide regex' : '⌨️ Show raw regex'}
        </button>
      </div>

      <div className="space-y-1.5">
        <label className={LABEL_CLASS}>
          Matches when feature value contains…
        </label>
        {/* Quick phrase adder */}
        <QuickAddPhrase
          placeholder='e.g. "foil" or "hand signed"'
          onAdd={regex => set('includePatterns', form.includePatterns
            ? form.includePatterns + '\n' + regex
            : regex
          )}
        />
        {/* Keyword preview pills */}
        {includeKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {includeKeywords.map((kw, i) => (
              <span key={i} className="text-xs bg-emerald-900/40 border border-emerald-700/40 text-emerald-300 px-2 py-0.5 rounded-full">
                {kw}
              </span>
            ))}
          </div>
        )}
        {/* Raw regex textarea (advanced) */}
        {showRegex && (
          <textarea
            rows={5}
            className={`${INPUT_CLASS} font-mono text-xs`}
            placeholder={'\\bfoil\\w*\\b\n\\bfoiling\\b'}
            value={form.includePatterns}
            onChange={e => set('includePatterns', e.target.value)}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <label className={LABEL_CLASS}>
          Do NOT tag if value also contains…
          <span className="text-stone-500 font-normal ml-1 text-xs">(exclusions)</span>
        </label>
        <QuickAddPhrase
          placeholder='e.g. "gilded edges"'
          onAdd={regex => set('excludePatterns', form.excludePatterns
            ? form.excludePatterns + '\n' + regex
            : regex
          )}
        />
        {excludeKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {excludeKeywords.map((kw, i) => (
              <span key={i} className="text-xs bg-red-900/40 border border-red-700/40 text-red-300 px-2 py-0.5 rounded-full">
                🚫 {kw}
              </span>
            ))}
          </div>
        )}
        {showRegex && (
          <textarea
            rows={3}
            className={`${INPUT_CLASS} font-mono text-xs`}
            placeholder={'\\bgilded\\b'}
            value={form.excludePatterns}
            onChange={e => set('excludePatterns', e.target.value)}
          />
        )}
      </div>

      {/* ── Test panel ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-stone-700 bg-stone-900/60 p-3 space-y-2">
        <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
          🧪 Test a value
        </label>
        <input
          type="text"
          className={`${INPUT_CLASS} text-sm`}
          placeholder="e.g. exclusive foiled edges with a hidden illustration"
          value={testValue}
          onChange={e => setTestValue(e.target.value)}
        />

        {testResult && (
          <div className="space-y-2 pt-1">
            {/* Verdict */}
            <div className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${
              testResult.wouldMatch
                ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40'
                : 'bg-red-900/40 text-red-300 border border-red-700/40'
            }`}>
              {testResult.wouldMatch
                ? '✅ Would be tagged as this category'
                : testResult.matchedExcludes.length > 0
                  ? '🚫 Excluded — matched an exclude pattern'
                  : '❌ No include pattern matched'}
            </div>

            {/* Matched includes */}
            {testResult.matchedIncludes.length > 0 && (
              <div>
                <p className="text-xs text-stone-500 mb-1">Matched include patterns:</p>
                <div className="flex flex-wrap gap-1">
                  {testResult.matchedIncludes.map((p, i) => (
                    <code key={i} className="text-xs bg-emerald-900/30 border border-emerald-700/30 text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                      {p}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* Matched excludes */}
            {testResult.matchedExcludes.length > 0 && (
              <div>
                <p className="text-xs text-stone-500 mb-1">Triggered exclude patterns:</p>
                <div className="flex flex-wrap gap-1">
                  {testResult.matchedExcludes.map((p, i) => (
                    <code key={i} className="text-xs bg-red-900/30 border border-red-700/30 text-red-400 px-1.5 py-0.5 rounded font-mono">
                      {p}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {!testResult && (
          <p className="text-xs text-stone-600">Enter any feature value above to test if it matches.</p>
        )}
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

// ─── Pattern pill (table view) ────────────────────────────────────────────────

function PatternPills({ patterns, variant }: { patterns: string[]; variant: 'include' | 'exclude' }) {
  const [expanded, setExpanded] = useState(false)
  const keywords = patterns.map(simplifyPattern).filter(Boolean)
  const visible = expanded ? keywords : keywords.slice(0, 3)
  const rest = keywords.length - 3

  const pillClass = variant === 'include'
    ? 'bg-stone-800 text-stone-300 border border-stone-700/50'
    : 'bg-red-950/40 text-red-400 border border-red-800/40'

  if (keywords.length === 0) return <span className="text-stone-600 text-xs">—</span>

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visible.map((kw, i) => (
        <span key={i} className={`text-xs px-1.5 py-0.5 rounded-full ${pillClass}`} title={patterns[i]}>
          {variant === 'exclude' && <span className="opacity-60 mr-0.5">🚫</span>}
          {kw}
        </span>
      ))}
      {!expanded && rest > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-stone-500 hover:text-stone-300 transition-colors"
        >
          +{rest} more
        </button>
      )}
      {expanded && keywords.length > 3 && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-stone-500 hover:text-stone-300 transition-colors"
        >
          less
        </button>
      )}
    </div>
  )
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
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Label</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Matches when value contains…</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">Excluded if contains…</th>
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
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-stone-200">{cat.label}</div>
                          <div className="text-xs text-stone-500 font-mono mt-0.5">{cat.slug}</div>
                        </td>
                        <td className="px-4 py-2.5 max-w-xs">
                          <PatternPills patterns={cat.includePatterns} variant="include" />
                        </td>
                        <td className="px-4 py-2.5 max-w-xs">
                          <PatternPills patterns={cat.excludePatterns} variant="exclude" />
                        </td>
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
        title={`Edit: ${editCategory?.label ?? ''}`}
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
