'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getFeeTemplates,
  createFeeTemplate,
  updateFeeTemplate,
  deleteFeeTemplate,
} from '@/lib/api'
import type { ApiFeeTemplate, FeeCategory } from '@luxgrimoire/shared-types'
import { Loader2, Plus, Pencil, Trash2, Check, X, ArchiveRestore, Archive } from 'lucide-react'

import { parseDecimalInput } from '@/lib/parseDecimalInput'

const CATEGORIES: { value: FeeCategory; label: string }[] = [
  { value: 'VAT', label: 'VAT' },
  { value: 'CUSTOMS', label: 'Customs' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'FORWARDING', label: 'Forwarding' },
  { value: 'OTHER', label: 'Other' },
]

const CATEGORY_COLORS: Record<FeeCategory, string> = {
  VAT: 'bg-blue-900/60 text-blue-300',
  CUSTOMS: 'bg-purple-900/60 text-purple-300',
  PROCESSING: 'bg-orange-900/60 text-orange-300',
  FORWARDING: 'bg-cyan-900/60 text-cyan-300',
  OTHER: 'bg-stone-700 text-stone-300',
}

interface TemplateFormState {
  name: string
  category: FeeCategory
  defaultAmount: string
  defaultCurrency: string
}

const emptyForm = (): TemplateFormState => ({
  name: '',
  category: 'OTHER',
  defaultAmount: '',
  defaultCurrency: 'PLN',
})

export default function FeeTemplateManager() {
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<TemplateFormState>(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TemplateFormState>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)

  const { data: templates = [], isLoading } = useQuery<ApiFeeTemplate[]>({
    queryKey: ['fee-templates'],
    queryFn: () => getFeeTemplates(),
    retry: false,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createFeeTemplate({
        name: addForm.name.trim(),
        category: addForm.category,
        defaultAmount: addForm.defaultAmount ? parseDecimalInput(addForm.defaultAmount) : undefined,
        defaultCurrency: addForm.defaultCurrency.trim() || 'PLN',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fee-templates'] })
      setAddForm(emptyForm())
      setShowAddForm(false)
      setFormError(null)
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateFeeTemplate>[1] }) =>
      updateFeeTemplate(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fee-templates'] })
      setEditingId(null)
      setFormError(null)
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFeeTemplate(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['fee-templates'] }),
  })

  const startEdit = (t: ApiFeeTemplate) => {
    setEditingId(t.id)
    setEditForm({
      name: t.name,
      category: t.category,
      defaultAmount: t.defaultAmount != null ? String(t.defaultAmount) : '',
      defaultCurrency: t.defaultCurrency,
    })
    setFormError(null)
  }

  const saveEdit = (id: string) => {
    updateMutation.mutate({
      id,
      data: {
        name: editForm.name.trim(),
        category: editForm.category,
        defaultAmount: editForm.defaultAmount ? parseDecimalInput(editForm.defaultAmount) : null,
        defaultCurrency: editForm.defaultCurrency.trim() || 'PLN',
      },
    })
  }

  const toggleActive = (t: ApiFeeTemplate) => {
    updateMutation.mutate({ id: t.id, data: { isActive: !t.isActive } })
  }

  const inputCls =
    'w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-1.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors'
  const selectCls =
    'bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400 transition-colors'

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-serif font-semibold text-stone-100 text-lg">Fee Templates</h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Reusable templates for recurring fees &amp; taxes
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setFormError(null) }}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-3 py-1.5 rounded-xl text-sm transition-colors"
        >
          <Plus size={14} />
          Add template
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-stone-800/60 border border-stone-700 rounded-xl p-4 mb-4 space-y-3">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">New template</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-400 mb-1">Name *</label>
              <input
                type="text"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="e.g. EU VAT 23%"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Category</label>
              <select
                value={addForm.category}
                onChange={(e) => setAddForm({ ...addForm, category: e.target.value as FeeCategory })}
                className={`${selectCls} w-full`}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Default amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={addForm.defaultAmount}
                onChange={(e) => setAddForm({ ...addForm, defaultAmount: e.target.value })}
                placeholder="Optional"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Currency</label>
              <input
                type="text"
                value={addForm.defaultCurrency}
                onChange={(e) => setAddForm({ ...addForm, defaultCurrency: e.target.value.toUpperCase() })}
                placeholder="PLN"
                maxLength={5}
                className={inputCls}
              />
            </div>
          </div>
          {formError && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded px-2 py-1">{formError}</p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowAddForm(false); setAddForm(emptyForm()); setFormError(null) }}
              className="px-3 py-1.5 text-sm text-stone-400 hover:text-stone-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !addForm.name.trim()}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors"
            >
              {createMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-stone-400 text-sm py-4">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-stone-500 py-4">No templates yet. Add one above.</p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className={`border rounded-xl p-3 transition-colors ${
                t.isActive ? 'border-stone-700 bg-stone-800/40' : 'border-stone-800 bg-stone-900/40 opacity-60'
              }`}
            >
              {editingId === t.id ? (
                /* Edit inline */
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className={inputCls}
                    />
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value as FeeCategory })}
                      className={`${selectCls} w-full`}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.defaultAmount}
                      onChange={(e) => setEditForm({ ...editForm, defaultAmount: e.target.value })}
                      placeholder="Amount"
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={editForm.defaultCurrency}
                      onChange={(e) => setEditForm({ ...editForm, defaultCurrency: e.target.value.toUpperCase() })}
                      maxLength={5}
                      className={inputCls}
                    />
                  </div>
                  {formError && (
                    <p className="text-xs text-red-400">{formError}</p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 text-stone-400 hover:text-stone-200 transition-colors"
                      title="Cancel"
                    >
                      <X size={15} />
                    </button>
                    <button
                      onClick={() => saveEdit(t.id)}
                      disabled={updateMutation.isPending}
                      className="p-1 text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
                      title="Save"
                    >
                      {updateMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    </button>
                  </div>
                </div>
              ) : (
                /* View row */
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-stone-100 truncate">{t.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[t.category]}`}>
                        {t.category}
                      </span>
                      {!t.isActive && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-stone-700 text-stone-400">
                          Archived
                        </span>
                      )}
                    </div>
                    {t.defaultAmount != null && (
                      <p className="text-xs text-stone-400 mt-0.5">
                        {t.defaultAmount} {t.defaultCurrency}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleActive(t)}
                      className="p-1.5 text-stone-500 hover:text-amber-400 transition-colors rounded"
                      title={t.isActive ? 'Archive' : 'Unarchive'}
                    >
                      {t.isActive ? <Archive size={14} /> : <ArchiveRestore size={14} />}
                    </button>
                    <button
                      onClick={() => startEdit(t)}
                      className="p-1.5 text-stone-500 hover:text-amber-400 transition-colors rounded"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(t.id)}
                      disabled={deleteMutation.isPending}
                      className="p-1.5 text-stone-500 hover:text-red-400 transition-colors rounded disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
