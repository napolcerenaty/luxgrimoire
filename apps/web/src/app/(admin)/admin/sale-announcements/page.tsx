'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiSaleAnnouncement, ApiBookBoxCompany } from '@luxgrimoire/shared-types'
import {
  adminGetSaleAnnouncements,
  adminCreateSaleAnnouncement,
  adminUpdateSaleAnnouncement,
  adminDeleteSaleAnnouncement,
  adminAddAnnouncementEdition,
  adminRemoveAnnouncementEdition,
  type SaleAnnouncementFormData,
} from '@/lib/api'
import { authFetch } from '@/lib/authFetch'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import CreateBookEditionForm from '@/components/admin/CreateBookEditionForm'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-sm text-stone-400 mb-1'
const SEL = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'

const CURRENCIES = [
  'AED','AUD','BGN','BRL','CAD','CHF','CNY','CZK','DKK','EGP',
  'EUR','GBP','HKD','HRK','HUF','IDR','ILS','INR','JPY','KRW',
  'MAD','MXN','MYR','NOK','NZD','PHP','PLN','RON','RUB','SAR',
  'SEK','SGD','THB','TND','TRY','TWD','UAH','USD','VND','ZAR',
]

const ALL_TIMEZONES: string[] = typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
  ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone')
  : [
    'Africa/Cairo','Africa/Johannesburg','Africa/Lagos','America/Anchorage',
    'America/Argentina/Buenos_Aires','America/Bogota','America/Chicago',
    'America/Denver','America/Los_Angeles','America/Mexico_City',
    'America/New_York','America/Phoenix','America/Sao_Paulo','America/Toronto',
    'Asia/Bangkok','Asia/Colombo','Asia/Dubai','Asia/Hong_Kong','Asia/Jakarta',
    'Asia/Karachi','Asia/Kolkata','Asia/Kuala_Lumpur','Asia/Manila',
    'Asia/Riyadh','Asia/Seoul','Asia/Shanghai','Asia/Singapore',
    'Asia/Taipei','Asia/Tehran','Asia/Tokyo','Australia/Adelaide',
    'Australia/Brisbane','Australia/Melbourne','Australia/Sydney',
    'Europe/Amsterdam','Europe/Athens','Europe/Berlin','Europe/Brussels',
    'Europe/Bucharest','Europe/Budapest','Europe/Copenhagen','Europe/Dublin',
    'Europe/Helsinki','Europe/Istanbul','Europe/Kiev','Europe/Lisbon',
    'Europe/London','Europe/Madrid','Europe/Moscow','Europe/Oslo',
    'Europe/Paris','Europe/Prague','Europe/Rome','Europe/Stockholm',
    'Europe/Vienna','Europe/Warsaw','Europe/Zurich','Pacific/Auckland',
    'Pacific/Honolulu','Pacific/Sydney','UTC',
  ]

function cloudThumb(id: string, w = 80, h = 100) {
  if (!id) return null
  if (id.startsWith('http')) return id
  return `https://res.cloudinary.com/${CLOUD}/image/upload/w_${w},h_${h},c_fill,q_auto,f_auto/${id}`
}

