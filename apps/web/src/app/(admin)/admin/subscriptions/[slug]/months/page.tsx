'use client'

import { use, useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import ImageUpload from '@/components/admin/ImageUpload'
import CreateBookEditionForm from '@/components/admin/CreateBookEditionForm'
import { PersonPicker } from '@/components/admin/pickers/PersonPicker'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { CURRENCIES } from '@/components/sale/SaleFormFields'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'

const INPUT = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LABEL = 'block text-xs text-stone-400 mb-1'
const BTN_SM = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors'
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
// ─── Cloud image helper ───────────────────────────────────────────────────────
function cloudUrl(publicId: string | null | undefined, size = 80) {
  return cloudinaryUrl(publicId, `w_${size * 2},h_${size * 2},c_fill,q_auto,f_auto`)
}

function Cover({ id, size = 56 }: { id?: string | null; size?: number }) {
  const url = cloudUrl(id, size)
  return (
    <div
      className="shrink-0 rounded-lg overflow-hidden bg-stone-800 border border-stone-700 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {url
        ? <img src={url} alt="" className="w-full h-full object-cover" />
        : <span className="text-stone-600 text-[10px]">—</span>
      }
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────
function editionCompany(ed: EditionInfo): string | null {
  return ed.bookBoxCompanyCustomName ?? ed.bookBoxCompany?.name ?? null
}

type EditionInfo = {
  id: string; slug: string; additionalImages: string[]
  variantLabel?: string | null
  bookBoxCompanyCustomName: string | null
  bookBoxCompany: { id: string; name: string } | null
}
type BookInfo = {
  id: string; title: string; slug: string
  authors: Array<{ author: { name: string } }>
}
type MonthBook = {
  id: string; bookId: string; editionId: string | null; isMainBook: boolean
  signatureType: string | null; choiceGroupId: string | null
  book: BookInfo; edition: EditionInfo | null
}
type ChoiceGroupOption = {
  id: string; bookId: string; editionId: string | null; signatureType: string | null
  book: BookInfo; edition: EditionInfo | null
}
type ChoiceGroup = {
  id: string; label: string | null; allowMultiple: boolean
  choiceDeadlineDaysBefore: number; choiceDeadlineType: string; choiceDeadlineDayOfMonth: number | null
  options: ChoiceGroupOption[]
  myChoice: { source: string; monthBookIds: string[] } | null
}
type Month = {
  id: string; year: number; month: number
  theme: string | null; coverImage: string | null
  books: MonthBook[]
  signatureType: string | null
  cardArtist: { id: string; name: string; slug: string } | null
}

// ─── Book Search component ────────────────────────────────────────────────────
interface BookSearchProps {
  slug: string
  subscriptionId?: string | null
  defaultCurrency?: string | null
  defaultCompanyId?: string | null
  defaultPrice?: number | null
  renewalDay?: number | null
  renewalDayUserSet?: boolean | null
  renewalMonthOffset?: number | null
  defaultLanguage?: string | null
  monthYear: number
  monthMonth: number
  onDone: () => void
}

function BookSearch({ slug, subscriptionId, defaultCurrency, defaultCompanyId, defaultPrice, renewalDay, renewalDayUserSet, renewalMonthOffset, defaultLanguage, monthYear, monthMonth, onDone }: BookSearchProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedBook, setSelectedBook] = useState<BookInfo & { editions?: EditionInfo[] } | null>(null)
  const [mode, setMode] = useState<'search' | 'createBook' | 'createEdition'>('search')

  const qKey = ['admin', 'subscriptions', slug, 'months']

  // Search books by title
  const { data: bookResults, isFetching: searching } = useQuery({
    queryKey: ['book-search', debounced],
    queryFn: () => authFetch<{ data: BookInfo[] }>(`/books?search=${encodeURIComponent(debounced)}&pageSize=10`),
    enabled: debounced.length >= 2,
  })

  // Editions for selected book
  const { data: editionsData } = useQuery({
    queryKey: ['book-editions', selectedBook?.id],
    queryFn: () => authFetch<{ data: EditionInfo[] }>(`/editions?bookId=${selectedBook!.id}&pageSize=50`),
    enabled: !!selectedBook?.id,
  })
  const editions: EditionInfo[] = editionsData?.data ?? []

  const handleSearchChange = (val: string) => {
    setSearch(val)
    setSelectedBook(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(val), 350)
  }

  const addBookMutation = useMutation({
    mutationFn: ({ bookId, editionId }: { bookId: string; editionId: string }) =>
      authFetch(`/subscriptions/${slug}/months/${monthYear}/${monthMonth}/books`, {
        method: 'POST',
        body: JSON.stringify({ bookId, editionId }),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qKey }); onDone() },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const formProps = {
    subscriptionSlug: slug,
    subscriptionId,
    defaultCurrency,
    defaultCompanyId,
    defaultPrice,
    renewalDay,
    renewalDayUserSet,
    renewalMonthOffset,
    defaultLanguage,
    monthYear,
    monthMonth,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qKey }); setMode('search'); onDone() },
    onCancel: () => setMode('search'),
  }

  // "Create new book" flow — full multi-step form
  if (mode === 'createBook') {
    return <CreateBookEditionForm {...formProps} />
  }

  // "Create new edition for existing book" flow
  if (mode === 'createEdition' && selectedBook) {
    return <CreateBookEditionForm {...formProps} existingBookId={selectedBook.id}
      onCancel={() => setMode('search')} />
  }

  if (selectedBook) {
    return (
      <div className="space-y-3">
        {/* Selected book header */}
        <div className="flex items-center gap-2">
          <Cover id={null} size={40} />
          <div className="flex-1">
            <div className="text-stone-100 text-sm font-medium">{selectedBook.title}</div>
            {selectedBook.authors?.length > 0 && (
              <div className="text-stone-500 text-xs">{selectedBook.authors.map(a => a.author.name).join(', ')}</div>
            )}
          </div>
          <button type="button" onClick={() => setSelectedBook(null)}
            className="text-stone-500 hover:text-stone-300 text-xs">← Back</button>
        </div>

        {/* Edition list */}
        <div className="text-xs text-stone-400 font-semibold uppercase tracking-wide">Pick edition</div>
        {editions.length === 0 && (
          <div className="text-stone-500 text-xs px-2">No editions yet — create one below.</div>
        )}
        <div className="space-y-1 max-h-52 overflow-y-auto">
          {editions.map(ed => (
            <button key={ed.id} type="button"
              onClick={() => addBookMutation.mutate({ bookId: selectedBook.id, editionId: ed.id })}
              disabled={addBookMutation.isPending}
              className="w-full text-left flex items-center gap-2 px-3 py-2 rounded bg-stone-800 hover:bg-stone-700 transition-colors"
            >
              <Cover id={ed.additionalImages?.[0]} size={36} />
              <div>
                <div className="text-stone-100 text-xs">
                  {editionCompany(ed) ?? ''}
                  {ed.variantLabel && <span className="text-amber-400"> ({ed.variantLabel})</span>}
                </div>
                <div className="text-stone-500 text-xs">{ed.bookBoxCompanyCustomName ?? ''}</div>
              </div>
            </button>
          ))}
        </div>

        <button type="button" onClick={() => setMode('createEdition')}
          className="text-amber-400 hover:text-amber-300 text-xs">+ Create new edition for this book</button>
      </div>
    )
  }

  // Default: search input
  return (
    <div className="space-y-2">
      <input value={search} onChange={e => handleSearchChange(e.target.value)}
        placeholder="Search books by title…" className={INPUT} />
      {searching && <div className="text-stone-500 text-xs">Searching…</div>}
      {search.length >= 2 && !searching && bookResults && (
        <div className="space-y-1">
          {bookResults.data.length === 0
            ? <div className="text-stone-500 text-xs px-2">No books found</div>
            : bookResults.data.map(book => (
              <button key={book.id} type="button" onClick={() => setSelectedBook(book)}
                className="w-full text-left flex items-center gap-2 px-3 py-2 rounded bg-stone-800 hover:bg-stone-700 transition-colors"
              >
                <Cover id={null} size={36} />
                <div>
                  <div className="text-stone-100 text-sm">{book.title}</div>
                  {book.authors?.length > 0 && (
                    <div className="text-stone-500 text-xs">{book.authors.map(a => a.author.name).join(', ')}</div>
                  )}
                </div>
              </button>
            ))
          }
        </div>
      )}
      <button type="button" onClick={() => setMode('createBook')}
        className="text-amber-400 hover:text-amber-300 text-xs">+ Create new book</button>
    </div>
  )
}

