'use client'

import { use, useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import ImageUpload from '@/components/admin/ImageUpload'
import CreateBookEditionForm from '@/components/admin/CreateBookEditionForm'
import { PersonPicker } from '@/components/admin/pickers/PersonPicker'
import Link from 'next/link'

const INPUT = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LABEL = 'block text-xs text-stone-400 mb-1'
const BTN_SM = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors'
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF']

// ─── Cloud image helper ───────────────────────────────────────────────────────
const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''
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
function editionCompany(ed: EditionInfo): string | null {
  return ed.bookBoxCompanyCustomName ?? ed.bookBoxCompany?.name ?? null
}

type EditionInfo = {
  id: string; slug: string; additionalImages: string[]
  editionName: string | null
  bookBoxCompanyCustomName: string | null
  bookBoxCompany: { id: string; name: string } | null
}
type BookInfo = {
  id: string; title: string; slug: string
  authors: Array<{ author: { name: string } }>
}
type MonthBook = {
  bookId: string; editionId: string | null; isMainBook: boolean
  signatureType: string | null
  book: BookInfo; edition: EditionInfo | null
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
  defaultLanguage?: string | null
  monthYear: number
  monthMonth: number
  onDone: () => void
}

function BookSearch({ slug, subscriptionId, defaultCurrency, defaultCompanyId, defaultPrice, renewalDay, defaultLanguage, monthYear, monthMonth, onDone }: BookSearchProps) {
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
              <Cover id={ed.additionalImages?.[0]} size={36} />
              <div>
                <div className="text-stone-100 text-xs">{ed.editionName ?? editionCompany(ed) ?? ''}</div>
                <div className="text-stone-500 text-xs">{ed.editionName ? (editionCompany(ed) ?? '') : ''}</div>
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
  defaultLanguage?: string | null
}

function MonthCard({ month, slug, subscriptionId, defaultCurrency, defaultCompanyId, defaultPrice, renewalDay, defaultLanguage }: MonthCardProps) {
  const queryClient = useQueryClient()
  const qKey = ['admin', 'subscriptions', slug, 'months']
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

  const updateBookSignatureMutation = useMutation({
    mutationFn: ({ bookId, signatureType }: { bookId: string; signatureType: string | null }) =>
      authFetch(`/subscriptions/${slug}/months/${month.year}/${month.month}/books/${bookId}`, {
        method: 'PATCH',
        body: JSON.stringify({ signatureType: signatureType || null }),
      }),
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
            {(() => {
              // Build effective signature type for each book
              const counts: Record<string, number> = {}
              for (const mb of month.books) {
                const t = mb.signatureType ?? month.signatureType
                if (t) counts[t] = (counts[t] ?? 0) + 1
              }
              const entries = Object.entries(counts)
              if (entries.length === 0 && month.signatureType) {
                // No books yet but month has a default — show it
                const label = month.signatureType === 'signed' ? '✍️ Signed' : month.signatureType === 'digitally_signed' ? '🖨️ Digitally Signed' : month.signatureType === 'signed_bookplate' ? '🏷️ Signed Bookplate' : 'Unsigned'
                return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">{label}</span>
              }
              return entries.map(([type, count]) => {
                const label = type === 'signed' ? '✍️ Signed' : type === 'digitally_signed' ? '🖨️ Digital' : type === 'signed_bookplate' ? '🏷️ Bookplate' : 'Unsigned'
                return (
                  <span key={type} className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                    {label}{month.books.length > 1 ? ` ×${count}` : ''}
                  </span>
                )
              })
            })()}
          </div>
          {month.theme && <p className="text-stone-400 text-sm mt-0.5 truncate">{month.theme}</p>}
          {month.cardArtist && (
            <p className="text-stone-500 text-xs mt-0.5">🎨 {month.cardArtist.name}</p>
          )}
          <p className="text-stone-500 text-xs mt-0.5">{month.books.length} book{month.books.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => {
            setEditing(!editing)
            setEditTheme(month.theme ?? '')
            setEditCover(month.coverImage ?? '')
            setEditCardArtistId(month.cardArtist?.id ?? null)
            setEditCardArtistName(month.cardArtist?.name ?? '')
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
                <div key={`${mb.bookId}-${mb.editionId}`}
                  className="flex items-center gap-3 bg-stone-800/60 rounded-xl px-3 py-2">
                  <Cover id={mb.edition?.additionalImages?.[0] ?? null} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="text-stone-100 text-sm font-medium truncate">{mb.book.title}</div>
                    {mb.edition
                      ? <div className="text-stone-400 text-xs">
                          {[mb.edition.editionName, editionCompany(mb.edition)].filter(Boolean).join(' · ') || null}
                        </div>
                      : <div className="text-stone-500 text-xs italic">No specific edition</div>
                    }
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      {mb.isMainBook && <span className="text-xs text-amber-500">main book</span>}
                      {(() => {
                        const effective = mb.signatureType ?? month.signatureType
                        if (!effective) return null
                        const isOverride = !!mb.signatureType
                        const label = effective === 'signed' ? '✍️ Signed' : effective === 'digitally_signed' ? '🖨️ Digital' : effective === 'signed_bookplate' ? '🏷️ Bookplate' : 'Unsigned'
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
                    onChange={e => updateBookSignatureMutation.mutate({ bookId: mb.bookId, signatureType: e.target.value || null })}
                    className="text-xs bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-300 focus:outline-none focus:border-amber-400"
                    title="Signature type override for this book"
                  >
                    <option value="">—</option>
                    <option value="unsigned">Unsigned</option>
                    <option value="signed">✍️ Signed</option>
                    <option value="digitally_signed">🖨️ Digital</option>
                    <option value="signed_bookplate">🏷️ Bookplate</option>
                  </select>
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
              defaultLanguage={defaultLanguage}
              monthYear={month.year} monthMonth={month.month}
              onDone={() => setBooksOpen(true)} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Add month form ───────────────────────────────────────────────────────────
function AddMonthForm({ slug, onSuccess, open, onClose }: { slug: string; onSuccess: () => void; open: boolean; onClose: () => void }) {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [theme, setTheme] = useState('')
  const [cover, setCover] = useState('')
  const [signatureType, setSignatureType] = useState('')
  const [cardArtistId, setCardArtistId] = useState<string | null>(null)
  const [cardArtistName, setCardArtistName] = useState('')

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

// ─── Scraped preview + save ───────────────────────────────────────────────────
type ScrapedData = {
  year: number | null; month: number | null; theme: string | null
  bookTitle: string | null; bookAuthor: string | null
  imageUrl: string | null; allImages: string[]; sourceUrl: string
}

function ScrapedPreviewForm({
  data, subscriptionId, slug, onSaved, onCancel,
}: { data: ScrapedData; subscriptionId: string; slug: string; onSaved: () => void; onCancel: () => void }) {
  const [year, setYear] = useState(String(data.year ?? ''))
  const [month, setMonth] = useState(String(data.month ?? ''))
  const [theme, setTheme] = useState(data.theme ?? '')
  const [coverImageUrl, setCoverImageUrl] = useState(data.imageUrl ?? '')
  const [bookTitle, setBookTitle] = useState(data.bookTitle ?? '')
  const [bookAuthor, setBookAuthor] = useState(data.bookAuthor ?? '')
  const [uploadingImg, setUploadingImg] = useState<string | null>(null)
  // track which images failed to load (hotlink protection etc.)
  const [brokenImgs, setBrokenImgs] = useState<Set<string>>(new Set())

  const uploadImageUrl = async (imgUrl: string) => {
    setUploadingImg(imgUrl)
    try {
      const result = await authFetch<{ publicId: string; url: string }>('/admin/import/upload-image-url', {
        method: 'POST',
        body: JSON.stringify({ imageUrl: imgUrl }),
      })
      setCoverImageUrl(result.publicId)
    } catch (e: unknown) {
      alert(`Upload failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setUploadingImg(null)
    }
  }

  const savePendingMutation = useMutation({
    mutationFn: () => authFetch('/admin/import/pending/from-scrape', {
      method: 'POST',
      body: JSON.stringify({
        subscriptionId, year: parseInt(year), month: parseInt(month),
        theme: theme || undefined, coverImageUrl: coverImageUrl || undefined,
        bookTitle: bookTitle || undefined, bookAuthor: bookAuthor || undefined,
        sourceUrl: data.sourceUrl, allImages: data.allImages,
      }),
    }),
    onSuccess: () => { alert('Saved as pending — review in Pending Imports below'); onSaved() },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const saveDirectMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${slug}/months`, {
      method: 'POST',
      body: JSON.stringify({ year: parseInt(year), month: parseInt(month), theme: theme || undefined, coverImage: coverImageUrl || undefined }),
    }),
    onSuccess: () => { alert('Month created directly'); onSaved() },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  // Images that are available to show (not broken, or all if none loaded yet)
  const visibleImages = data.allImages.filter(img => !brokenImgs.has(img))

  return (
    <div className="bg-stone-800 rounded-xl p-4 space-y-3 border border-amber-500/30">
      <div className="text-amber-400 text-xs font-semibold uppercase tracking-wide">Scraped preview — verify before saving</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Year</label>
          <input type="number" value={year} onChange={e => setYear(e.target.value)} className={INPUT} min={2000} max={2100} />
        </div>
        <div>
          <label className={LABEL}>Month</label>
          <select value={month} onChange={e => setMonth(e.target.value)} className={INPUT}>
            <option value="">—</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i+1} value={i+1}>{i+1} — {MONTH_NAMES[i]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={LABEL}>Theme</label>
        <input value={theme} onChange={e => setTheme(e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Cover image (Cloudinary public ID or URL)</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input value={coverImageUrl} onChange={e => setCoverImageUrl(e.target.value)} className={INPUT} placeholder="click a thumbnail below to upload & select" />
            {coverImageUrl && (
              <button type="button" onClick={() => setCoverImageUrl('')}
                title="Clear image"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-200 leading-none text-sm">
                ✕
              </button>
            )}
          </div>
          {coverImageUrl.startsWith('http') && (
            <button type="button" onClick={() => uploadImageUrl(coverImageUrl)}
              disabled={!!uploadingImg}
              title="Upload this URL to Cloudinary"
              className="px-3 py-2 bg-stone-600 hover:bg-stone-500 text-stone-200 rounded-lg text-xs whitespace-nowrap disabled:opacity-50">
              {uploadingImg ? '⏳' : '☁ Upload'}
            </button>
          )}
        </div>
      </div>
      {data.allImages.length > 0 && (
        <div>
          <label className={LABEL}>
            Found images — click to upload &amp; use as cover
            {brokenImgs.size > 0 && <span className="text-stone-500 ml-1">({brokenImgs.size} blocked by hotlink protection — use URL above)</span>}
          </label>
          <div className="flex flex-wrap gap-2 mt-1">
            {data.allImages.slice(0, 12).map((img, i) => {
              const isBroken = brokenImgs.has(img)
              const isSelected = coverImageUrl === img || (uploadingImg === img)
              if (isBroken) {
                // Show as a compact URL chip instead of a broken image box
                return (
                  <button key={i} type="button" onClick={() => uploadImageUrl(img)}
                    disabled={!!uploadingImg}
                    title={img}
                    className="h-8 px-2 rounded border border-stone-600 hover:border-amber-400 bg-stone-700 hover:bg-stone-600 text-stone-400 hover:text-amber-300 text-[10px] max-w-[140px] truncate disabled:opacity-50">
                    {uploadingImg === img ? '⏳ uploading…' : '☁ ' + img.split('/').pop()?.slice(0, 20)}
                  </button>
                )
              }
              return (
                <button key={i} type="button" onClick={() => uploadImageUrl(img)}
                  disabled={!!uploadingImg}
                  title="Click to upload to Cloudinary and use as cover"
                  className={`w-16 h-16 rounded border-2 overflow-hidden relative flex-shrink-0 ${isSelected ? 'border-amber-400' : 'border-stone-700 hover:border-stone-500'} disabled:opacity-50`}>
                  {uploadingImg === img && (
                    <div className="absolute inset-0 bg-stone-900/70 flex items-center justify-center text-amber-400 text-xs">⏳</div>
                  )}
                  <img
                    src={img}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={() => setBrokenImgs(prev => new Set([...prev, img]))}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Book title</label>
          <input value={bookTitle} onChange={e => setBookTitle(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Book author</label>
          <input value={bookAuthor} onChange={e => setBookAuthor(e.target.value)} className={INPUT} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" disabled={saveDirectMutation.isPending || !year || !month}
          onClick={() => saveDirectMutation.mutate()}
          className="bg-amber-400 text-stone-950 font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-xs">
          {saveDirectMutation.isPending ? 'Saving…' : '✓ Save as month'}
        </button>
        <button type="button" disabled={savePendingMutation.isPending || !year || !month}
          onClick={() => savePendingMutation.mutate()}
          className="bg-stone-600 text-stone-200 px-3 py-1.5 rounded-lg hover:bg-stone-500 disabled:opacity-50 text-xs">
          {savePendingMutation.isPending ? 'Saving…' : '⏳ Save as pending'}
        </button>
        <button type="button" onClick={onCancel}
          className="text-stone-500 hover:text-stone-300 text-xs px-2">Cancel</button>
      </div>
    </div>
  )
}

// ─── Import from URL panel ────────────────────────────────────────────────────
function ImportUrlPanel({ subscriptionId, slug, onMonthCreated, onMonthSaved }: { subscriptionId: string; slug: string; onMonthCreated: () => void; onMonthSaved: () => void }) {
  const [tab, setTab] = useState<'single' | 'parent'>('single')
  const [url, setUrl] = useState('')
  const [scraped, setScraped] = useState<ScrapedData | null>(null)
  const [parentLinks, setParentLinks] = useState<string[]>([])
  const [linkFilter, setLinkFilter] = useState('')
  const [scrapingLink, setScrapingLink] = useState<string | null>(null)
  const [parentLinkScraped, setParentLinkScraped] = useState<ScrapedData | null>(null)

  const scrapeMutation = useMutation({
    mutationFn: () => authFetch<ScrapedData>('/admin/import/scrape', {
      method: 'POST',
      body: JSON.stringify({ url, subscriptionId }),
    }),
    onSuccess: (data) => setScraped(data),
    onError: (e: Error) => alert(`Scrape failed: ${e.message}`),
  })

  const scrapeParentMutation = useMutation({
    mutationFn: () => authFetch<{ links: string[] }>('/admin/import/scrape-parent', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
    onSuccess: (data) => { setParentLinks(data.links); setLinkFilter('') },
    onError: (e: Error) => alert(`Scrape failed: ${e.message}`),
  })

  const scrapeLink = async (link: string) => {
    setScrapingLink(link)
    setParentLinkScraped(null)
    try {
      const data = await authFetch<ScrapedData>('/admin/import/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: link, subscriptionId }),
      })
      setParentLinkScraped(data)
    } catch (e: unknown) {
      alert(`Scrape failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setScrapingLink(null)
    }
  }

  const filteredLinks = linkFilter
    ? parentLinks.filter(l => l.toLowerCase().includes(linkFilter.toLowerCase()))
    : parentLinks

  return (
    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-4 space-y-4">
      <div className="text-stone-100 font-semibold text-sm">🕐 Import historical month data</div>

      {/* Tabs */}
      <div className="flex gap-1 bg-stone-800 p-1 rounded-lg w-fit">
        {(['single', 'parent'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setScraped(null); setParentLinks([]) }}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${tab === t ? 'bg-stone-600 text-stone-100' : 'text-stone-400 hover:text-stone-300'}`}>
            {t === 'single' ? 'Single post URL' : 'Archive / listing URL'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label className={LABEL}>{tab === 'single' ? 'Blog post URL' : 'Archive / category page URL'}</label>
        <div className="flex gap-2">
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder={tab === 'single' ? 'https://blog.example.com/august-2024-reveal' : 'https://blog.example.com/reveals'}
            className={INPUT} />
          <button
            type="button"
            disabled={(tab === 'single' ? scrapeMutation.isPending : scrapeParentMutation.isPending) || !url}
            onClick={() => tab === 'single' ? scrapeMutation.mutate() : scrapeParentMutation.mutate()}
            className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-sm whitespace-nowrap"
          >
            {(scrapeMutation.isPending || scrapeParentMutation.isPending) ? 'Scraping…' : 'Scrape'}
          </button>
        </div>
      </div>

      {/* Single post result */}
      {tab === 'single' && scraped && (
        <>
          {!scraped.year && !scraped.month && (
            <div className="text-amber-600/80 text-xs px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              ⚠ AI could not detect month/year — please fill them in manually below.
            </div>
          )}
          <ScrapedPreviewForm data={scraped} subscriptionId={subscriptionId} slug={slug}
            onSaved={() => { setScraped(null); setUrl(''); onMonthCreated() }}
            onCancel={() => setScraped(null)} />
        </>
      )}

      {/* Parent/archive result */}
      {tab === 'parent' && parentLinks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-stone-400 text-xs font-semibold uppercase tracking-wide">
              {filteredLinks.length === parentLinks.length
                ? `Found ${parentLinks.length} links`
                : `${filteredLinks.length} of ${parentLinks.length} links`}
            </div>
            <input
              value={linkFilter}
              onChange={e => setLinkFilter(e.target.value)}
              placeholder="Filter by keyword…"
              className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-amber-400"
            />
            {linkFilter && (
              <button onClick={() => setLinkFilter('')} className="text-stone-500 hover:text-stone-300 text-xs">✕</button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {filteredLinks.map(link => {
              // Show just the path slug for readability, full URL in title
              let display = link
              try { display = new URL(link).pathname.replace(/\/$/, '') } catch {}
              return (
                <div key={link} className="flex items-center gap-2 bg-stone-800 rounded-lg px-3 py-2">
                  <span className="text-stone-300 text-xs flex-1 min-w-0" title={link}>
                    <span className="truncate block">{display}</span>
                    <span className="text-stone-600 truncate block text-[10px]">{link}</span>
                  </span>
                  <button type="button" disabled={!!scrapingLink}
                    onClick={() => scrapeLink(link)}
                    className="text-amber-400 hover:text-amber-300 text-xs px-2 py-1 rounded hover:bg-amber-500/10 disabled:opacity-50 whitespace-nowrap">
                    {scrapingLink === link ? '⏳' : 'Scrape'}
                  </button>
                </div>
              )
            })}
            {filteredLinks.length === 0 && (
              <div className="text-stone-500 text-xs p-3 text-center">No links match filter</div>
            )}
          </div>
          {parentLinkScraped && (
            <ScrapedPreviewForm data={parentLinkScraped} subscriptionId={subscriptionId} slug={slug}
              onSaved={() => { setParentLinkScraped(null); onMonthSaved() }}
              onCancel={() => setParentLinkScraped(null)} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pending imports panel ────────────────────────────────────────────────────
type PendingImport = {
  id: string; year: number; month: number; theme: string | null
  bookTitle: string | null; bookAuthor: string | null
  coverImageUrl: string | null; sourceUrl: string; status: string
  createdAt: string
}

function PendingImportsPanel({ subscriptionId, slug, onApproved }: { subscriptionId: string; slug: string; onApproved: () => void }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const qKey = ['admin', 'import', 'pending', subscriptionId]

  const { data: pending = [], isLoading } = useQuery<PendingImport[]>({
    queryKey: qKey,
    queryFn: () => authFetch(`/admin/import/pending?subscriptionId=${subscriptionId}&status=PENDING`),
    enabled: open,
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/admin/import/pending/${id}/approve`, { method: 'PATCH', body: '{}' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: qKey }); onApproved() },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/admin/import/pending/${id}/reject`, { method: 'PATCH', body: '{}' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-stone-800/40 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-sm">⏳</span>
          <span className="text-stone-200 font-semibold text-sm">Pending Imports</span>
          <span className="text-stone-500 text-xs">auto-scraped data awaiting review</span>
        </div>
        <span className="text-stone-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-stone-800 p-4 space-y-3">
          {isLoading ? (
            <div className="text-stone-500 text-sm py-4 text-center">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="text-stone-500 text-sm py-4 text-center">No pending imports</div>
          ) : (
            pending.map(item => (
              <div key={item.id} className="bg-stone-800 rounded-xl p-3 space-y-2">
                <div className="flex items-start gap-3">
                  {item.coverImageUrl && (
                    <img src={item.coverImageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-stone-100 text-sm font-medium">
                      {MONTH_NAMES[(item.month ?? 1) - 1]} {item.year}
                      {item.theme && <span className="text-stone-400 ml-2 font-normal">— {item.theme}</span>}
                    </div>
                    {item.bookTitle && (
                      <div className="text-stone-400 text-xs">{item.bookTitle}{item.bookAuthor ? ` by ${item.bookAuthor}` : ''}</div>
                    )}
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="text-stone-600 hover:text-stone-400 text-xs truncate block max-w-xs">{item.sourceUrl}</a>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate(item.id)}
                      className="bg-green-500/20 text-green-400 hover:bg-green-500/30 px-3 py-1 rounded text-xs disabled:opacity-50">
                      ✓ Approve
                    </button>
                    <button disabled={rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate(item.id)}
                      className="bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1 rounded text-xs disabled:opacity-50">
                      ✕ Reject
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Import sources panel ─────────────────────────────────────────────────────
type ImportSource = {
  id: string; name: string; url: string; sourceType: string; targetType: string
  checkFrequency: string; checkHour: number; checkDayOfWeek: number | null; checkDayOfMonth: number | null
  enabled: boolean; lastCheckedAt: string | null; monthThemeKeywords: string | null; saleKeywords: string | null
  subscriptionId: string | null; companyId: string | null
}

const FREQ_LABELS: Record<string, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' }
const SOURCE_TYPE_LABELS: Record<string, string> = { BLOG: 'Blog post', BLOG_LISTING: 'Blog listing', RSS: 'RSS feed' }

function ImportSourcesPanel({ subscriptionId }: { subscriptionId: string }) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ImportSource | null>(null)
  const queryClient = useQueryClient()
  const qKey = ['admin', 'import', 'sources', subscriptionId]

  const { data: sources = [], isLoading } = useQuery<ImportSource[]>({
    queryKey: qKey,
    queryFn: () => authFetch(`/admin/import/sources?subscriptionId=${subscriptionId}`),
    enabled: open,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/admin/import/sources/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const checkNowMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/admin/import/sources/${id}/check`, { method: 'POST', body: '{}' }),
    onSuccess: () => alert('Check triggered — new pending imports (if any) will appear shortly'),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-stone-800/40 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 text-sm">⚙️</span>
          <span className="text-stone-200 font-semibold text-sm">Import Sources</span>
          <span className="text-stone-500 text-xs">automatic scraping schedules</span>
        </div>
        <span className="text-stone-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-stone-800 p-4 space-y-4">
          {/* Source list */}
          {isLoading ? (
            <div className="text-stone-500 text-sm py-2 text-center">Loading…</div>
          ) : sources.length === 0 && !creating ? (
            <div className="text-stone-500 text-sm py-2 text-center">No import sources configured</div>
          ) : (
            sources.map(src => (
              editing?.id === src.id
                ? <ImportSourceForm key={src.id} subscriptionId={subscriptionId} initial={src}
                    onSaved={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: qKey }) }}
                    onCancel={() => setEditing(null)} />
                : (
                  <div key={src.id} className="bg-stone-800 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${src.enabled ? 'bg-green-400' : 'bg-stone-600'}`} />
                          <span className="text-stone-100 text-sm font-medium">{src.name}</span>
                          <span className="text-stone-500 text-xs">{SOURCE_TYPE_LABELS[src.sourceType] ?? src.sourceType}</span>
                          <span className="text-stone-500 text-xs">·</span>
                          <span className="text-stone-500 text-xs">{FREQ_LABELS[src.checkFrequency] ?? src.checkFrequency}</span>
                        </div>
                        <a href={src.url} target="_blank" rel="noopener noreferrer"
                          className="text-stone-500 hover:text-stone-300 text-xs truncate block">{src.url}</a>
                        {src.lastCheckedAt && (
                          <div className="text-stone-600 text-xs">Last checked: {new Date(src.lastCheckedAt).toLocaleString()}</div>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button disabled={checkNowMutation.isPending}
                          onClick={() => checkNowMutation.mutate(src.id)}
                          title="Check now"
                          className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded hover:bg-blue-500/10 disabled:opacity-50">
                          ▶ Run
                        </button>
                        <button onClick={() => setEditing(src)}
                          className="text-stone-400 hover:text-stone-200 text-xs px-2 py-1 rounded hover:bg-stone-700">Edit</button>
                        <button disabled={deleteMutation.isPending}
                          onClick={() => { if (confirm('Delete this import source?')) deleteMutation.mutate(src.id) }}
                          className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10 disabled:opacity-50">Delete</button>
                      </div>
                    </div>
                  </div>
                )
            ))
          )}
          {creating && (
            <ImportSourceForm subscriptionId={subscriptionId}
              onSaved={() => { setCreating(false); queryClient.invalidateQueries({ queryKey: qKey }) }}
              onCancel={() => setCreating(false)} />
          )}
          {!creating && !editing && (
            <button onClick={() => setCreating(true)}
              className="text-amber-400 hover:text-amber-300 text-xs px-3 py-2 rounded-lg hover:bg-amber-500/10 transition-colors">
              + Add import source
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Import source form (create / edit) ──────────────────────────────────────
function ImportSourceForm({
  subscriptionId, initial, onSaved, onCancel,
}: { subscriptionId: string; initial?: ImportSource; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [sourceType, setSourceType] = useState(initial?.sourceType ?? 'BLOG')
  const [freq, setFreq] = useState(initial?.checkFrequency ?? 'WEEKLY')
  const [hour, setHour] = useState(String(initial?.checkHour ?? 8))
  const [dayOfWeek, setDayOfWeek] = useState(String(initial?.checkDayOfWeek ?? 1))
  const [dayOfMonth, setDayOfMonth] = useState(String(initial?.checkDayOfMonth ?? 1))
  const [keywords, setKeywords] = useState(initial?.monthThemeKeywords ?? '')
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name, url, sourceType, subscriptionId,
        checkFrequency: freq,
        checkHour: parseInt(hour),
        checkDayOfWeek: freq === 'WEEKLY' ? parseInt(dayOfWeek) : undefined,
        checkDayOfMonth: freq === 'MONTHLY' ? parseInt(dayOfMonth) : undefined,
        monthThemeKeywords: keywords || undefined,
        enabled,
        targetType: 'MONTH_THEME',
      }
      return initial
        ? authFetch(`/admin/import/sources/${initial.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : authFetch('/admin/import/sources', { method: 'POST', body: JSON.stringify(body) })
    },
    onSuccess: onSaved,
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="bg-stone-800/60 rounded-xl p-4 space-y-3 border border-stone-700">
      <div className="text-stone-100 text-xs font-semibold uppercase tracking-wide">
        {initial ? 'Edit source' : 'New import source'}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={LABEL}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className={INPUT} placeholder="e.g. Illumicrate Blog" />
        </div>
        <div className="col-span-2">
          <label className={LABEL}>URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} className={INPUT} placeholder="https://..." />
        </div>
        <div>
          <label className={LABEL}>Source type</label>
          <select value={sourceType} onChange={e => setSourceType(e.target.value)} className={INPUT}>
            <option value="BLOG">Blog post (single URL)</option>
            <option value="BLOG_LISTING">Blog listing (archive)</option>
            <option value="RSS">RSS feed</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>Check frequency</label>
          <select value={freq} onChange={e => setFreq(e.target.value)} className={INPUT}>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>Check hour (UTC)</label>
          <select value={hour} onChange={e => setHour(e.target.value)} className={INPUT}>
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2,'0')}:00 UTC</option>)}
          </select>
        </div>
        {freq === 'WEEKLY' && (
          <div>
            <label className={LABEL}>Day of week</label>
            <select value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)} className={INPUT}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
        )}
        {freq === 'MONTHLY' && (
          <div>
            <label className={LABEL}>Day of month</label>
            <select value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)} className={INPUT}>
              {Array.from({ length: 28 }, (_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
            </select>
          </div>
        )}
        <div className="col-span-2">
          <label className={LABEL}>Month theme keywords (comma-separated, optional)</label>
          <input value={keywords} onChange={e => setKeywords(e.target.value)} className={INPUT}
            placeholder="reveal, theme, book of the month…" />
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <input type="checkbox" id="src-enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)}
            className="accent-amber-400" />
          <label htmlFor="src-enabled" className="text-stone-300 text-xs">Enabled</label>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={mutation.isPending || !name || !url}
          onClick={() => mutation.mutate()}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-sm">
          {mutation.isPending ? 'Saving…' : initial ? 'Save changes' : 'Create source'}
        </button>
        <button type="button" onClick={onCancel}
          className="bg-stone-700 text-stone-300 px-4 py-2 rounded-lg hover:bg-stone-600 text-sm">Cancel</button>
      </div>
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
          {changes.map(pc => (
            <div key={pc.id} className="flex items-center justify-between bg-stone-800 rounded-lg px-3 py-2 text-sm">
              <div className="space-y-0.5">
                <span className="text-stone-100 font-medium">
                  {MONTH_NAMES[pc.effectiveMonth - 1]} {pc.effectiveYear} — {parseFloat(pc.newBasePrice).toFixed(2)} {pc.currency}
                </span>
                {pc.notes && <p className="text-stone-500 text-xs">{pc.notes}</p>}
              </div>
              <button
                onClick={() => { if (confirm('Delete this price change?')) deleteMutation.mutate(pc.id) }}
                disabled={deleteMutation.isPending}
                className="text-red-500 hover:text-red-400 text-xs transition-colors ml-3 shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
interface SubscriptionInfo { id: string; name: string; currency?: string | null; companyId?: string | null; price?: number | null; renewalDay?: number | null; language?: string | null }

type MonthsPage = { data: Month[]; total: number; page: number; pageSize: number; totalPages: number }

export default function SubscriptionMonthsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const queryClient = useQueryClient()
  const [importUrlOpen, setImportUrlOpen] = useState(false)
  const [addMonthOpen, setAddMonthOpen] = useState(false)
  const [loadedPages, setLoadedPages] = useState<Month[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)

  const PAGE_SIZE = 12

  const { data: subscription } = useQuery<SubscriptionInfo>({
    queryKey: ['admin', 'subscriptions', slug],
    queryFn: () => authFetch<SubscriptionInfo>(`/subscriptions/${slug}`),
  })

  const { data: firstPage, isLoading } = useQuery<MonthsPage>({
    queryKey: ['admin', 'subscriptions', slug, 'months', 1],
    queryFn: () => authFetch<MonthsPage>(`/subscriptions/${slug}/months?all=true&page=1&pageSize=${PAGE_SIZE}`),
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
        {/* Top action row — only buttons, no expanding content */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { setAddMonthOpen(!addMonthOpen); if (importUrlOpen) setImportUrlOpen(false) }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${addMonthOpen ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-amber-400 text-stone-950 hover:bg-amber-300'}`}
          >
            + Add Month
          </button>
          <button
            onClick={() => { setImportUrlOpen(!importUrlOpen); if (addMonthOpen) setAddMonthOpen(false) }}
            title="do pobierania danych historycznych"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${importUrlOpen ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-stone-700 hover:bg-stone-600 text-stone-300'}`}
          >
            <span>🕐</span>
            <span className="text-xs">Import history</span>
          </button>
        </div>

        {/* Add month form panel */}
        <AddMonthForm slug={slug} onSuccess={invalidateMonths} open={addMonthOpen} onClose={() => setAddMonthOpen(false)} />

        {/* Import URL panel */}
        {importUrlOpen && subscription?.id && (
          <ImportUrlPanel
            subscriptionId={subscription.id}
            slug={slug}
            onMonthCreated={() => { invalidateMonths(); setImportUrlOpen(false) }}
            onMonthSaved={invalidateMonths}
          />
        )}

        {/* Month list */}
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
                defaultCurrency={subscription?.currency}
                defaultCompanyId={subscription?.companyId}
                defaultPrice={subscription?.price}
                renewalDay={subscription?.renewalDay}
                defaultLanguage={subscription?.language}
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

        {/* Pending imports + import sources panels (visible when subscription is loaded) */}
        {subscription?.id && (
          <>
            <PendingImportsPanel subscriptionId={subscription.id} slug={slug} onApproved={invalidateMonths} />
            <ImportSourcesPanel subscriptionId={subscription.id} />
            <PriceChangesPanel slug={slug} subscriptionCurrency={subscription?.currency} />
          </>
        )}
      </div>
    </div>
  )
}
