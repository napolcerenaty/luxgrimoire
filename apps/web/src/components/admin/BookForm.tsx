'use client'

import { useState } from 'react'
import { PersonPicker, type PersonEntry } from '@/components/admin/pickers/PersonPicker'
import { SeriesPicker } from '@/components/admin/pickers/SeriesPicker'
import { GenreTagsPicker } from '@/components/admin/pickers/GenreTagsPicker'
import { authFetch } from '@/lib/authFetch'

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

export interface AiBookResult {
  title?: string
  authors?: { name: string }[]
  seriesName?: string
  volumeNumber?: number
  description?: string
  genres?: string[]
}

export function GoodreadsParser({ onResult }: { onResult: (data: AiBookResult) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleParse() {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    try {
      const data = await authFetch<AiBookResult>('/ai/parse-book', {
        method: 'POST',
        body: JSON.stringify({ text }),
      })
      onResult(data)
      setOpen(false)
      setText('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 border border-dashed border-stone-600 rounded-lg px-3 py-2 text-sm text-stone-400 hover:border-amber-500 hover:text-amber-400 transition-colors">
        🤖 Parse from Goodreads
      </button>
    )
  }

  return (
    <div className="border border-stone-700 rounded-xl p-3 flex flex-col gap-2 bg-stone-900/50">
      <p className="text-xs text-stone-400">Paste text copied from a Goodreads book page:</p>
      <textarea
        autoFocus
        rows={6}
        className={`${INP} font-mono text-xs`}
        placeholder={'Deception Duet #2\nDeath Wish\n\nK. Webster\n3.66\n...\n\nGenres\nDark Romance\n...'}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={handleParse} disabled={loading || !text.trim()}
          className="flex-1 bg-amber-400 text-stone-950 font-semibold px-3 py-1.5 rounded-lg text-sm hover:bg-amber-300 disabled:opacity-50 transition-colors">
          {loading ? 'Parsing…' : 'Fill form'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setText(''); setError(null) }}
          className="px-3 py-1.5 rounded-lg bg-stone-700 text-stone-300 hover:bg-stone-600 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

export function BookForm({ initial, onSubmit, submitting, submitLabel, onCancel }: Props) {
  const [form, setForm] = useState<BookFormState>(initial)

  function applyParserResult(data: AiBookResult) {
    const patch: Partial<BookFormState> = {}
    if (data.title) patch.title = data.title
    if (data.description) patch.description = data.description
    if (data.seriesName) patch.seriesName = data.seriesName
    if (data.volumeNumber != null) patch.volumeNumber = String(data.volumeNumber)
    if (Array.isArray(data.genres) && data.genres.length) patch.genres = data.genres.slice(0, 5)
    if (Array.isArray(data.authors) && data.authors.length) patch.authors = data.authors.map(a => ({ name: a.name }))
    setForm(f => ({ ...f, ...patch }))
  }

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="flex flex-col gap-4">
      <GoodreadsParser onResult={applyParserResult} />
      <div>
        <label className={LBL}>Title *</label>
        <input required className={INP} value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </div>

      <div>
        <label className={LBL}>Description</label>
        <textarea rows={3} className={`${INP} resize-y min-h-[4.5rem]`} value={form.description}
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