// ─── Month card ───────────────────────────────────────────────────────────────
interface MonthCardProps {
  month: Month
  slug: string
  subscriptionId?: string | null
  defaultCurrency?: string | null
  defaultCompanyId?: string | null
  defaultPrice?: number | null
  renewalDay?: number | null
  renewalDayUserSet?: boolean | null
  renewalMonthOffset?: number | null
  defaultLanguage?: string | null
  onRefresh?: () => void
  highlighted?: boolean
}

function MonthCard({ month, slug, subscriptionId, defaultCurrency, defaultCompanyId, defaultPrice, renewalDay, renewalDayUserSet, renewalMonthOffset, defaultLanguage, onRefresh, highlighted }: MonthCardProps) {
  const queryClient = useQueryClient()
  const qKey = ['admin', 'subscriptions', slug, 'months']

  const refresh = () => { queryClient.invalidateQueries({ queryKey: qKey }); onRefresh?.() }
  const [editing, setEditing] = useState(false)
  const [editTheme, setEditTheme] = useState(month.theme ?? '')
  const [editCover, setEditCover] = useState(month.coverImage ?? '')
  const [editSignatureType, setEditSignatureType] = useState<string>(month.signatureType ?? '')
  const [editCardArtistId, setEditCardArtistId] = useState<string | null>(month.cardArtist?.id ?? null)
  const [editCardArtistName, setEditCardArtistName] = useState<string>(month.cardArtist?.name ?? '')
  const [booksOpen, setBooksOpen] = useState(false)

  const monthLabel = `${MONTH_NAMES[month.month - 1]} ${month.year}`

  const updateMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${slug}/months/${month.year}/${month.month}`, {
      method: 'PATCH',
      body: JSON.stringify({
        theme: editTheme || undefined,
        coverImage: editCover || undefined,
        signatureType: editSignatureType || null,
        cardArtistId: editCardArtistId ?? null,
      }),
    }),
    onSuccess: () => { refresh(); setEditing(false) },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${slug}/months/${month.year}/${month.month}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const removeBookMutation = useMutation({
    mutationFn: (monthBookId: string) =>
      authFetch(`/subscriptions/${slug}/months/${month.year}/${month.month}/books/${monthBookId}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const updateBookSignatureMutation = useMutation({
    mutationFn: ({ monthBookId, signatureType }: { monthBookId: string; signatureType: string | null }) =>
      authFetch(`/subscriptions/${slug}/months/${month.year}/${month.month}/books/${monthBookId}`, {
        method: 'PATCH',
        body: JSON.stringify({ signatureType: signatureType || null }),
      }),
    onSuccess: () => refresh(),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  return (
    <div
      id={`month-${month.year}-${month.month}`}
      className={`bg-stone-900 border rounded-2xl transition-shadow ${highlighted ? 'border-amber-400 ring-2 ring-amber-400' : 'border-stone-800'}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        <Cover id={month.coverImage} size={64} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-stone-100 font-semibold">{monthLabel}</span>
              {(() => {
                // Build effective signature type for each book
                const counts: Record<string, number> = {}
                for (const mb of month.books) {
                  const t = mb.signatureType ?? month.signatureType
                  if (t) counts[t] = (counts[t] ?? 0) + 1
                }
                const entries = Object.entries(counts)
                if (entries.length === 0 && month.signatureType) {
                  const label = month.signatureType === 'signed' ? '✍️ Signed' : month.signatureType === 'autopen' ? '✒️ Autopen' : month.signatureType === 'digitally_signed' ? '🖨️ Digitally Signed' : month.signatureType === 'signed_bookplate' ? '🏷️ Signed Bookplate' : 'Unsigned'
                  return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">{label}</span>
                }
                return entries.map(([type, count]) => {
                  const label = type === 'signed' ? '✍️ Signed' : type === 'autopen' ? '✒️ Autopen' : type === 'digitally_signed' ? '🖨️ Digitally Signed' : type === 'signed_bookplate' ? '🏷️ Bookplate' : 'Unsigned'
                  return (
                    <span key={type} className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                      {label}{month.books.length > 1 ? ` ×${count}` : ''}
                    </span>
                  )
                })
              })()}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => {
                setEditing(!editing)
                setEditTheme(month.theme ?? '')
                setEditCover(month.coverImage ?? '')
                setEditCardArtistId(month.cardArtist?.id ?? null)
                setEditCardArtistName(month.cardArtist?.name ?? '')
              }} className={`${BTN_SM} ${editing ? 'bg-stone-600 text-stone-200' : 'bg-stone-700 text-stone-300 hover:bg-stone-600'}`}>
                {editing ? 'Cancel' : 'Edit'}
              </button>
              <button onClick={() => setBooksOpen(!booksOpen)}
                className={`${BTN_SM} ${booksOpen ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-stone-700 text-stone-300 hover:bg-stone-600'}`}>
                Books {booksOpen ? '▲' : '▼'}
              </button>
              <button
                onClick={() => { if (confirm(`Delete ${monthLabel}? The month and book links will be removed — books and editions are kept.`)) deleteMutation.mutate() }}
                disabled={deleteMutation.isPending}
                className={`${BTN_SM} bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50`}
              >{deleteMutation.isPending ? '…' : 'Delete'}</button>
            </div>
          </div>
          {month.theme && <p className="text-stone-400 text-sm mt-0.5 truncate">{month.theme}</p>}
          {month.cardArtist && (
            <p className="text-stone-500 text-xs mt-0.5">🎨 {month.cardArtist.name}</p>
          )}
          <p className="text-stone-500 text-xs mt-0.5">{month.books.length} book{month.books.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="border-t border-stone-800 p-4 space-y-3 bg-stone-800/30">
          <div>
            <label className={LABEL}>Theme / title</label>
            <input value={editTheme} onChange={e => setEditTheme(e.target.value)}
              placeholder="Theme or book title…" className={INPUT} />
          </div>
          <ImageUpload label="Cover image" folder="luxgrimoire/subscription-months"
            value={editCover} onChange={setEditCover} aspectRatio="1/1" />
          <div>
            <label className={LABEL}>Signature type</label>
            <select value={editSignatureType} onChange={e => setEditSignatureType(e.target.value)} className={INPUT}>
              <option value="">None / Unsigned</option>
              <option value="signed">✍️ Signed</option>
              <option value="autopen">✒️ Autopen</option>
              <option value="digitally_signed">🖨️ Digitally Signed</option>
              <option value="signed_bookplate">🏷️ Signed Bookplate</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Card artist <span className="text-stone-600">(optional — credit for box design)</span></label>
            {editCardArtistId ? (
              <div className="flex items-center gap-2 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2">
                <span className="text-stone-200 text-sm flex-1">🎨 {editCardArtistName}</span>
                <button type="button" onClick={() => { setEditCardArtistId(null); setEditCardArtistName('') }}
                  className="text-stone-500 hover:text-red-400 text-xs transition-colors">✕</button>
              </div>
            ) : (
              <PersonPicker endpoint="artists" placeholder="Search or create artist…"
                onAdd={a => { setEditCardArtistId(a.id ?? null); setEditCardArtistName(a.name) }} />
            )}
          </div>
          <button type="button"disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}
            className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-sm">
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}

      {/* Books panel */}
      {booksOpen && (
        <div className="border-t border-stone-800 p-4 space-y-4">
          {/* Existing books */}
          {month.books.length > 0 && (
            <div className="space-y-2">
              {month.books.map(mb => (
                <div key={mb.id}
                  className="flex items-center gap-3 bg-stone-800/60 rounded-xl px-3 py-2">
                  <Cover id={mb.edition?.additionalImages?.[0] ?? null} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="text-stone-100 text-sm font-medium truncate">{formatEditionDisplayTitle(mb.book, mb.edition)}</div>
                    {mb.edition
                      ? <div className="text-stone-400 text-xs">
                          {editionCompany(mb.edition) || null}
                        </div>
                      : <div className="text-stone-500 text-xs italic">No specific edition</div>
                    }
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      {mb.isMainBook && <span className="text-xs text-amber-500">main book</span>}
                      {(() => {
                        const effective = mb.signatureType ?? month.signatureType
                        if (!effective) return null
                        const isOverride = !!mb.signatureType
                        const label = effective === 'signed' ? '✍️ Signed' : effective === 'autopen' ? '✒️ Autopen' : effective === 'digitally_signed' ? '🖨️ Digitally Signed' : effective === 'signed_bookplate' ? '🏷️ Bookplate' : 'Unsigned'
                        return (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${isOverride ? 'bg-purple-500/20 text-purple-300' : 'bg-stone-700 text-stone-400'}`}
                            title={isOverride ? 'Book override' : 'From month default'}>
                            {label}
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                  <select
                    value={mb.signatureType ?? ''}
                    onChange={e => updateBookSignatureMutation.mutate({ monthBookId: mb.id, signatureType: e.target.value || null })}
                    className="text-xs bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-300 focus:outline-none focus:border-amber-400"
                    title="Signature type override for this book"
                  >
                    <option value="">—</option>
                    <option value="unsigned">Unsigned</option>
                    <option value="signed">✍️ Signed</option>
                    <option value="autopen">✒️ Autopen</option>
                    <option value="digitally_signed">🖨️ Digitally Signed</option>
                    <option value="signed_bookplate">🏷️ Bookplate</option>
                  </select>
                  {mb.choiceGroupId && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300" title="Part of a choice group">
                      choice option
                    </span>
                  )}
                  <button onClick={() => removeBookMutation.mutate(mb.id)}
                    disabled={removeBookMutation.isPending}
                    className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <ChoiceGroupsPanel slug={slug} monthYear={month.year} monthMonth={month.month}
            books={month.books} onRefresh={refresh} />

          {/* Add book */}
          <div className="bg-stone-800/40 rounded-xl p-3 border border-stone-700 space-y-2">
            <div className="text-stone-400 text-xs font-semibold uppercase tracking-wide">Add book</div>
            <BookSearch slug={slug} subscriptionId={subscriptionId} defaultCurrency={defaultCurrency}
              defaultCompanyId={defaultCompanyId} defaultPrice={defaultPrice} renewalDay={renewalDay}
              renewalDayUserSet={renewalDayUserSet} renewalMonthOffset={renewalMonthOffset}
              defaultLanguage={defaultLanguage}
              monthYear={month.year} monthMonth={month.month}
              onDone={() => { setBooksOpen(true); refresh() }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Choice groups panel ────────────────────────────────────────────────────────
function ChoiceGroupsPanel({ slug, monthYear, monthMonth, books, onRefresh }: {
  slug: string; monthYear: number; monthMonth: number; books: MonthBook[]; onRefresh: () => void
}) {
  const queryClient = useQueryClient()
  const qKey = ['admin', 'subscriptions', slug, 'months', monthYear, monthMonth, 'choice-groups']
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [label, setLabel] = useState('')
  const [allowMultiple, setAllowMultiple] = useState(true)
  const [deadlineDays, setDeadlineDays] = useState('0')

  const { data: groups } = useQuery({
    queryKey: qKey,
    queryFn: () => authFetch<ChoiceGroup[]>(`/subscriptions/${slug}/months/${monthYear}/${monthMonth}/choice-groups`),
  })

  const refresh = () => { queryClient.invalidateQueries({ queryKey: qKey }); onRefresh() }

  const createMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${slug}/months/${monthYear}/${monthMonth}/choice-groups`, {
      method: 'POST',
      body: JSON.stringify({
        monthBookIds: selectedIds,
        label: label || undefined,
        allowMultiple,
        choiceDeadlineDaysBefore: parseInt(deadlineDays, 10) || 0,
      }),
    }),
    onSuccess: () => { setSelectedIds([]); setLabel(''); setAllowMultiple(true); setDeadlineDays('0'); refresh() },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (choiceGroupId: string) =>
      authFetch(`/subscriptions/${slug}/months/${monthYear}/${monthMonth}/choice-groups/${choiceGroupId}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const ungrouped = books.filter(b => !b.choiceGroupId)

  return (
    <div className="space-y-3">
      {groups && groups.length > 0 && (
        <div className="space-y-2">
          {groups.map(g => (
            <div key={g.id} className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sky-300 text-sm font-medium">
                  {g.label || 'Choice group'} {g.allowMultiple && <span className="text-xs text-sky-400/70">(both allowed)</span>}
                </div>
                <button onClick={() => deleteMutation.mutate(g.id)} disabled={deleteMutation.isPending}
                  className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/20 transition-colors">
                  Ungroup
                </button>
              </div>
              <div className="text-xs text-stone-400">
                Deadline: {g.choiceDeadlineDaysBefore} day(s) before box month
              </div>
              <div className="flex flex-wrap gap-2">
                {g.options.map(o => (
                  <span key={o.id} className="text-xs px-2 py-1 rounded bg-stone-800 text-stone-300">
                    {formatEditionDisplayTitle(o.book, o.edition)}{o.edition ? ` — ${editionCompany(o.edition) ?? ''}` : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {ungrouped.length >= 2 && (
        <div className="bg-stone-800/40 rounded-xl p-3 border border-stone-700 space-y-2">
          <div className="text-stone-400 text-xs font-semibold uppercase tracking-wide">Group books as a choice</div>
          <div className="flex flex-wrap gap-2">
            {ungrouped.map(b => (
              <label key={b.id} className="flex items-center gap-1 text-xs text-stone-300 cursor-pointer">
                <input type="checkbox" checked={selectedIds.includes(b.id)}
                  onChange={e => setSelectedIds(ids => e.target.checked ? [...ids, b.id] : ids.filter(id => id !== b.id))} />
                {formatEditionDisplayTitle(b.book, b.edition)}{b.edition ? ` — ${editionCompany(b.edition) ?? ''}` : ''}
              </label>
            ))}
          </div>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)"
            className="text-xs bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-200 w-full focus:outline-none focus:border-amber-400" />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-stone-300 cursor-pointer">
              <input type="checkbox" checked={allowMultiple} onChange={e => setAllowMultiple(e.target.checked)} />
              Allow picking both
            </label>
            <label className="flex items-center gap-1.5 text-xs text-stone-400">
              Deadline (days before box month)
              <input type="number" min={0} value={deadlineDays} onChange={e => setDeadlineDays(e.target.value)}
                className="w-14 text-xs bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-200 focus:outline-none focus:border-amber-400" />
            </label>
          </div>
          <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || selectedIds.length < 2}
            className="text-xs px-3 py-1.5 rounded bg-amber-400 text-stone-950 font-semibold hover:bg-amber-300 disabled:opacity-40 transition-colors">
            Create choice group ({selectedIds.length} selected)
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Add month form ───────────────────────────────────────────────────────────
function AddMonthForm({ slug, onSuccess, open, onClose, initialYear, initialMonth, deepLinkBanner }: {
  slug: string
  onSuccess: () => void
  open: boolean
  onClose: () => void
  initialYear?: number
  initialMonth?: number
  deepLinkBanner?: string
}) {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [theme, setTheme] = useState('')
  const [cover, setCover] = useState('')
  const [signatureType, setSignatureType] = useState('')
  const [cardArtistId, setCardArtistId] = useState<string | null>(null)
  const [cardArtistName, setCardArtistName] = useState('')

  // This form stays mounted while hidden (open just toggles rendering below), so the lazy
  // useState initializer above only runs once — sync year/month explicitly when a deep-link
  // target arrives instead.
  useEffect(() => {
    if (initialYear != null) setYear(String(initialYear))
    if (initialMonth != null) setMonth(String(initialMonth))
  }, [initialYear, initialMonth])

  const mutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${slug}/months`, {
      method: 'POST',
      body: JSON.stringify({
        year: parseInt(year), month: parseInt(month),
        theme: theme || undefined, coverImage: cover || undefined,
        signatureType: signatureType || undefined,
        cardArtistId: cardArtistId ?? undefined,
      }),
    }),
    onSuccess: () => { onSuccess(); onClose(); setTheme(''); setCover(''); setSignatureType(''); setCardArtistId(null); setCardArtistName('') },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  if (!open) return null

  return (
    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-4 space-y-3">
      <div className="text-stone-100 font-semibold text-sm">New Month</div>
      {deepLinkBanner && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-400 text-xs">
          {deepLinkBanner}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Year *</label>
          <input type="number" value={year} onChange={e => setYear(e.target.value)}
            min={2000} max={2100} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Month *</label>
          <select value={month} onChange={e => setMonth(e.target.value)} className={INPUT}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i+1} value={i+1}>{i+1} — {MONTH_NAMES[i]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={LABEL}>Theme / title</label>
        <input value={theme} onChange={e => setTheme(e.target.value)}
          placeholder="e.g. Dark Academia, The Midnight Library…" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Signature type</label>
        <select value={signatureType} onChange={e => setSignatureType(e.target.value)} className={INPUT}>
          <option value="">None / Unsigned</option>
          <option value="signed">✍️ Signed</option>
          <option value="autopen">✒️ Autopen</option>
          <option value="digitally_signed">🖨️ Digitally Signed</option>
          <option value="signed_bookplate">🏷️ Signed Bookplate</option>
        </select>
      </div>
      <div>
        <label className={LABEL}>Card artist <span className="text-stone-600">(optional — credit for box design)</span></label>
        {cardArtistId ? (
          <div className="flex items-center gap-2 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2">
            <span className="text-stone-200 text-sm flex-1">🎨 {cardArtistName}</span>
            <button type="button" onClick={() => { setCardArtistId(null); setCardArtistName('') }}
              className="text-stone-500 hover:text-red-400 text-xs transition-colors">✕</button>
          </div>
        ) : (
          <PersonPicker endpoint="artists" placeholder="Search or create artist…"
            onAdd={a => { setCardArtistId(a.id ?? null); setCardArtistName(a.name) }} />
        )}
      </div>
      <ImageUpload label="Cover image" folder="luxgrimoire/subscription-months"
        value={cover} onChange={setCover} aspectRatio="1/1" />
      <div className="flex gap-2">
        <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-sm">
          {mutation.isPending ? 'Adding…' : 'Add Month'}
        </button>
        <button type="button" onClick={onClose}
          className="bg-stone-700 text-stone-300 px-4 py-2 rounded-lg hover:bg-stone-600 text-sm">Cancel</button>
      </div>
    </div>
  )
}

// ─── CSV Import Panel ─────────────────────────────────────────────────────────
type CsvRow = {
  year: string; month: string; theme: string; signatureType: string
  _valid: boolean; _error?: string
}

function CsvImportPanel({ subscriptionId, slug, onImported }: { subscriptionId: string; slug: string; onImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<CsvRow[]>([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length === 0) { setRows([]); return }

      // Detect header row
      const firstLine = lines[0].toLowerCase()
      const hasHeader = firstLine.includes('year') || firstLine.includes('month')
      const dataLines = hasHeader ? lines.slice(1) : lines

      const parsed: CsvRow[] = dataLines.map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
        // Expected columns: year, month, theme, signatureType (positional)
        const [year = '', month = '', theme = '', signatureType = ''] = cols

        const yearN = parseInt(year)
        const monthN = parseInt(month)
        const validYear = yearN >= 2000 && yearN <= 2100
        const validMonth = monthN >= 1 && monthN <= 12
        const validSig = !signatureType || ['signed', 'autopen', 'digitally_signed', 'signed_bookplate', 'unsigned'].includes(signatureType)

        const errors: string[] = []
        if (!validYear) errors.push(`invalid year: ${year}`)
        if (!validMonth) errors.push(`invalid month: ${month}`)
        if (!validSig) errors.push(`invalid signatureType: ${signatureType}`)

        return { year, month, theme, signatureType, _valid: errors.length === 0, _error: errors.join('; ') }
      })

      setRows(parsed)
      setProgress(null)
    }
    reader.readAsText(file)
    // reset file input so same file can be re-selected
    e.target.value = ''
  }

  const importAll = async () => {
    const validRows = rows.filter(r => r._valid)
    if (validRows.length === 0) return
    setImporting(true)
    setProgress({ done: 0, total: validRows.length, errors: [] })
    const errors: string[] = []
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i]
      try {
        await authFetch(`/subscriptions/${slug}/months`, {
          method: 'POST',
          body: JSON.stringify({
            year: parseInt(r.year),
            month: parseInt(r.month),
            theme: r.theme || undefined,
            signatureType: r.signatureType || undefined,
          }),
        })
      } catch (e: unknown) {
        errors.push(`${r.year}/${r.month}: ${e instanceof Error ? e.message : 'Error'}`)
      }
      setProgress({ done: i + 1, total: validRows.length, errors: [...errors] })
    }
    setImporting(false)
    onImported()
    if (errors.length === 0) {
      setRows([])
      setFileName(null)
    }
  }

  const validRows = rows.filter(r => r._valid)

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-stone-800/40 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-sm">📥</span>
          <span className="text-stone-200 font-semibold text-sm">Import Months from CSV</span>
          <span className="text-stone-500 text-xs">bulk historical import</span>
        </div>
        <span className="text-stone-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-stone-800 p-4 space-y-4">
          <div className="text-stone-400 text-xs bg-stone-800/50 rounded-lg p-3 space-y-1">
            <div className="font-semibold text-stone-300">CSV format (comma-separated, header optional):</div>
            <code className="text-amber-400/80 block">year,month,theme,signatureType</code>
            <div>Example: <code className="text-stone-300">2024,8,Dark Fairytales,signed</code></div>
            <div>Valid signature types: <code className="text-stone-300">signed</code>, <code className="text-stone-300">autopen</code>, <code className="text-stone-300">digitally_signed</code>, <code className="text-stone-300">signed_bookplate</code>, <code className="text-stone-300">unsigned</code> (or leave empty)</div>
          </div>

          <div>
            <label className={LABEL}>CSV file</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-400/20 text-amber-400 hover:bg-amber-400/30 transition-colors"
              >
                Choose file
              </button>
              <span className="text-stone-400 text-xs">{fileName ?? 'No file selected'}</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="hidden"
            />
          </div>

          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-stone-400">
                  {validRows.length} valid row{validRows.length !== 1 ? 's' : ''} ready to import
                  {rows.length !== validRows.length && (
                    <span className="text-red-400 ml-2">· {rows.length - validRows.length} with errors</span>
                  )}
                </div>
                <button type="button" onClick={() => { setRows([]); setProgress(null); setFileName(null) }}
                  className="text-stone-500 hover:text-stone-300 text-xs">Clear</button>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-stone-700 divide-y divide-stone-700/50">
                <div className="grid grid-cols-4 gap-2 px-3 py-1.5 bg-stone-800 text-xs font-semibold text-stone-400 uppercase tracking-wide sticky top-0">
                  <span>Year</span><span>Month</span><span>Theme</span><span>Signature</span>
                </div>
                {rows.map((r, i) => (
                  <div key={i} className={`grid grid-cols-4 gap-2 px-3 py-1.5 text-xs ${r._valid ? 'text-stone-300' : 'text-red-400 bg-red-900/10'}`}>
                    <span>{r.year}</span>
                    <span>{r.month} {r._valid ? `— ${MONTH_NAMES[parseInt(r.month) - 1] ?? ''}` : ''}</span>
                    <span className="truncate">{r.theme || '—'}</span>
                    <span>{r.signatureType || '—'}{r._error && <span className="block text-red-400/80 text-[10px]">{r._error}</span>}</span>
                  </div>
                ))}
              </div>

              {progress && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-stone-700 rounded-full h-1.5">
                      <div
                        className="bg-amber-400 h-1.5 rounded-full transition-all"
                        style={{ width: `${(progress.done / progress.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-stone-400 whitespace-nowrap">{progress.done} / {progress.total}</span>
                  </div>
                  {progress.errors.length > 0 && (
                    <div className="text-xs text-red-400 space-y-0.5">
                      {progress.errors.map((e, i) => <div key={i}>✕ {e}</div>)}
                    </div>
                  )}
                  {progress.done === progress.total && progress.errors.length === 0 && (
                    <div className="text-xs text-green-400">✓ All {progress.total} months imported successfully</div>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={importing || validRows.length === 0}
                onClick={importAll}
                className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-sm"
              >
                {importing ? `Importing… (${progress?.done ?? 0}/${progress?.total ?? 0})` : `Import ${validRows.length} month${validRows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Price Changes Panel ──────────────────────────────────────────────────────
type PriceChange = {
  id: string; effectiveMonth: number; effectiveYear: number
  newBasePrice: string; currency: string; notes: string | null; createdAt: string
}

function PriceChangesPanel({ slug, subscriptionCurrency }: { slug: string; subscriptionCurrency?: string | null }) {
  const queryClient = useQueryClient()
  const qKey = ['admin', 'subscriptions', slug, 'price-changes']

  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState(subscriptionCurrency ?? 'EUR')
  const [notes, setNotes] = useState('')
  const [showForm, setShowForm] = useState(false)

  const { data: changes, isLoading } = useQuery<PriceChange[]>({
    queryKey: qKey,
    queryFn: () => authFetch<PriceChange[]>(`/subscriptions/${slug}/price-changes`),
  })

  const addMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${slug}/price-changes`, {
      method: 'POST',
      body: JSON.stringify({
        effectiveMonth: parseInt(month),
        effectiveYear: parseInt(year),
        newBasePrice: parseFloat(price),
        currency,
        notes: notes || undefined,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey })
      setShowForm(false); setPrice(''); setNotes('')
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/subscriptions/${slug}/price-changes/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  return (
    <div id="price-changes" className="bg-stone-900 border border-stone-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-stone-100 font-semibold text-sm">💰 Price Change History</h3>
        <button
          onClick={() => setShowForm(v => !v)}
          className={`${BTN_SM} ${showForm ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-stone-700 hover:bg-stone-600 text-stone-300'}`}
        >
          {showForm ? 'Cancel' : '+ Add Price Change'}
        </button>
      </div>

      {showForm && (
        <div className="bg-stone-800 rounded-xl p-3 space-y-3 border border-stone-700">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Month *</label>
              <select value={month} onChange={e => setMonth(e.target.value)} className={INPUT}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i+1} value={i+1}>{i+1} — {MONTH_NAMES[i]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Year *</label>
              <input type="number" value={year} onChange={e => setYear(e.target.value)}
                min={2000} max={2100} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>New base price *</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                min={0} step={0.01} placeholder="e.g. 34.99" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Currency *</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={INPUT}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Annual price increase" className={INPUT} />
          </div>
          <button
            disabled={addMutation.isPending || !price || !currency}
            onClick={() => addMutation.mutate()}
            className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-sm"
          >
            {addMutation.isPending ? 'Saving…' : 'Save Price Change'}
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-stone-500 text-sm">Loading…</p>
      ) : !changes?.length ? (
        <p className="text-stone-600 text-sm italic">No price changes recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {changes.map(pc => {
            const isSentinel = pc.effectiveYear === 1900
            return (
              <div key={pc.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isSentinel ? 'bg-stone-800/50 border border-amber-900/40' : 'bg-stone-800'}`}>
                <div className="space-y-0.5">
                  <span className="text-stone-100 font-medium">
                    {isSentinel
                      ? <span className="text-amber-400/80">⚓ Base price (sentinel)</span>
                      : <>{MONTH_NAMES[pc.effectiveMonth - 1]} {pc.effectiveYear}</>
                    }
                    {' '}— {parseFloat(pc.newBasePrice).toFixed(2)} {pc.currency}
                  </span>
                  {isSentinel && <p className="text-stone-500 text-xs">Initial base price. Cannot be deleted.</p>}
                  {pc.notes && <p className="text-stone-500 text-xs">{pc.notes}</p>}
                </div>
                {!isSentinel && (
                  <button
                    onClick={() => { if (confirm('Delete this price change?')) deleteMutation.mutate(pc.id) }}
                    disabled={deleteMutation.isPending}
                    className="text-red-500 hover:text-red-400 text-xs transition-colors ml-3 shrink-0"
                  >
                    Delete
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Import Months From Variant Panel ────────────────────────────────────────
function ImportMonthsFromVariantPanel({ parentSlug, parentId }: { parentSlug: string; parentId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selectedSlug, setSelectedSlug] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const { data: variantsData } = useQuery<{ data: Array<{ id: string; name: string; slug: string }> }>({
    queryKey: ['variants-of', parentId],
    queryFn: () => authFetch(`/subscriptions?parentSubscriptionId=${parentId}&pageSize=100&includeHidden=true`),
    enabled: open,
  })

  const variants = variantsData?.data ?? []

  const importMutation = useMutation({
    mutationFn: () => authFetch<{ migratedCount: number }>(`/subscriptions/${parentSlug}/import-months-from/${selectedSlug}`, { method: 'POST' }),
    onSuccess: (res: { migratedCount: number }) => {
      alert(`✓ Imported ${res.migratedCount} month${res.migratedCount !== 1 ? 's' : ''} from variant.`)
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions', parentSlug, 'months'] })
      setOpen(false)
      setSelectedSlug('')
      setConfirmed(false)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
      >
        ↙ Import months from variant
      </button>
    )
  }

  return (
    <div className="bg-stone-900 border border-purple-700/40 rounded-2xl p-4 space-y-3 w-full">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-stone-100 font-semibold text-sm">Import months from variant</div>
          <div className="text-stone-400 text-xs mt-0.5">
            Moves all months from a variant subscription to this content stream. This cannot be undone.
          </div>
        </div>
        <button type="button" onClick={() => { setOpen(false); setSelectedSlug(''); setConfirmed(false) }}
          className="text-stone-500 hover:text-stone-300 text-sm">✕</button>
      </div>

      <div>
        <label className={LABEL}>Source variant *</label>
        {variants.length === 0 ? (
          <p className="text-stone-500 text-xs">No variants found for this content stream.</p>
        ) : (
          <select value={selectedSlug} onChange={e => { setSelectedSlug(e.target.value); setConfirmed(false) }} className={INPUT}>
            <option value="">— Select variant —</option>
            {variants.map(v => (
              <option key={v.id} value={v.slug}>{v.name}</option>
            ))}
          </select>
        )}
      </div>

      {selectedSlug && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="accent-amber-400" />
          <span className="text-xs text-stone-300">
            I understand this will move all months from the selected variant to this content stream and cannot be undone.
          </span>
        </label>
      )}

      <button
        type="button"
        disabled={!selectedSlug || !confirmed || importMutation.isPending}
        onClick={() => importMutation.mutate()}
        className="bg-purple-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-purple-400 disabled:opacity-40 text-sm transition-colors"
      >
        {importMutation.isPending ? 'Importing…' : 'Import months'}
      </button>
    </div>
  )
}

// ─── Migrate Months Panel ─────────────────────────────────────────────────────
function MigrateMonthsPanel({ slug, companyId, monthCount }: { slug: string; companyId?: string | null; monthCount: number }) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const { data: contentStreams } = useQuery<{ data: Array<{ id: string; name: string; slug: string }> }>({
    queryKey: ['content-streams', companyId],
    queryFn: () => authFetch(`/subscriptions?companyId=${companyId}&isContentStream=true&pageSize=100`),
    enabled: open && !!companyId,
  })

  const streams = contentStreams?.data ?? []

  const migrateMutation = useMutation({
    mutationFn: () => authFetch<{ migratedCount: number }>(`/subscriptions/${slug}/migrate-months`, {
      method: 'POST',
      body: JSON.stringify({ targetSubscriptionId: selectedId }),
    }),
    onSuccess: (res: { migratedCount: number }) => {
      alert(`✓ Successfully migrated ${res.migratedCount} month${res.migratedCount !== 1 ? 's' : ''} to the content stream.`)
      setOpen(false)
      setSelectedId('')
      setConfirmed(false)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
      >
        ↗ Migrate months to content stream
      </button>
    )
  }

  return (
    <div className="bg-stone-900 border border-blue-700/40 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-stone-100 font-semibold text-sm">Migrate months to content stream</div>
          <div className="text-stone-400 text-xs mt-0.5">
            Moves all {monthCount} month{monthCount !== 1 ? 's' : ''} from this subscription to a content stream. This cannot be undone.
          </div>
        </div>
        <button type="button" onClick={() => { setOpen(false); setSelectedId(''); setConfirmed(false) }}
          className="text-stone-500 hover:text-stone-300 text-sm">✕</button>
      </div>

      <div>
        <label className={LABEL}>Target content stream *</label>
        {streams.length === 0 && !companyId && (
          <p className="text-stone-500 text-xs">Loading…</p>
        )}
        {streams.length === 0 && companyId && (
          <p className="text-stone-500 text-xs">No content streams found for this company. Create one first.</p>
        )}
        {streams.length > 0 && (
          <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setConfirmed(false) }} className={INPUT}>
            <option value="">— Select content stream —</option>
            {streams.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {selectedId && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="accent-amber-400" />
          <span className="text-xs text-stone-300">
            I understand this will move all {monthCount} month{monthCount !== 1 ? 's' : ''} to the selected content stream and this action cannot be undone.
          </span>
        </label>
      )}

      <button
        type="button"
        disabled={!selectedId || !confirmed || migrateMutation.isPending}
        onClick={() => migrateMutation.mutate()}
        className="bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-400 disabled:opacity-40 text-sm transition-colors"
      >
        {migrateMutation.isPending ? 'Migrating…' : `Migrate ${monthCount} month${monthCount !== 1 ? 's' : ''}`}
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
interface SubscriptionInfo { id: string; name: string; currency?: string | null; companyId?: string | null; price?: string | null; originalBasePrice?: string | null; renewalDay?: number | null; renewalDayUserSet?: boolean | null; renewalMonthOffset?: number | null; language?: string | null; parentSubscriptionId?: string | null; parent?: { slug: string; name: string } | null; isContentStream?: boolean | null }

type MonthsPage = { data: Month[]; total: number; page: number; pageSize: number; totalPages: number }

/** Mirrors the backend resolveEffectiveBasePrice — returns the most recent price change
 *  effective at or before (year, month), or fallback if none applies. */
function resolveEffectivePrice(
  priceChanges: PriceChange[],
  year: number,
  month: number,
  fallback: number | null,
): number | null {
  const applicable = priceChanges
    .filter(pc => pc.effectiveYear < year || (pc.effectiveYear === year && pc.effectiveMonth <= month))
    .sort((a, b) => b.effectiveYear !== a.effectiveYear ? b.effectiveYear - a.effectiveYear : b.effectiveMonth - a.effectiveMonth)
  if (applicable.length === 0) return fallback
  return parseFloat(applicable[0].newBasePrice)
}

export default function SubscriptionMonthsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [addMonthOpen, setAddMonthOpen] = useState(false)
  const [filterEmpty, setFilterEmpty] = useState(false)
  const [loadedPages, setLoadedPages] = useState<Month[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)

  // ── Deep-link support: ?year=&month= from the admin month-gaps page ──────────
  const deepLinkYear = searchParams.get('year') ? Number(searchParams.get('year')) : null
  const deepLinkMonth = searchParams.get('month') ? Number(searchParams.get('month')) : null
  const [highlightKey, setHighlightKey] = useState<string | null>(null)
  const [deepLinkAddMonth, setDeepLinkAddMonth] = useState<{ year: number; month: number } | null>(null)
  const deepLinkResolvedRef = useRef(false)

  const PAGE_SIZE = 12

  const { data: subscription } = useQuery<SubscriptionInfo>({
    queryKey: ['admin', 'subscriptions', slug],
    queryFn: () => authFetch<SubscriptionInfo>(`/subscriptions/${slug}`),
  })

  const { data: firstPage, isLoading } = useQuery<MonthsPage>({
    queryKey: ['admin', 'subscriptions', slug, 'months', 1],
    queryFn: () => authFetch<MonthsPage>(`/subscriptions/${slug}/months?all=true&page=1&pageSize=${PAGE_SIZE}`),
  })

  const { data: priceChanges = [] } = useQuery<PriceChange[]>({
    queryKey: ['admin', 'subscriptions', slug, 'price-changes'],
    queryFn: () => authFetch<PriceChange[]>(`/subscriptions/${slug}/price-changes`),
    enabled: !!subscription,
  })

  // Fetch own months count when subscription has a parent (for migration panel)
  const { data: ownMonthsData } = useQuery<MonthsPage>({
    queryKey: ['admin', 'subscriptions', slug, 'months', 'own'],
    queryFn: () => authFetch<MonthsPage>(`/subscriptions/${slug}/months?all=true&ownOnly=true&page=1&pageSize=1`),
    enabled: !!subscription?.parentSubscriptionId,
  })

  // Populate loadedPages from firstPage on initial load only (not after manual reloads)
  useEffect(() => {
    if (firstPage && loadedPages.length === 0) {
      setLoadedPages(firstPage.data)
      setTotalPages(firstPage.totalPages)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPage])

  const months = loadedPages.length > 0 ? loadedPages : (firstPage?.data ?? [])
  const displayedMonths = filterEmpty ? months.filter(m => m.books.length === 0) : months

  const loadMore = async () => {
    if (loadingMore || currentPage >= totalPages) return
    setLoadingMore(true)
    try {
      const next = currentPage + 1
      const r = await authFetch<MonthsPage>(`/subscriptions/${slug}/months?all=true&page=${next}&pageSize=${PAGE_SIZE}`)
      setLoadedPages(prev => [...prev, ...r.data])
      setCurrentPage(next)
      setTotalPages(r.totalPages)
    } finally {
      setLoadingMore(false)
    }
  }

  // Resolve the deep-link target once months are loaded: scroll+highlight if found, page
  // forward through loadMore() if more pages remain, or pre-fill+open AddMonthForm if the
  // month genuinely doesn't exist yet.
  useEffect(() => {
    if (deepLinkYear == null || deepLinkMonth == null) return
    if (deepLinkResolvedRef.current) return
    if (isLoading || months.length === 0) return

    const target = months.find(m => m.year === deepLinkYear && m.month === deepLinkMonth)
    if (target) {
      deepLinkResolvedRef.current = true
      const key = `${deepLinkYear}-${deepLinkMonth}`
      setHighlightKey(key)
      requestAnimationFrame(() => {
        document.getElementById(`month-${deepLinkYear}-${deepLinkMonth}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      setTimeout(() => setHighlightKey(null), 2500)
      return
    }

    if (currentPage < totalPages) {
      void loadMore()
      return
    }

    // Exhausted every page — the month truly doesn't exist yet.
    deepLinkResolvedRef.current = true
    setDeepLinkAddMonth({ year: deepLinkYear, month: deepLinkMonth })
    setAddMonthOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, isLoading, currentPage, totalPages, deepLinkYear, deepLinkMonth])

  const invalidateMonths = async () => {
    // Re-fetch all currently loaded pages so the user doesn't lose their scroll position
    const pagesToReload = currentPage
    setLoadingMore(true)
    try {
      const allMonths: Month[] = []
      let lastTotalPages = totalPages
      for (let p = 1; p <= pagesToReload; p++) {
        const r = await authFetch<MonthsPage>(`/subscriptions/${slug}/months?all=true&page=${p}&pageSize=${PAGE_SIZE}`)
        allMonths.push(...r.data)
        lastTotalPages = r.totalPages
      }
      setLoadedPages(allMonths)
      setTotalPages(lastTotalPages)
      // Sync React Query cache so stale-time doesn't cause a double-fetch
      queryClient.setQueryData(['admin', 'subscriptions', slug, 'months', 1], {
        data: allMonths.slice(0, PAGE_SIZE),
        totalPages: lastTotalPages,
      })
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin/subscriptions" className="text-stone-500 text-sm hover:text-stone-300 mb-1 block">← Subscriptions</Link>
          <h1 className="text-2xl font-bold text-stone-100">{subscription?.name ?? slug}</h1>
          <p className="text-stone-500 text-sm">Manage months &amp; books</p>
        </div>
      </div>

      <div className="space-y-4">
        {subscription?.parentSubscriptionId && (
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-4 mb-6 flex items-center gap-3">
            <span className="text-amber-400 text-sm">
              This is a variant subscription. Months are managed on the parent subscription.
            </span>
            {subscription.parent?.slug && (
              <Link href={`/admin/subscriptions/${subscription.parent.slug}/months`} className="text-amber-400 underline text-sm ml-2">
                Go to parent months →
              </Link>
            )}
          </div>
        )}

        {subscription?.isContentStream && (
          <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-4 mb-6">
            <span className="text-blue-400 text-sm">
              📋 This is a content stream — months added here are shared with all variants.
            </span>
          </div>
        )}

        {/* Top action row */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setAddMonthOpen(!addMonthOpen)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${addMonthOpen ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-amber-400 text-stone-950 hover:bg-amber-300'}`}
            >
              + Add Month
            </button>
            <button
              onClick={() => setFilterEmpty(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors border ${filterEmpty ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-stone-800 text-stone-400 border-stone-700 hover:text-stone-200 hover:border-stone-600'}`}
            >
              📭 {filterEmpty ? `Without books (${displayedMonths.length})` : 'Show without books'}
            </button>
            {!subscription?.isContentStream && (
              (() => {
                const migrateCount = subscription?.parentSubscriptionId
                  ? (ownMonthsData?.total ?? 0)
                  : months.length
                return migrateCount > 0 ? (
                  <MigrateMonthsPanel
                    slug={slug}
                    companyId={subscription?.companyId}
                    monthCount={migrateCount}
                  />
                ) : null
              })()
            )}
            {subscription?.isContentStream && subscription.id && (
              <ImportMonthsFromVariantPanel parentSlug={slug} parentId={subscription.id} />
            )}
          </div>
        </div>

        {/* Add month form panel */}
        <AddMonthForm
          slug={slug}
          onSuccess={invalidateMonths}
          open={addMonthOpen}
          onClose={() => { setAddMonthOpen(false); setDeepLinkAddMonth(null) }}
          initialYear={deepLinkAddMonth?.year}
          initialMonth={deepLinkAddMonth?.month}
          deepLinkBanner={deepLinkAddMonth ? `No month exists yet for ${MONTH_NAMES[deepLinkAddMonth.month - 1]} ${deepLinkAddMonth.year} — add it below.` : undefined}
        />

        {/* Month list */}
        {isLoading ? (
          <div className="text-stone-400 py-8 text-center">Loading months…</div>
        ) : !months?.length ? (
          <div className="text-stone-500 text-center py-8 bg-stone-900/50 rounded-2xl border border-stone-800">
            No months yet — add the first one above.
          </div>
        ) : displayedMonths.length === 0 ? (
          <div className="text-stone-500 text-center py-8 bg-stone-900/50 rounded-2xl border border-stone-800">
            All months have at least one book linked. 🎉
          </div>
        ) : (
          <div className="space-y-3">
            {displayedMonths.map(m => (
              <MonthCard key={m.id} month={m} slug={slug}
                subscriptionId={subscription?.id}
                defaultCurrency={subscription?.currency}
                defaultCompanyId={subscription?.companyId}
                defaultPrice={resolveEffectivePrice(priceChanges, m.year, m.month, subscription?.originalBasePrice != null ? parseFloat(subscription.originalBasePrice) : subscription?.price != null ? parseFloat(subscription.price) : null)}
                renewalDay={subscription?.renewalDay}
                renewalDayUserSet={subscription?.renewalDayUserSet}
                renewalMonthOffset={subscription?.renewalMonthOffset}
                defaultLanguage={subscription?.language}
                onRefresh={invalidateMonths}
                highlighted={highlightKey === `${m.year}-${m.month}`}
              />
            ))}
            {currentPage < totalPages && (
              <div className="text-center pt-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-5 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm transition-colors disabled:opacity-40"
                >
                  {loadingMore ? 'Loading…' : `Load older months (${months.length} of ${firstPage?.total ?? '?'})`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* CSV import + price changes panels (visible when subscription is loaded) */}
        {subscription?.id && (
          <>
            <CsvImportPanel subscriptionId={subscription.id} slug={slug} onImported={invalidateMonths} />
            <PriceChangesPanel slug={slug} subscriptionCurrency={subscription?.currency} />
          </>
        )}
      </div>
    </div>
  )
}
