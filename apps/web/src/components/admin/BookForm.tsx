'use client'

import { useId, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PersonPicker, type PersonEntry } from '@/components/admin/pickers/PersonPicker'
import { SeriesPicker } from '@/components/admin/pickers/SeriesPicker'
import { GenreTagsPicker } from '@/components/admin/pickers/GenreTagsPicker'
import { authFetch } from '@/lib/authFetch'
import { INP, LBL } from '@/lib/adminFormStyles'
import { formatVolumeNumbers, parseVolumeNumbers } from '@/lib/volumeNumbers'

const BTN_SM = 'px-2 py-1 rounded-lg text-xs font-medium transition-colors'

export interface SeriesEntryFormState {
  seriesName: string
  /** Comma-separated, e.g. "0.5, 2" for an omnibus spanning non-contiguous volumes. */
  volumeNumbers: string
  isPrimary: boolean
}

export interface BookFormState {
  title: string
  description: string
  seriesEntries: SeriesEntryFormState[]
  genres: string[]
  authors: PersonEntry[]
}

export const EMPTY_BOOK_FORM: BookFormState = {
  title: '', description: '', seriesEntries: [],
  genres: [], authors: [],
}

/** Converts BookFormState.seriesEntries into the API's CreateBookDto/UpdateBookDto shape. */
export function seriesEntriesToPayload(entries: SeriesEntryFormState[]) {
  return entries
    .filter((e) => e.seriesName.trim())
    .map((e) => ({
      seriesName: e.seriesName.trim(),
      volumeNumbers: parseVolumeNumbers(e.volumeNumbers),
      isPrimary: e.isPrimary,
    }))
}

interface Props {
  initial: BookFormState
  onSubmit: (data: BookFormState) => void
  submitting: boolean
  submitLabel: string
  onCancel?: () => void
  /** When provided (editing an existing book), shows the omnibus checkbox + components panel below the form. */
  bookSlug?: string
  /** Whether this book is currently an omnibus (has components) — initializes the checkbox that reveals the components panel. Ignored unless bookSlug is also given. */
  initialIsOmnibus?: boolean
}

/** Series membership editor — a book can belong to several series, with exactly one marked
 * Primary (shown on cards). Shared by BookForm (edit) and CreateBookEditionForm (create) so
 * both places offer the same multi-series input instead of create-time being limited to one. */
