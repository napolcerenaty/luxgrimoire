'use client'

import { use, useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import ImageUpload from '@/components/admin/ImageUpload'
import CreateBookEditionForm from '@/components/admin/CreateBookEditionForm'
import Link from 'next/link'

const INPUT = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LABEL = 'block text-xs text-stone-400 mb-1'
const BTN_SM = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors'
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Cloud image helper ───────────────────────────────────────────────────────
const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''
function cloudUrl(publicId: string | null | undefined, size = 80) {
  if (!publicId) return null
  if (publicId.startsWith('http')) return publicId
  return `https://res.cloudinary.com/${CLOUD}/image/upload/w_${size*2},h_${size*2},c_fill,q_auto,f_auto/${publicId}`
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
type EditionInfo = {
  id: string; slug: string; coverImage: string | null
  editionName: string | null; publisher: string | null; publishYear: number | null
}
type BookInfo = {
  id: string; title: string; slug: string; coverImage: string | null
  authors: Array<{ author: { name: string } }>
}
type MonthBook = {
  bookId: string; editionId: string | null; isMainBook: boolean
  book: BookInfo; edition: EditionInfo | null
}
type Month = {
  id: string; year: number; month: number
  theme: string | null; coverImage: string | null
  books: MonthBook[]
  signatureType: string | null}

// ─── Book Search component ────────────────────────────────────────────────────
interface BookSearchProps {
  slug: string
  subscriptionId?: string | null
  defaultCurrency?: string | null
  defaultCompanyId?: string | null
  defaultPrice?: number | null
  renewalDay?: number | null
  monthYear: number
  monthMonth: number
  onDone: () => void
}

function BookSearch({ slug, subscriptionId, defaultCurrency, defaultCompanyId, defaultPrice, renewalDay, monthYear, monthMonth, onDone }: BookSearchProps) {
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
    mutationFn: ({ bookId, editionId }: { bookId: string; editionId?: string }) =>
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
          <Cover id={selectedBook.coverImage} size={40} />
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
        <div className="space-y-1 max-h-52 overflow-y-auto">
          <button type="button"
            onClick={() => addBookMutation.mutate({ bookId: selectedBook.id })}
            disabled={addBookMutation.isPending}
            className="w-full text-left px-3 py-2 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 text-xs italic"
          >Link without specific edition</button>
          {editions.map(ed => (
            <button key={ed.id} type="button"
              onClick={() => addBookMutation.mutate({ bookId: selectedBook.id, editionId: ed.id })}
              disabled={addBookMutation.isPending}
              className="w-full text-left flex items-center gap-2 px-3 py-2 rounded bg-stone-800 hover:bg-stone-700 transition-colors"
            >
              <Cover id={ed.coverImage} size={36} />
              <div>
                <div className="text-stone-100 text-xs">{ed.editionName ?? 'Standard'}</div>
                <div className="text-stone-500 text-xs">{[ed.publisher, ed.publishYear].filter(Boolean).join(' · ')}</div>
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
                <Cover id={book.coverImage} size={36} />
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
}

function MonthCard({ month, slug, subscriptionId, defaultCurrency, defaultCompanyId, defaultPrice, renewalDay }: MonthCardProps) {
  const queryClient = useQueryClient()
  const qKey = ['admin', 'subscriptions', slug, 'months']
  const [editing, setEditing] = useState(false)
  const [editTheme, setEditTheme] = useState(month.theme ?? '')
  const [editCover, setEditCover] = useState(month.coverImage ?? '')
  const [editSignatureType, setEditSignatureType] = useState<string>(month.signatureType ?? '')
  const [booksOpen, setBooksOpen] = useState(false)

  const monthLabel = `${MONTH_NAMES[month.month - 1]} ${month.year}`

  const updateMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${slug}/months/${month.year}/${month.month}`, {
      method: 'PATCH',
      body: JSON.stringify({ theme: editTheme || undefined, coverImage: editCover || undefined, signatureType: editSignatureType || null }),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qKey }); setEditing(false) },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${slug}/months/${month.year}/${month.month}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const removeBookMutation = useMutation({
    mutationFn: (bookId: string) =>
      authFetch(`/subscriptions/${slug}/months/${month.year}/${month.month}/books/${bookId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-4 p-4">
        <Cover id={month.coverImage} size={64} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-stone-100 font-semibold">{monthLabel}</span>
            {month.signatureType && month.signatureType !== "unsigned" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                {month.signatureType === "signed" ? "✍️ Signed" : "🖨️ Digitally Signed"}
              </span>
            )}
          </div>
          {month.theme && <p className="text-stone-400 text-sm mt-0.5 truncate">{month.theme}</p>}
          <p className="text-stone-500 text-xs mt-0.5">{month.books.length} book{month.books.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => {
            setEditing(!editing)
            setEditTheme(month.theme ?? ''); setEditCover(month.coverImage ?? '')
          }}className={`${BTN_SM} ${editing ? 'bg-stone-600 text-stone-200' : 'bg-stone-700 text-stone-300 hover:bg-stone-600'}`}>
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
              <option value="digitally_signed">🖨️ Digitally Signed</option>
            </select>
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
                <div key={`${mb.bookId}-${mb.editionId}`}
                  className="flex items-center gap-3 bg-stone-800/60 rounded-xl px-3 py-2">
                  <Cover id={mb.edition?.coverImage ?? mb.book.coverImage} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="text-stone-100 text-sm font-medium truncate">{mb.book.title}</div>
                    {mb.edition
                      ? <div className="text-stone-400 text-xs">
                          {mb.edition.editionName ?? 'Standard'}
                          {(mb.edition.publisher || mb.edition.publishYear) && ` · ${[mb.edition.publisher, mb.edition.publishYear].filter(Boolean).join(' ')}`}
                        </div>
                      : <div className="text-stone-500 text-xs italic">No specific edition</div>
                    }
                    {mb.isMainBook && <span className="text-xs text-amber-500">main book</span>}
                  </div>
                  <button onClick={() => removeBookMutation.mutate(mb.bookId)}
                    disabled={removeBookMutation.isPending}
                    className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add book */}
          <div className="bg-stone-800/40 rounded-xl p-3 border border-stone-700 space-y-2">
            <div className="text-stone-400 text-xs font-semibold uppercase tracking-wide">Add book</div>
            <BookSearch slug={slug} subscriptionId={subscriptionId} defaultCurrency={defaultCurrency}
              defaultCompanyId={defaultCompanyId} defaultPrice={defaultPrice} renewalDay={renewalDay}
              monthYear={month.year} monthMonth={month.month}
              onDone={() => setBooksOpen(true)} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Add month form ───────────────────────────────────────────────────────────
function AddMonthForm({ slug, onSuccess }: { slug: string; onSuccess: () => void }) {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [theme, setTheme] = useState('')
  const [cover, setCover] = useState('')
  const [open, setOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${slug}/months`, {
      method: 'POST',
      body: JSON.stringify({
        year: parseInt(year), month: parseInt(month),
        theme: theme || undefined, coverImage: cover || undefined,
        signatureType: signatureType || undefined,
      }),
    }),
    onSuccess: () => { onSuccess(); setOpen(false); setTheme(''); setCover('') },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 text-sm">
        + Add Month
      </button>
    )
  }

  return (
    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-4 space-y-3">
      <div className="text-stone-100 font-semibold text-sm">New Month</div>
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
      <<div>
        <label className={LABEL}>Signature type</label>
        <select value={signatureType} onChange={e => setSignatureType(e.target.value)} className={INPUT}>
          <option value="">None / Unsigned</option>
          <option value="signed">✍️ Signed</option>
          <option value="digitally_signed">🖨️ Digitally Signed</option>
        </select>
      </div>
      <ImageUpload label="Cover image" folder="luxgrimoire/subscription-months"
        value={cover} onChange={setCover} aspectRatio="1/1" />
      <div className="flex gap-2">
        <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-sm">
          {mutation.isPending ? 'Adding…' : 'Add Month'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="bg-stone-700 text-stone-300 px-4 py-2 rounded-lg hover:bg-stone-600 text-sm">Cancel</button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
interface SubscriptionInfo { id: string; name: string; defaultCurrency?: string | null; bookBoxCompanyId?: string | null; price?: number | null; renewalDay?: number | null }

export default function SubscriptionMonthsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const queryClient = useQueryClient()
  const qKey = ['admin', 'subscriptions', slug, 'months']

  const { data: subscription } = useQuery<SubscriptionInfo>({
    queryKey: ['admin', 'subscriptions', slug],
    queryFn: () => authFetch<SubscriptionInfo>(`/subscriptions/${slug}`),
  })

  const { data: months, isLoading } = useQuery<Month[]>({
    queryKey: qKey,
    queryFn: () => authFetch<Month[]>(`/subscriptions/${slug}/months`),
  })

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
        <AddMonthForm slug={slug} onSuccess={() => queryClient.invalidateQueries({ queryKey: qKey })} />

        {isLoading ? (
          <div className="text-stone-400 py-8 text-center">Loading months…</div>
        ) : !months?.length ? (
          <div className="text-stone-500 text-center py-8 bg-stone-900/50 rounded-2xl border border-stone-800">
            No months yet — add the first one above.
          </div>
        ) : (
          <div className="space-y-3">
            {months.map(m => (
              <MonthCard key={m.id} month={m} slug={slug}
                subscriptionId={subscription?.id}
                defaultCurrency={subscription?.defaultCurrency}
                defaultCompanyId={subscription?.bookBoxCompanyId}
                defaultPrice={subscription?.price}
                renewalDay={subscription?.renewalDay}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