async function uploadImage(file: File, folder: string): Promise<string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const res = await fetch(`${API_BASE}/upload/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data: dataUri, folder }),
  })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json() as { publicId: string }
  return json.publicId
}

// ─── Multi-image upload ───────────────────────────────────────────────────────
function MultiImageUpload({ images, folder, onChange }: {
  images: string[]
  folder: string
  onChange: (v: string[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    const results: string[] = [...images]
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} / ${files.length}…`)
      try {
        const id = await uploadImage(files[i], folder)
        results.push(id)
        onChange([...results])
      } catch { /* skip failed */ }
    }
    setProgress('')
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button type="button" disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 disabled:opacity-50 transition-colors">
          {uploading ? progress : images.length === 0 ? '+ Upload images' : '+ Add more images'}
        </button>
        <span className="text-stone-600 text-xs">
          {images.length === 0 ? 'first image will be the main cover' : 'select multiple files at once'}
        </span>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {images.map((img, i) => {
            const thumb = cloudThumb(img)
            const isMain = i === 0
            return (
              <div key={i} className="relative group">
                <div className={`w-16 h-20 rounded-lg overflow-hidden bg-stone-800 border ${isMain ? 'border-amber-500 ring-1 ring-amber-500/40' : 'border-stone-700'}`}>
                  {thumb
                    ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                    : <span className="text-stone-600 text-[9px] flex items-center justify-center h-full">img</span>
                  }
                </div>
                {isMain && (
                  <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] font-semibold uppercase text-amber-400 bg-stone-950/70 px-0.5 py-px leading-tight">
                    main
                  </span>
                )}
                <button type="button"
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  ✕
                </button>
                {!isMain && (
                  <button type="button"
                    onClick={() => {
                      const r = [...images]
                      r.splice(i, 1)
                      r.unshift(img)
                      onChange(r)
                    }}
                    title="Set as main cover"
                    className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-stone-500 hover:text-amber-400 bg-stone-950/70 px-0.5 py-px leading-tight opacity-0 group-hover:opacity-100 transition-opacity">
                    set main
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

// ─── Timezone picker ──────────────────────────────────────────────────────────
function TimezonePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState('')
  const filtered = search
    ? ALL_TIMEZONES.filter(tz => tz.toLowerCase().includes(search.toLowerCase()))
    : ALL_TIMEZONES

  return (
    <div>
      <input
        className={`${INP} mb-1`}
        placeholder="Filter timezones…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <select className={SEL} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">-- No timezone --</option>
        {filtered.map(tz => (
          <option key={tz} value={tz}>{tz}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Edition picker ───────────────────────────────────────────────────────────
interface LinkedEdition {
  editionId: string
  bookTitle: string
  editionName?: string | null
  coverImage?: string | null
  publisher?: string | null
}

interface BookInfo {
  id: string
  title: string
  coverImage?: string | null
  authors?: { author: { name: string } }[]
}

interface EditionInfo {
  id: string
  editionName?: string | null
  coverImage?: string | null
  publisher?: string | null
  publishYear?: number | null
}

function EditionPicker({ linked, onAdd, onRemove }: {
  linked: LinkedEdition[]
  onAdd: (e: LinkedEdition) => void
  onRemove: (editionId: string) => void
}) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedBook, setSelectedBook] = useState<BookInfo | null>(null)
  const [mode, setMode] = useState<'search' | 'createBook' | 'createEdition'>('search')

  const { data: bookResults, isFetching: searching } = useQuery({
    queryKey: ['book-search', debounced],
    queryFn: () => authFetch<{ data: BookInfo[] }>(`/books?search=${encodeURIComponent(debounced)}&pageSize=10`),
    enabled: debounced.length >= 2,
  })

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

  const addEdition = (ed: EditionInfo) => {
    if (!selectedBook) return
    if (linked.some(l => l.editionId === ed.id)) return
    onAdd({
      editionId: ed.id,
      bookTitle: selectedBook.title,
      editionName: ed.editionName,
      coverImage: ed.coverImage,
      publisher: ed.publisher,
    })
    setSearch('')
    setDebounced('')
    setSelectedBook(null)
    setMode('search')
  }

  const inputCls = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'

  if (mode === 'createBook') {
    return (
      <div className="border border-stone-700 rounded-lg p-3 mt-2">
        <CreateBookEditionForm
          bookOnly
          onSuccess={() => { setMode('search') }}
          onCancel={() => setMode('search')}
        />
      </div>
    )
  }

  if (mode === 'createEdition' && selectedBook) {
    return (
      <div className="border border-stone-700 rounded-lg p-3 mt-2">
        <CreateBookEditionForm
          existingBookId={selectedBook.id}
          onSuccess={(editionId) => {
            if (editionId) {
              onAdd({
                editionId,
                bookTitle: selectedBook.title,
                editionName: null,
                coverImage: null,
              })
            }
            setMode('search')
            setSelectedBook(null)
          }}
          onCancel={() => setMode('search')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Linked editions list */}
      {linked.length > 0 && (
        <div className="flex flex-col gap-1 mb-2">
          {linked.map(e => {
            const thumb = e.coverImage ? cloudThumb(e.coverImage, 32, 40) : null
            return (
              <div key={e.editionId} className="flex items-center gap-2 bg-stone-800 rounded-lg px-3 py-2">
                {thumb
                  ? <img src={thumb} alt="" className="w-8 h-10 object-cover rounded" />
                  : <div className="w-8 h-10 bg-stone-700 rounded" />
                }
                <div className="flex-1 min-w-0">
                  <div className="text-stone-100 text-xs font-medium truncate">{e.bookTitle}</div>
                  <div className="text-stone-500 text-xs truncate">{e.editionName ?? 'Standard'}{e.publisher ? ` · ${e.publisher}` : ''}</div>
                </div>
                <button type="button" onClick={() => onRemove(e.editionId)}
                  className="text-red-400 hover:text-red-300 text-xs shrink-0">Remove</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Search / book selected views */}
      {selectedBook ? (
        <div className="space-y-2 border border-stone-700 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 text-stone-100 text-sm font-medium">{selectedBook.title}</div>
            <button type="button" onClick={() => setSelectedBook(null)}
              className="text-stone-500 hover:text-stone-300 text-xs">← Back</button>
          </div>
          <div className="text-xs text-stone-400 font-semibold uppercase tracking-wide">Pick edition</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {editions.map(ed => (
              <button key={ed.id} type="button"
                onClick={() => addEdition(ed)}
                disabled={linked.some(l => l.editionId === ed.id)}
                className="w-full text-left flex items-center gap-2 px-3 py-2 rounded bg-stone-700 hover:bg-stone-600 disabled:opacity-40 transition-colors"
              >
                {ed.coverImage
                  ? <img src={cloudThumb(ed.coverImage, 32, 40) ?? ''} alt="" className="w-8 h-10 object-cover rounded" />
                  : <div className="w-8 h-10 bg-stone-600 rounded" />
                }
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
      ) : (
        <div className="space-y-1 border border-stone-700 rounded-lg p-3">
          <input value={search} onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search books by title…" className={inputCls} />
          {searching && <div className="text-stone-500 text-xs">Searching…</div>}
          {search.length >= 2 && !searching && bookResults && (
            <div className="space-y-1 max-h-48 overflow-y-auto mt-1">
              {bookResults.data.length === 0
                ? <div className="text-stone-500 text-xs px-2">No books found</div>
                : bookResults.data.map(book => (
                  <button key={book.id} type="button" onClick={() => setSelectedBook(book)}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded bg-stone-700 hover:bg-stone-600 transition-colors"
                  >
                    {book.coverImage
                      ? <img src={cloudThumb(book.coverImage, 32, 40) ?? ''} alt="" className="w-8 h-10 object-cover rounded" />
                      : <div className="w-8 h-10 bg-stone-600 rounded" />
                    }
                    <div>
                      <div className="text-stone-100 text-sm">{book.title}</div>
                      {book.authors && book.authors.length > 0 && (
                        <div className="text-stone-500 text-xs">{book.authors.map((a: { author: { name: string } }) => a.author.name).join(', ')}</div>
                      )}
                    </div>
                  </button>
                ))
              }
            </div>
          )}
          <button type="button" onClick={() => setMode('createBook')}
            className="text-amber-400 hover:text-amber-300 text-xs mt-1 block">+ Create new book</button>
        </div>
      )}
    </div>
  )
}

// ─── Form state ───────────────────────────────────────────────────────────────
interface FormState {
  title: string
  companyId: string
  description: string
  generalSaleDate: string
  firstAccessDate: string
  earlyAccessDate: string
  saleTimezone: string
  basePrice: string
  currency: string
  allImages: string[]
  isPublished: boolean
  isBundle: boolean
  linkedEditions: LinkedEdition[]
}

const EMPTY_FORM: FormState = {
  title: '',
  companyId: '',
  description: '',
  generalSaleDate: '',
  firstAccessDate: '',
  earlyAccessDate: '',
  saleTimezone: 'UTC',
  basePrice: '',
  currency: 'USD',
  allImages: [],
  isPublished: false,
  isBundle: false,
  linkedEditions: [],
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  try { return new Date(iso).toISOString().slice(0, 16) } catch { return '' }
}

function announcementToForm(a: ApiSaleAnnouncement): FormState {
  let extraImages: string[] = []
  if (a.extraImagesJson) {
    try { extraImages = JSON.parse(a.extraImagesJson) } catch { extraImages = [] }
  }
  const allImages = [
    ...(a.imageUrl ? [a.imageUrl] : []),
    ...extraImages,
  ]
  const linkedEditions: LinkedEdition[] = (a.editions ?? []).map(e => ({
    editionId: e.editionId,
    bookTitle: e.edition?.book?.title ?? '',
    editionName: e.edition?.editionName ?? null,
    coverImage: e.edition?.coverImage ?? null,
  }))
  return {
    title: a.title,
    companyId: a.companyId ?? '',
    description: a.description ?? '',
    generalSaleDate: toDatetimeLocal(a.generalSaleDate),
    firstAccessDate: toDatetimeLocal(a.firstAccessDate),
    earlyAccessDate: toDatetimeLocal(a.earlyAccessDate),
    saleTimezone: a.saleTimezone ?? 'UTC',
    basePrice: a.basePrice != null ? String(a.basePrice) : '',
    currency: a.currency ?? 'USD',
    allImages,
    isPublished: a.isPublished,
    isBundle: a.isBundle,
    linkedEditions,
  }
}

function formToData(f: FormState): SaleAnnouncementFormData {
  return {
    title: f.title,
    companyId: f.companyId || undefined,
    description: f.description || undefined,
    generalSaleDate: f.generalSaleDate || undefined,
    firstAccessDate: f.firstAccessDate || undefined,
    earlyAccessDate: f.earlyAccessDate || undefined,
    saleTimezone: f.saleTimezone || undefined,
    basePrice: f.basePrice ? Number(f.basePrice) : undefined,
    currency: f.currency || undefined,
    imageUrl: f.allImages[0] || undefined,
    extraImages: f.allImages.length > 1 ? f.allImages.slice(1) : undefined,
    isPublished: f.isPublished,
    isBundle: f.isBundle,
    editionIds: f.linkedEditions.length > 0 ? f.linkedEditions.map(e => e.editionId) : undefined,
  }
}

// ─── Form component ───────────────────────────────────────────────────────────
function SaleAnnouncementForm({ initial, onSubmit, submitting, submitLabel }: {
  initial: FormState
  onSubmit: (data: FormState) => void
  submitting: boolean
  submitLabel: string
}) {
  const [form, setForm] = useState<FormState>(initial)
  const [companySearch, setCompanySearch] = useState('')
  const [editionsOpen, setEditionsOpen] = useState(initial.linkedEditions.length > 0)
  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))
  const setCheck = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.checked }))

  const { data: companiesResp } = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () => authFetch<{ data: ApiBookBoxCompany[] } | ApiBookBoxCompany[]>('/companies?pageSize=100'),
  })
  const allCompanies: ApiBookBoxCompany[] = Array.isArray(companiesResp)
    ? companiesResp
    : (companiesResp as { data: ApiBookBoxCompany[] })?.data ?? []
  const filteredCompanies = companySearch
    ? allCompanies.filter(c => c.name.toLowerCase().includes(companySearch.toLowerCase()))
    : allCompanies

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="flex flex-col gap-4">

      {/* Title */}
      <div>
        <label className={LBL}>Title *</label>
        <input required className={INP} value={form.title} onChange={set('title')} />
      </div>

      {/* Description */}
      <div>
        <label className={LBL}>Description</label>
        <textarea rows={3} className={INP} value={form.description} onChange={set('description')} />
      </div>

      {/* Company */}
      <div>
        <label className={LBL}>Company</label>
        <input className={`${INP} mb-1`} placeholder="Search companies…"
          value={companySearch} onChange={e => setCompanySearch(e.target.value)} />
        <select className={SEL} value={form.companyId} onChange={set('companyId')}>
          <option value="">-- No company --</option>
          {filteredCompanies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>General Sale Date &amp; Time</label>
          <input type="datetime-local" className={INP} value={form.generalSaleDate} onChange={set('generalSaleDate')} />
        </div>
        <div>
          <label className={LBL}>First Access Date &amp; Time</label>
          <input type="datetime-local" className={INP} value={form.firstAccessDate} onChange={set('firstAccessDate')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Early Access Date &amp; Time</label>
          <input type="datetime-local" className={INP} value={form.earlyAccessDate} onChange={set('earlyAccessDate')} />
        </div>
        <div>
          <label className={LBL}>Timezone</label>
          <TimezonePicker value={form.saleTimezone} onChange={v => setForm(f => ({ ...f, saleTimezone: v }))} />
        </div>
      </div>

      {/* Price */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Base Price</label>
          <input type="number" step="0.01" min="0" className={INP} value={form.basePrice} onChange={set('basePrice')} />
        </div>
        <div>
          <label className={LBL}>Currency</label>
          <input className={INP} list="sale-currencies" value={form.currency} onChange={set('currency')} placeholder="USD" />
          <datalist id="sale-currencies">{CURRENCIES.map(c => <option key={c} value={c} />)}</datalist>
        </div>
      </div>

      {/* Images */}
      <div>
        <label className={LBL}>Images <span className="text-stone-500">(first = main cover)</span></label>
        <MultiImageUpload
          images={form.allImages}
          folder="luxgrimoire/announcements"
          onChange={imgs => setForm(f => ({ ...f, allImages: imgs }))}
        />
      </div>

      {/* Linked Books — collapsible */}
      <div className="border border-stone-700 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setEditionsOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-stone-800/60 hover:bg-stone-800 transition-colors text-left"
        >
          <span className="flex items-center gap-2 text-sm text-stone-300 font-medium">
            Linked Books
            {form.linkedEditions.length > 0 && (
              <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
                {form.linkedEditions.length}
              </span>
            )}
          </span>
          <span className="text-stone-500 text-xs">{editionsOpen ? '▲' : '▼'}</span>
        </button>
        {editionsOpen && (
          <div className="p-4 border-t border-stone-700">
            <EditionPicker
              linked={form.linkedEditions}
              onAdd={e => setForm(f => ({ ...f, linkedEditions: [...f.linkedEditions, e] }))}
              onRemove={id => setForm(f => ({ ...f, linkedEditions: f.linkedEditions.filter(e => e.editionId !== id) }))}
            />
          </div>
        )}
      </div>

      {/* Flags */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
          <input type="checkbox" checked={form.isPublished} onChange={setCheck('isPublished')} className="accent-amber-400" />
          <span>Published <span className="text-stone-500">— visible to users in the public listing</span></span>
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
          <input type="checkbox" checked={form.isBundle} onChange={setCheck('isBundle')} className="accent-amber-400" />
          <span>Is Bundle <span className="text-stone-500">— multiple editions sold together as a set</span></span>
        </label>
      </div>

      <button type="submit" disabled={submitting}
        className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors">
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

// ─── Announcement Books Panel ─────────────────────────────────────────────────
function AnnouncementBooksPanel({ announcement }: { announcement: ApiSaleAnnouncement }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [addMode, setAddMode] = useState(false)

  const editions = announcement.editions ?? []

  const addMutation = useMutation({
    mutationFn: (editionId: string) => adminAddAnnouncementEdition(announcement.id, editionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] })
      setAddMode(false)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const removeMutation = useMutation({
    mutationFn: (editionId: string) => adminRemoveAnnouncementEdition(announcement.id, editionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  return (
    <div className="border-t border-stone-700 mt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-stone-800/40 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-sm text-stone-400">
          Linked Books
          {editions.length > 0 && (
            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">{editions.length}</span>
          )}
        </span>
        <span className="text-stone-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {editions.length === 0 && (
            <p className="text-stone-500 text-xs py-2">No linked books yet.</p>
          )}
          {editions.map(e => {
            const thumb = e.edition?.coverImage ? cloudThumb(e.edition.coverImage, 48, 60) : null
            return (
              <div key={e.editionId} className="flex items-center gap-3 bg-stone-800/50 rounded-lg px-3 py-2">
                {thumb
                  ? <img src={thumb} className="w-9 h-11 object-cover rounded" />
                  : <div className="w-9 h-11 bg-stone-700 rounded flex items-center justify-center text-stone-500 text-xs">?</div>
                }
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-stone-200 truncate">{e.edition?.book?.title ?? 'Unknown'}</div>
                  {e.edition?.editionName && (
                    <div className="text-xs text-stone-400 truncate">{e.edition.editionName}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeMutation.mutate(e.editionId)}
                  disabled={removeMutation.isPending}
                  className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-400/10 transition-colors"
                >
                  Remove
                </button>
              </div>
            )
          })}

          {addMode ? (
            <div className="pt-2">
              <EditionPicker
                linked={editions.map(e => ({
                  editionId: e.editionId,
                  bookTitle: e.edition?.book?.title ?? '',
                  editionName: e.edition?.editionName ?? null,
                  coverImage: e.edition?.coverImage ?? null,
                }))}
                onAdd={linked => addMutation.mutate(linked.editionId)}
                onRemove={editionId => removeMutation.mutate(editionId)}
              />
              <button
                type="button"
                onClick={() => setAddMode(false)}
                className="mt-2 text-xs text-stone-400 hover:text-stone-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddMode(true)}
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors pt-1"
            >
              + Add Book
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Announcement Card ────────────────────────────────────────────────────────
function AnnouncementCard({
  announcement,
  companyMap,
  onEdit,
  onDelete,
}: {
  announcement: ApiSaleAnnouncement
  companyMap: Record<string, string>
  onEdit: () => void
  onDelete: () => void
}) {
  const thumb = announcement.imageUrl ? cloudThumb(announcement.imageUrl, 64, 80) : null
  const companyName = announcement.companyId ? (companyMap[announcement.companyId] ?? announcement.companyId) : null
  const saleDate = announcement.generalSaleDate
    ? new Date(announcement.generalSaleDate).toLocaleString()
    : null

  return (
    <div className="bg-stone-900 border border-stone-700 rounded-xl overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        {thumb
          ? <img src={thumb} className="w-12 h-15 object-cover rounded-lg flex-shrink-0" style={{ height: '60px', width: '48px' }} />
          : <div className="w-12 bg-stone-700 rounded-lg flex-shrink-0 flex items-center justify-center text-stone-500 text-xs" style={{ height: '60px', width: '48px' }}>—</div>
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-stone-100 font-medium truncate">{announcement.title}</h3>
              {companyName && <p className="text-stone-400 text-xs mt-0.5">{companyName}</p>}
              {saleDate && <p className="text-stone-500 text-xs mt-1">📅 {saleDate}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {announcement.isPublished && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-900/40 text-green-400">Published</span>
              )}
              {announcement.isBundle && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400">Bundle</span>
              )}
              <button onClick={onEdit}
                className="text-amber-400 hover:text-amber-300 text-xs px-3 py-1 rounded border border-stone-600 hover:border-amber-400/50 transition-colors">
                Edit
              </button>
              <button onClick={onDelete}
                className="text-red-400 hover:text-red-300 text-xs px-3 py-1 rounded border border-stone-600 hover:border-red-400/50 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
      <AnnouncementBooksPanel announcement={announcement} />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminSaleAnnouncementsPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editItem, setEditItem] = useState<ApiSaleAnnouncement | null>(null)
  const [deleteItem, setDeleteItem] = useState<ApiSaleAnnouncement | null>(null)

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['admin', 'sale-announcements'],
    queryFn: adminGetSaleAnnouncements,
  })

  const { data: companiesResp } = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () => authFetch<{ data: ApiBookBoxCompany[] } | ApiBookBoxCompany[]>('/companies?pageSize=100'),
  })
  const allCompanies: ApiBookBoxCompany[] = Array.isArray(companiesResp)
    ? companiesResp
    : (companiesResp as { data: ApiBookBoxCompany[] })?.data ?? []
  const companyMap = Object.fromEntries(allCompanies.map(c => [c.id, c.name]))

  const createMutation = useMutation({
    mutationFn: (form: FormState) => adminCreateSaleAnnouncement(formToData(form)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }); setCreateOpen(false) },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: FormState }) => adminUpdateSaleAnnouncement(id, formToData(form)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }); setEditItem(null) },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminDeleteSaleAnnouncement(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }); setDeleteItem(null) },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Sale Announcements</h1>
        <button onClick={() => setCreateOpen(true)}
          className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors">
          Add Sale
        </button>
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : announcements.length === 0 ? (
        <div className="text-stone-500 py-8 text-center">No sale announcements yet.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map(a => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              companyMap={companyMap}
              onEdit={() => setEditItem(a)}
              onDelete={() => setDeleteItem(a)}
            />
          ))}
        </div>
      )}

      <FormModal open={createOpen} title="Add Sale Announcement" onClose={() => setCreateOpen(false)}>
        <SaleAnnouncementForm
          initial={EMPTY_FORM}
          submitLabel="Create"
          submitting={createMutation.isPending}
          onSubmit={form => createMutation.mutate(form)}
        />
      </FormModal>

      <FormModal open={editItem !== null} title="Edit Sale Announcement" onClose={() => setEditItem(null)}>
        {editItem && (
          <SaleAnnouncementForm
            initial={announcementToForm(editItem)}
            submitLabel="Save Changes"
            submitting={editMutation.isPending}
            onSubmit={form => editMutation.mutate({ id: editItem.id, form })}
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteItem !== null}
        message={`Delete "${deleteItem?.title}"? This cannot be undone.`}
        onConfirm={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
        onCancel={() => setDeleteItem(null)}
      />
    </div>
  )
}