export function SeriesEntriesEditor({ entries, onChange }: {
  entries: SeriesEntryFormState[]
  onChange: (entries: SeriesEntryFormState[]) => void
}) {
  const radioGroupName = useId()

  const updateEntry = (i: number, patch: Partial<SeriesEntryFormState>) =>
    onChange(entries.map((e, j) => j === i ? { ...e, ...patch } : e))

  const addEntry = () =>
    onChange([...entries, { seriesName: '', volumeNumbers: '', isPrimary: entries.length === 0 }])

  const removeEntry = (i: number) => {
    const wasPrimary = entries[i]?.isPrimary
    const rest = entries.filter((_, j) => j !== i)
    if (wasPrimary && rest.length > 0 && !rest.some((e) => e.isPrimary)) rest[0].isPrimary = true
    onChange(rest)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className={LBL}>Series <span className="text-navy-600 font-normal normal-case tracking-normal">(the one marked Primary shows on cards)</span></label>
        <button type="button" onClick={addEntry} className={`${BTN_SM} bg-navy-700 text-navy-400 hover:bg-navy-600`}>+ Add series</button>
      </div>
      {entries.length === 0 && <p className="text-xs text-navy-600 italic">Not part of any series.</p>}
      {entries.length > 0 && (
        <p className="text-xs text-navy-600 mb-2">
          Vol #: comma-separated (<code>0.5, 2</code>) or a range for an omnibus (<code>1-3</code> → 1, 2, 3).
        </p>
      )}
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex-1">
              <SeriesPicker value={entry.seriesName} onChange={(v) => updateEntry(i, { seriesName: v })} />
            </div>
            <input
              value={entry.volumeNumbers}
              onChange={(e) => updateEntry(i, { volumeNumbers: e.target.value })}
              placeholder="e.g. 1, 2 or 1-3"
              title="Comma-separated volume numbers, e.g. &quot;0.5, 2&quot;. For an omnibus spanning consecutive volumes, use a range like &quot;1-3&quot; — it expands to 1, 2, 3."
              className={`${INP} sm:w-40`}
            />
            <label className="flex items-center gap-1.5 text-xs text-navy-400 whitespace-nowrap shrink-0">
              <input
                type="radio"
                name={radioGroupName}
                checked={entry.isPrimary}
                onChange={() => onChange(entries.map((e, j) => ({ ...e, isPrimary: j === i })))}
                className="accent-brand-400"
              />
              Primary
            </label>
            <button type="button" onClick={() => removeEntry(i)} className="text-navy-500 hover:text-red-400 text-sm shrink-0">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
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
  const [inputMode, setInputMode] = useState<'text' | 'screenshot'>('text')
  const [text, setText] = useState('')
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImageBase64(dataUrl)
      setImagePreview(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  async function handleParse() {
    if (inputMode === 'text' && !text.trim()) return
    if (inputMode === 'screenshot' && !imageBase64) return
    setLoading(true)
    setError(null)
    try {
      const body = inputMode === 'screenshot' ? { imageBase64 } : { text }
      const data = await authFetch<AiBookResult>('/ai/parse-book', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      onResult(data)
      setOpen(false)
      setText('')
      setImageBase64(null)
      setImagePreview(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const canParse = inputMode === 'screenshot' ? !!imageBase64 : !!text.trim()

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 border border-dashed border-navy-600 rounded-lg px-3 py-2 text-sm text-navy-400 hover:border-brand-500 hover:text-brand-400 transition-colors">
        🤖 Parse from Goodreads
      </button>
    )
  }

  return (
    <div className="border border-navy-700 rounded-xl p-3 flex flex-col gap-2 bg-navy-900/50">
      {/* Mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-navy-700 self-start">
        <button type="button" onClick={() => setInputMode('text')}
          className={`px-3 py-1 text-xs font-medium transition-colors ${inputMode === 'text' ? 'bg-brand-600 text-white' : 'bg-navy-800 text-navy-400 hover:text-navy-200'}`}>
          Paste text
        </button>
        <button type="button" onClick={() => setInputMode('screenshot')}
          className={`px-3 py-1 text-xs font-medium transition-colors ${inputMode === 'screenshot' ? 'bg-brand-600 text-white' : 'bg-navy-800 text-navy-400 hover:text-navy-200'}`}>
          Screenshot
        </button>
      </div>

      {inputMode === 'text' ? (
        <textarea
          autoFocus
          rows={6}
          className={`${INP} font-mono text-xs`}
          placeholder={'Deception Duet #2\nDeath Wish\n\nK. Webster\n3.66\n...\n\nGenres\nDark Romance\n...'}
          value={text}
          onChange={e => setText(e.target.value)}
        />
      ) : (
        <div className="space-y-2">
          <input type="file" accept="image/*" onChange={handleFileChange}
            className="block w-full text-sm text-navy-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-navy-700 file:text-navy-200 hover:file:bg-navy-600 cursor-pointer" />
          {imagePreview && (
            <img src={imagePreview} alt="Preview" className="max-h-48 rounded-lg border border-navy-700 object-contain" />
          )}
          <p className="text-xs text-navy-500">Image is processed in-memory and never saved to storage.</p>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={handleParse} disabled={loading || !canParse}
          className="flex-1 bg-brand-400 text-navy-950 font-semibold px-3 py-1.5 rounded-lg text-sm hover:bg-brand-300 disabled:opacity-50 transition-colors">
          {loading ? 'Parsing…' : 'Fill form'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setText(''); setImageBase64(null); setImagePreview(null); setError(null) }}
          className="px-3 py-1.5 rounded-lg bg-navy-700 text-navy-300 hover:bg-navy-600 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Omnibus components (book-level: shared by every edition of this book) ────
type BookComponent = {
  id: string
  order: number
  volumeNumber: number | null
  book: { id: string; slug: string; title: string }
}

/** The book-search-and-pick sub-form, shared by the live panel (existing book) and the
 * staged editor (book being created — nothing to attach to yet). Just resolves "which
 * book, what volume number, what order" and hands it to the caller via onAdd; the caller
 * decides whether that means an API call (live) or appending to local state (staged). */
function ComponentPickerForm({ onAdd, disabled }: {
  onAdd: (book: { id: string; title: string }, volumeNumber: string, order: string) => void
  disabled?: boolean
}) {
  const [bookSearch, setBookSearch] = useState('')
  const [selectedBook, setSelectedBook] = useState<{ id: string; title: string } | null>(null)
  const [volumeNumber, setVolumeNumber] = useState('')
  const [order, setOrder] = useState('')
  const [error, setError] = useState('')

  const { data: bookResults = [] } = useQuery<{ id: string; title: string; slug: string; seriesName: string | null }[]>({
    queryKey: ['book-search', bookSearch],
    queryFn: async () => {
      const res = await authFetch<{ data: { id: string; title: string; slug: string; seriesName: string | null }[] }>(
        `/books?search=${encodeURIComponent(bookSearch)}&pageSize=8`
      )
      return res.data ?? []
    },
    enabled: bookSearch.length >= 2,
  })

  const handleAdd = () => {
    if (!selectedBook) {
      setError('Select a book — every component must be a cataloged book')
      return
    }
    onAdd(selectedBook, volumeNumber, order)
    setSelectedBook(null)
    setBookSearch('')
    setVolumeNumber('')
    setOrder('')
    setError('')
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-navy-500">Add component (must be an existing cataloged book)</p>
      {!selectedBook ? (
        <div className="relative">
          <input
            value={bookSearch}
            onChange={e => setBookSearch(e.target.value)}
            placeholder="Search book (2+ chars)…"
            className={INP}
          />
          {bookSearch.length >= 2 && bookResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-navy-800 border border-navy-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {bookResults.map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => { setSelectedBook({ id: b.id, title: b.title }); setBookSearch('') }}
                  className="w-full text-left px-3 py-2 text-sm text-navy-200 hover:bg-navy-700 transition-colors"
                >
                  {b.title}
                  {b.seriesName && (
                    <span className="text-navy-400 ml-1">({b.seriesName})</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-navy-200">
          <span className="flex-1">{selectedBook.title}</span>
          <button type="button" onClick={() => setSelectedBook(null)} className="text-navy-500 hover:text-red-400">×</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LBL}>Volume number</label>
          <input
            value={volumeNumber}
            onChange={e => setVolumeNumber(e.target.value)}
            placeholder="e.g. 1.5"
            type="number"
            step="0.5"
            className={INP}
          />
        </div>
        <div>
          <label className={LBL}>Order (sort)</label>
          <input
            value={order}
            onChange={e => setOrder(e.target.value)}
            placeholder="0"
            type="number"
            min="0"
            className={INP}
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={handleAdd}
        disabled={disabled}
        className="w-full bg-brand-400 text-navy-950 font-semibold px-4 py-2 rounded-lg hover:bg-brand-300 disabled:opacity-50 transition-colors text-sm"
      >
        + Add component
      </button>
    </div>
  )
}

function BookComponentsPanel({ bookSlug }: { bookSlug: string }) {
  const qc = useQueryClient()

  const { data: components = [], isLoading } = useQuery<BookComponent[]>({
    queryKey: ['book-components', bookSlug],
    queryFn: () => authFetch<BookComponent[]>(`/books/${bookSlug}/components`),
  })

  const addMutation = useMutation({
    mutationFn: (payload: { bookId: string; volumeNumber?: number; order?: number }) =>
      authFetch(`/books/${bookSlug}/components`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['book-components', bookSlug] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (componentId: string) =>
      authFetch(`/books/${bookSlug}/components/${componentId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['book-components', bookSlug] }),
  })

  return (
    <div className="border border-navy-700 rounded-xl p-4 space-y-4 bg-navy-900/50">
      <p className="text-xs font-semibold uppercase tracking-widest text-navy-400">Omnibus components</p>
      <p className="text-xs text-navy-500">Shared across every edition of this book (hardcover, paperback, ebook…).</p>
      {isLoading ? (
        <p className="text-navy-500 text-xs">Loading…</p>
      ) : components.length === 0 ? (
        <p className="text-navy-500 text-xs">Not an omnibus — no components yet.</p>
      ) : (
        <div className="space-y-1.5">
          {components.map(c => (
            <div key={c.id} className="flex items-center gap-2 text-sm text-navy-300">
              {c.volumeNumber != null && (
                <span className="text-xs text-brand-600/80 font-semibold w-14 shrink-0">Vol. {c.volumeNumber}</span>
              )}
              <span className="flex-1">{c.book.title}</span>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(c.id)}
                className={`${BTN_SM} bg-red-900/30 text-red-400 hover:bg-red-900/50`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-navy-700 pt-3">
        <ComponentPickerForm
          disabled={addMutation.isPending}
          onAdd={(book, volumeNumber, order) => addMutation.mutate({
            bookId: book.id,
            volumeNumber: volumeNumber ? parseFloat(volumeNumber) : undefined,
            order: order ? parseInt(order, 10) : undefined,
          })}
        />
      </div>
    </div>
  )
}

/** A component staged before the omnibus book exists — volumeNumber/order kept as raw
 * strings (like the rest of this form's numeric fields) until flushed to the API. */
export interface StagedComponent {
  bookId: string
  title: string
  volumeNumber: string
  order: string
}

/** Same UI as BookComponentsPanel, but backed by local state instead of live API calls —
 * used while creating a book, before it has a slug to attach real components to. The
 * parent flushes `components` via POST /books/:slug/components once the book is created. */
export function StagedComponentsEditor({ components, onChange }: {
  components: StagedComponent[]
  onChange: (components: StagedComponent[]) => void
}) {
  return (
    <div className="border border-navy-700 rounded-xl p-4 space-y-4 bg-navy-900/50">
      <p className="text-xs font-semibold uppercase tracking-widest text-navy-400">Omnibus components</p>
      <p className="text-xs text-navy-500">Added automatically right after the book is created.</p>
      {components.length === 0 ? (
        <p className="text-navy-500 text-xs">No components staged yet.</p>
      ) : (
        <div className="space-y-1.5">
          {components.map((c, i) => (
            <div key={c.bookId} className="flex items-center gap-2 text-sm text-navy-300">
              {c.volumeNumber && (
                <span className="text-xs text-brand-600/80 font-semibold w-14 shrink-0">Vol. {c.volumeNumber}</span>
              )}
              <span className="flex-1">{c.title}</span>
              <button
                type="button"
                onClick={() => onChange(components.filter((_, j) => j !== i))}
                className={`${BTN_SM} bg-red-900/30 text-red-400 hover:bg-red-900/50`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-navy-700 pt-3">
        <ComponentPickerForm
          onAdd={(book, volumeNumber, order) => {
            if (components.some(c => c.bookId === book.id)) return
            onChange([...components, { bookId: book.id, title: book.title, volumeNumber, order }])
          }}
        />
      </div>
    </div>
  )
}

export function BookForm({ initial, onSubmit, submitting, submitLabel, onCancel, bookSlug, initialIsOmnibus }: Props) {
  const [form, setForm] = useState<BookFormState>(initial)
  const [showOmnibusPanel, setShowOmnibusPanel] = useState(initialIsOmnibus ?? false)

  function applyParserResult(data: AiBookResult) {
    const patch: Partial<BookFormState> = {}
    if (data.title) patch.title = data.title
    if (data.description) patch.description = data.description
    if (data.seriesName) {
      patch.seriesEntries = [{
        seriesName: data.seriesName,
        volumeNumbers: data.volumeNumber != null ? String(data.volumeNumber) : '',
        isPrimary: true,
      }]
    }
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
            setForm(f => {
              if (f.authors.find(ex => ex.name.toLowerCase() === a.name.toLowerCase())) return f
              return { ...f, authors: [...f.authors, a] }
            })
          }} />
        {form.authors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {form.authors.map((a, i) => (
              <span key={i} className="flex items-center gap-1.5 bg-navy-700 text-navy-200 text-xs px-2.5 py-1 rounded-full">
                {!a.id && <span className="text-brand-400 text-[9px] font-semibold uppercase">new</span>}
                {a.name}
                <button type="button" onClick={() => setForm(f => ({ ...f, authors: f.authors.filter((_, j) => j !== i) }))}
                  className="text-navy-500 hover:text-red-400">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <SeriesEntriesEditor
        entries={form.seriesEntries}
        onChange={(seriesEntries) => setForm(f => ({ ...f, seriesEntries }))}
      />

      <div>
        <label className={LBL}>Genres</label>
        <GenreTagsPicker genres={form.genres} onChange={v => setForm(f => ({ ...f, genres: v }))} />
      </div>

      <div className={onCancel ? 'flex gap-2 pt-1' : ''}>
        <button type="submit" disabled={submitting}
          className={`${onCancel ? 'flex-1' : 'w-full'} bg-brand-400 text-navy-950 font-semibold px-4 py-2 rounded-lg hover:bg-brand-300 disabled:opacity-50 transition-colors`}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-navy-700 text-navy-300 hover:bg-navy-600 text-sm transition-colors">
            Cancel
          </button>
        )}
      </div>

      {bookSlug && (
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOmnibusPanel}
              onChange={(e) => setShowOmnibusPanel(e.target.checked)}
              className="w-4 h-4 accent-brand-400"
            />
            <span className={LBL}>Is omnibus (contains multiple volumes/titles)</span>
          </label>
          {showOmnibusPanel && (
            <div className="mt-3">
              <BookComponentsPanel bookSlug={bookSlug} />
            </div>
          )}
        </div>
      )}
    </form>
  )
}

// Re-exported so callers (e.g. admin books list) can render "Series" cells consistently.
export { formatVolumeNumbers }
