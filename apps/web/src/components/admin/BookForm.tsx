'use client'

import { useState } from 'react'
import { PersonPicker, type PersonEntry } from '@/components/admin/pickers/PersonPicker'
import { SeriesPicker } from '@/components/admin/pickers/SeriesPicker'
import { GenreTagsPicker } from '@/components/admin/pickers/GenreTagsPicker'

const LBL = 'block text-xs text-stone-400 mb-1'
const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-100 focus:outline-none focus:border-amber-400'

export interface BookFormState {
  title: string
  description: string
  seriesName: string
  volumeNumber: string
  genres: string[]
  authors: PersonEntry[]
}

export const EMPTY_BOOK_FORM: BookFormState = {
  title: '', description: '', seriesName: '', volumeNumber: '',
  genres: [], authors: [],
}

interface Props {
  initial: BookFormState
  onSubmit: (data: BookFormState) => void
  submitting: boolean
  submitLabel: string
  onCancel?: () => void
}

export function BookForm({ initial, onSubmit, submitting, submitLabel, onCancel }: Props) {
  const [form, setForm] = useState<BookFormState>(initial)

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="flex flex-col gap-4">
      <div>
        <label className={LBL}>Title *</label>
        <input required className={INP} value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </div>

      <div>
        <label className={LBL}>Description</label>
        <textarea rows={3} className={INP} value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>

      <div>
        <label className={LBL}>Authors</label>
        <PersonPicker endpoint="authors" placeholder="Search or create author…"
          onAdd={a => {
            if (!form.authors.find(ex => ex.name.toLowerCase() === a.name.toLowerCase()))
              setForm(f => ({ ...f, authors: [...f.authors, a] }))
          }} />
        {form.authors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {form.authors.map((a, i) => (
              <span key={i} className="flex items-center gap-1.5 bg-stone-700 text-stone-200 text-xs px-2.5 py-1 rounded-full">
                {!a.id && <span className="text-amber-400 text-[9px] font-semibold uppercase">new</span>}
                {a.name}
                <button type="button" onClick={() => setForm(f => ({ ...f, authors: f.authors.filter((_, j) => j !== i) }))}
                  className="text-stone-500 hover:text-red-400">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Series</label>
          <SeriesPicker value={form.seriesName} onChange={v => setForm(f => ({ ...f, seriesName: v }))} />
        </div>
        <div>
          <label className={LBL}>Volume / position</label>
          <input type="number" className={INP} value={form.volumeNumber} min={0} step={0.5}
            onChange={e => setForm(f => ({ ...f, volumeNumber: e.target.value }))} />
        </div>
      </div>

      <div>
        <label className={LBL}>Genres</label>
        <GenreTagsPicker genres={form.genres} onChange={v => setForm(f => ({ ...f, genres: v }))} />
      </div>

      <div className={onCancel ? 'flex gap-2 pt-1' : ''}>
        <button type="submit" disabled={submitting}
          className={`${onCancel ? 'flex-1' : 'w-full'} bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors`}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-stone-700 text-stone-300 hover:bg-stone-600 text-sm transition-colors">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
