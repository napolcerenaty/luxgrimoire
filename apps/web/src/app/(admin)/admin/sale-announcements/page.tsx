'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiSaleAnnouncement, ApiBookBoxCompany } from '@luxgrimoire/shared-types'
import {
  adminGetSaleAnnouncements,
  adminCreateSaleAnnouncement,
  adminUpdateSaleAnnouncement,
  adminDeleteSaleAnnouncement,
  adminAddAnnouncementEdition,
  adminRemoveAnnouncementEdition,
  adminSetAnnouncementVariant,
  adminRemoveAnnouncementVariant,
  adminUpsertAnnouncementRegion,
  adminDeleteAnnouncementRegion,
  type SaleAnnouncementFormData,
} from '@/lib/api'
import { authFetch } from '@/lib/authFetch'
import FormModal from '@/components/admin/FormModal'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import CreateBookEditionForm from '@/components/admin/CreateBookEditionForm'
import MultiImageUpload, { uploadImage } from '@/components/admin/MultiImageUpload'

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-sm text-stone-400 mb-1'

const CURRENCIES = [
  'AED','AUD','BGN','BRL','CAD','CHF','CNY','CZK','DKK','EGP',
  'EUR','GBP','HKD','HRK','HUF','IDR','ILS','INR','JPY','KRW',
  'MAD','MXN','MYR','NOK','NZD','PHP','PLN','RON','RUB','SAR',
  'SEK','SGD','THB','TND','TRY','TWD','UAH','USD','VND','ZAR',
]

// Timezone abbreviations (code → display label)
const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'UTC',   label: 'UTC – Coordinated Universal Time (UTC+0)' },
  { value: 'GMT',   label: 'GMT – Greenwich Mean Time (UTC+0)' },
  { value: 'BST',   label: 'BST – British Summer Time (UTC+1)' },
  { value: 'WET',   label: 'WET – Western European Time (UTC+0)' },
  { value: 'WEST',  label: 'WEST – Western European Summer Time (UTC+1)' },
  { value: 'CET',   label: 'CET – Central European Time (UTC+1)' },
  { value: 'CEST',  label: 'CEST – Central European Summer Time (UTC+2)' },
  { value: 'EET',   label: 'EET – Eastern European Time (UTC+2)' },
  { value: 'EEST',  label: 'EEST – Eastern European Summer Time (UTC+3)' },
  { value: 'MSK',   label: 'MSK – Moscow Standard Time (UTC+3)' },
  { value: 'TRT',   label: 'TRT – Turkey Time (UTC+3)' },
  { value: 'GST',   label: 'GST – Gulf Standard Time (UTC+4)' },
  { value: 'PKT',   label: 'PKT – Pakistan Standard Time (UTC+5)' },
  { value: 'IST',   label: 'IST – India Standard Time (UTC+5:30)' },
  { value: 'BST_BD',label: 'BST (BD) – Bangladesh Standard Time (UTC+6)' },
  { value: 'ICT',   label: 'ICT – Indochina Time (UTC+7)' },
  { value: 'SGT',   label: 'SGT – Singapore Time (UTC+8)' },
  { value: 'HKT',   label: 'HKT – Hong Kong Time (UTC+8)' },
  { value: 'CST',   label: 'CST – China Standard Time (UTC+8)' },
  { value: 'JST',   label: 'JST – Japan Standard Time (UTC+9)' },
  { value: 'KST',   label: 'KST – Korea Standard Time (UTC+9)' },
  { value: 'ACST',  label: 'ACST – Australian Central Standard Time (UTC+9:30)' },
  { value: 'ACDT',  label: 'ACDT – Australian Central Daylight Time (UTC+10:30)' },
  { value: 'AEST',  label: 'AEST – Australian Eastern Standard Time (UTC+10)' },
  { value: 'AEDT',  label: 'AEDT – Australian Eastern Daylight Time (UTC+11)' },
  { value: 'NZST',  label: 'NZST – New Zealand Standard Time (UTC+12)' },
  { value: 'NZDT',  label: 'NZDT – New Zealand Daylight Time (UTC+13)' },
  { value: 'HST',   label: 'HST – Hawaii Standard Time (UTC-10)' },
  { value: 'AKST',  label: 'AKST – Alaska Standard Time (UTC-9)' },
  { value: 'AKDT',  label: 'AKDT – Alaska Daylight Time (UTC-8)' },
  { value: 'PST',   label: 'PST – Pacific Standard Time (UTC-8)' },
  { value: 'PDT',   label: 'PDT – Pacific Daylight Time (UTC-7)' },
  { value: 'MST',   label: 'MST – Mountain Standard Time (UTC-7)' },
  { value: 'MDT',   label: 'MDT – Mountain Daylight Time (UTC-6)' },
  { value: 'CST_US',label: 'CST (US) – Central Standard Time (UTC-6)' },
  { value: 'CDT',   label: 'CDT – Central Daylight Time (UTC-5)' },
  { value: 'EST',   label: 'EST – Eastern Standard Time (UTC-5)' },
  { value: 'EDT',   label: 'EDT – Eastern Daylight Time (UTC-4)' },
  { value: 'AST',   label: 'AST – Atlantic Standard Time (UTC-4)' },
  { value: 'ADT',   label: 'ADT – Atlantic Daylight Time (UTC-3)' },
  { value: 'BRT',   label: 'BRT – Brasilia Time (UTC-3)' },
  { value: 'ART',   label: 'ART – Argentina Time (UTC-3)' },
]

// ─── ComboBox ──────────────────────────────────────────────────────────────────
function ComboBox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  allowFreeform = false,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  allowFreeform?: boolean
}) {
  const [inputText, setInputText] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Derive display text from current value
  const selectedLabel = options.find(o => o.value === value)?.label ?? value

  // When not focused, show the selected label; when focused, show what user is typing
  const displayText = focused ? inputText : selectedLabel

  const filtered = inputText
    ? options.filter(o =>
        o.label.toLowerCase().includes(inputText.toLowerCase()) ||
        o.value.toLowerCase().includes(inputText.toLowerCase())
      )
    : options

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setFocused(false)
        setInputText('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleFocus = () => {
    setFocused(true)
    setInputText('')
    setOpen(true)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value)
    setOpen(true)
    if (allowFreeform) onChange(e.target.value)
  }

  const handleSelect = (opt: { value: string; label: string }) => {
    onChange(opt.value)
    setInputText('')
    setFocused(false)
    setOpen(false)
  }

  const handleBlur = () => {
    // Delay to allow click on option to fire first
    setTimeout(() => {
      setFocused(false)
      setInputText('')
      setOpen(false)
    }, 150)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); setFocused(false); setInputText('') }
    if (e.key === 'Enter' && filtered.length === 1) { handleSelect(filtered[0]); e.preventDefault() }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className={INP}
        value={displayText}
        placeholder={placeholder}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-stone-800 border border-stone-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {filtered.map(opt => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={() => handleSelect(opt)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-700 transition-colors ${opt.value === value ? 'text-amber-400 bg-stone-700/50' : 'text-stone-200'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}



function cloudThumb(id: string, w = 80, h = 100) {
  if (!id) return null
  if (id.startsWith('http')) return id
  return `https://res.cloudinary.com/${CLOUD}/image/upload/w_${w},h_${h},c_fill,q_auto,f_auto/${id}`
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
}

function EditionPicker({ linked, onAdd, onRemove, defaultFirstAccessDate, defaultEarlyAccessDate, defaultGeneralSaleDate, defaultPrice, defaultCurrency }: {
  linked: LinkedEdition[]
  onAdd: (e: LinkedEdition) => void
  onRemove: (editionId: string) => void
  defaultFirstAccessDate?: string | null
  defaultEarlyAccessDate?: string | null
  defaultGeneralSaleDate?: string | null
  defaultPrice?: number | null
  defaultCurrency?: string | null
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
          onBookCreated={(bookId, bookTitle) => {
            setSelectedBook({ id: bookId, title: bookTitle })
            setMode('createEdition')
          }}
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
          defaultFirstAccessDate={defaultFirstAccessDate}
          defaultEarlyAccessDate={defaultEarlyAccessDate}
          defaultGeneralSaleDate={defaultGeneralSaleDate}
          defaultPrice={defaultPrice}
          defaultCurrency={defaultCurrency}
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
                  <div className="text-stone-500 text-xs">{ed.publisher ?? ''}</div>
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
  generalSaleDate: string
  firstAccessDate: string
  earlyAccessDate: string
  saleTimezone: string
  basePrice: string
  currency: string
  allImages: string[]
  isBundle: boolean
  expectedShipping: string
  linkedEditions: LinkedEdition[]
}

const EMPTY_FORM: FormState = {
  title: '',
  companyId: '',
  generalSaleDate: '',
  firstAccessDate: '',
  earlyAccessDate: '',
  saleTimezone: 'UTC',
  basePrice: '',
  currency: 'USD',
  allImages: [],
  isBundle: false,
  expectedShipping: '',
  linkedEditions: [],
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  try { return new Date(iso).toISOString().slice(0, 16) } catch { return '' }
}

function announcementToForm(a: ApiSaleAnnouncement): FormState {
  const extraImages: string[] = Array.isArray(a.extraImagesJson) ? a.extraImagesJson : []
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
    generalSaleDate: toDatetimeLocal(a.generalSaleDate),
    firstAccessDate: toDatetimeLocal(a.firstAccessDate),
    earlyAccessDate: toDatetimeLocal(a.earlyAccessDate),
    saleTimezone: a.saleTimezone ?? 'UTC',
    basePrice: a.basePrice != null ? String(a.basePrice) : '',
    currency: a.currency ?? 'USD',
    allImages,
    isBundle: a.isBundle,
    expectedShipping: (a as any).expectedShipping ?? '',
    linkedEditions,
  }
}

function formToData(f: FormState): SaleAnnouncementFormData {
  return {
    title: f.title,
    companyId: f.companyId || undefined,
    generalSaleDate: f.generalSaleDate || undefined,
    firstAccessDate: f.firstAccessDate || undefined,
    earlyAccessDate: f.earlyAccessDate || undefined,
    saleTimezone: f.saleTimezone || undefined,
    basePrice: f.basePrice ? Number(f.basePrice) : undefined,
    currency: f.currency || undefined,
    imageUrl: f.allImages[0] || undefined,
    extraImages: f.allImages.length > 1 ? f.allImages.slice(1) : undefined,
    isBundle: f.isBundle,
    expectedShipping: f.expectedShipping || undefined,
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
  const companyOptions = allCompanies.map(c => ({ value: c.id, label: c.name }))

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="flex flex-col gap-4">

      {/* Title */}
      <div>
        <label className={LBL}>Title *</label>
        <input required className={INP} value={form.title} onChange={set('title')} />
      </div>

      {/* Company */}
      <div>
        <label className={LBL}>Company</label>
        <ComboBox
          value={form.companyId}
          options={[{ value: '', label: '— No company —' }, ...companyOptions]}
          placeholder="Search or select company…"
          onChange={id => {
            const company = allCompanies.find(c => c.id === id)
            setForm(f => ({ ...f, companyId: id, ...(company?.defaultCurrency ? { currency: company.defaultCurrency } : {}) }))
          }}
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>First Access Date &amp; Time</label>
          <input type="datetime-local" className={INP} value={form.firstAccessDate} onChange={set('firstAccessDate')} />
        </div>
        <div>
          <label className={LBL}>Early Access Date &amp; Time</label>
          <input type="datetime-local" className={INP} value={form.earlyAccessDate} onChange={set('earlyAccessDate')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>General Sale Date &amp; Time</label>
          <input type="datetime-local" className={INP} value={form.generalSaleDate} onChange={set('generalSaleDate')} />
        </div>
        <div>
          <label className={LBL}>Timezone</label>
          <ComboBox
            value={form.saleTimezone}
            options={TIMEZONE_OPTIONS}
            placeholder="Select timezone…"
            onChange={v => setForm(f => ({ ...f, saleTimezone: v }))}
          />
        </div>
      </div>

      {/* Price */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Price</label>
          <input type="number" step="0.01" min="0" className={INP} value={form.basePrice} onChange={set('basePrice')} />
        </div>
        <div>
          <label className={LBL}>Currency</label>
          <input className={INP} list="sale-currencies" value={form.currency} onChange={set('currency')} placeholder="USD" />
          <datalist id="sale-currencies">{CURRENCIES.map(c => <option key={c} value={c} />)}</datalist>
        </div>
      </div>

      {/* Expected Shipping */}
      <div>
        <label className={LBL}>Expected Shipping</label>
        <input
          className={INP}
          value={form.expectedShipping}
          onChange={set('expectedShipping')}
          placeholder="e.g. January/February 2026"
        />
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
              defaultFirstAccessDate={form.firstAccessDate ? form.firstAccessDate.slice(0, 10) : null}
              defaultEarlyAccessDate={form.earlyAccessDate ? form.earlyAccessDate.slice(0, 10) : null}
              defaultGeneralSaleDate={form.generalSaleDate ? form.generalSaleDate.slice(0, 10) : null}
              defaultPrice={form.basePrice ? Number(form.basePrice) : null}
              defaultCurrency={form.currency || null}
            />
          </div>
        )}
      </div>

      {/* Flags */}
      <div className="flex flex-col gap-2">
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

// ─── Region helpers ───────────────────────────────────────────────────────────
interface RegionFormData {
  id?: string
  name: string
  countryCodes: string
  isDefault: boolean
  generalSaleDate: string
  firstAccessDate: string
  earlyAccessDate: string
  endsAt: string
  saleTimezone: string
  basePrice: string
  currency: string
}

const EMPTY_REGION: RegionFormData = {
  name: '', countryCodes: '', isDefault: false,
  generalSaleDate: '', firstAccessDate: '', earlyAccessDate: '', endsAt: '',
  saleTimezone: 'UTC', basePrice: '', currency: '',
}

function announcementToDefaultRegion(a: ApiSaleAnnouncement): RegionFormData {
  return {
    ...EMPTY_REGION,
    generalSaleDate: a.generalSaleDate ? new Date(a.generalSaleDate).toISOString().slice(0, 16) : '',
    firstAccessDate: a.firstAccessDate ? new Date(a.firstAccessDate).toISOString().slice(0, 16) : '',
    earlyAccessDate: a.earlyAccessDate ? new Date(a.earlyAccessDate).toISOString().slice(0, 16) : '',
    saleTimezone: (a as any).saleTimezone ?? 'UTC',
    basePrice: a.basePrice != null ? String(a.basePrice) : '',
    currency: a.currency ?? '',
    isDefault: true,
  }
}

function regionToForm(r: NonNullable<ApiSaleAnnouncement['regions']>[0]): RegionFormData {
  let codes: string[] = []
  try { codes = JSON.parse(r.countryCodes) } catch {}
  return {
    id: r.id,
    name: r.name,
    countryCodes: codes.join(', '),
    isDefault: r.isDefault,
    generalSaleDate: r.generalSaleDate ? new Date(r.generalSaleDate).toISOString().slice(0, 16) : '',
    firstAccessDate: r.firstAccessDate ? new Date(r.firstAccessDate).toISOString().slice(0, 16) : '',
    earlyAccessDate: r.earlyAccessDate ? new Date(r.earlyAccessDate).toISOString().slice(0, 16) : '',
    endsAt: r.endsAt ? new Date(r.endsAt).toISOString().slice(0, 16) : '',
    saleTimezone: r.saleTimezone ?? 'UTC',
    basePrice: r.basePrice != null ? String(r.basePrice) : '',
    currency: r.currency ?? '',
  }
}

// ─── Announcement Regions Panel ───────────────────────────────────────────────
function AnnouncementRegionsPanel({ announcement }: { announcement: ApiSaleAnnouncement }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingRegion, setEditingRegion] = useState<RegionFormData | null>(null)
  const [addingRegion, setAddingRegion] = useState(false)

  const regions = announcement.regions ?? []

  const upsertMutation = useMutation({
    mutationFn: (form: RegionFormData) => {
      const codes = form.countryCodes.split(/[,\s]+/).map(c => c.trim().toUpperCase()).filter(Boolean)
      return adminUpsertAnnouncementRegion(announcement.id, {
        id: form.id,
        name: form.name,
        countryCodes: JSON.stringify(codes),
        isDefault: form.isDefault,
        generalSaleDate: form.generalSaleDate || null,
        firstAccessDate: form.firstAccessDate || null,
        earlyAccessDate: form.earlyAccessDate || null,
        endsAt: form.endsAt || null,
        saleTimezone: form.saleTimezone || null,
        basePrice: form.basePrice ? Number(form.basePrice) : null,
        currency: form.currency || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] })
      setEditingRegion(null)
      setAddingRegion(false)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (regionId: string) => adminDeleteAnnouncementRegion(announcement.id, regionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const RegionFormUI = ({ form, onSave, onCancel }: {
    form: RegionFormData
    onSave: (f: RegionFormData) => void
    onCancel: () => void
  }) => {
    const [f, setF] = useState(form)
    const s = (key: keyof RegionFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF(prev => ({ ...prev, [key]: e.target.value }))
    return (
      <div className="bg-stone-800/60 border border-stone-700 rounded-lg p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Region Name *</label>
            <input required className={INP} value={f.name} onChange={s('name')} placeholder="UK + International" />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Country Codes <span className="text-stone-600">(comma-separated)</span></label>
            <input className={INP} value={f.countryCodes} onChange={s('countryCodes')} placeholder="GB, AU, DE, FR…" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
          <input type="checkbox" checked={f.isDefault} onChange={e => setF(p => ({ ...p, isDefault: e.target.checked }))} className="accent-amber-400" />
          Default region (catch-all for unmatched countries)
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-stone-400 mb-1">First Access</label>
            <input type="datetime-local" className={INP} value={f.firstAccessDate} onChange={s('firstAccessDate')} />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Early Access</label>
            <input type="datetime-local" className={INP} value={f.earlyAccessDate} onChange={s('earlyAccessDate')} />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">General Sale</label>
            <input type="datetime-local" className={INP} value={f.generalSaleDate} onChange={s('generalSaleDate')} />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Ends At</label>
            <input type="datetime-local" className={INP} value={f.endsAt} onChange={s('endsAt')} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">Timezone</label>
          <ComboBox
            value={f.saleTimezone}
            options={TIMEZONE_OPTIONS}
            placeholder="Select timezone…"
            onChange={v => setF(p => ({ ...p, saleTimezone: v }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Price</label>
            <input type="number" step="0.01" className={INP} value={f.basePrice} onChange={s('basePrice')} placeholder="Override price" />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Currency</label>
            <input className={INP} list="sale-currencies" value={f.currency} onChange={s('currency')} placeholder="GBP" />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onSave(f)} disabled={!f.name || upsertMutation.isPending}
            className="bg-amber-400 text-stone-950 font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-xs">
            {upsertMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onCancel} className="text-xs text-stone-400 hover:text-stone-300 px-3 py-1.5">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-stone-700">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-stone-800/40 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-sm text-stone-400">
          Regional Windows
          {regions.length > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{regions.length}</span>
          )}
        </span>
        <span className="text-stone-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {regions.map(r => {
            let codes: string[] = []
            try { codes = JSON.parse(r.countryCodes) } catch {}
            const isEditing = editingRegion?.id === r.id

            if (isEditing) {
              return <RegionFormUI key={r.id} form={editingRegion!} onSave={f => upsertMutation.mutate(f)} onCancel={() => setEditingRegion(null)} />
            }

            return (
              <div key={r.id} className="bg-stone-800/50 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-stone-200 font-medium">{r.name}</span>
                      {r.isDefault && <span className="text-xs bg-stone-600/60 text-stone-400 px-1.5 py-0.5 rounded">default</span>}
                    </div>
                    {codes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {codes.map(c => (
                          <span key={c} className="text-xs bg-stone-700 text-stone-400 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-stone-500 mt-1 space-y-0.5">
                      {r.generalSaleDate && <div>General: {new Date(r.generalSaleDate).toLocaleString()} {r.saleTimezone && `(${r.saleTimezone})`}</div>}
                      {r.firstAccessDate && <div>First: {new Date(r.firstAccessDate).toLocaleString()}</div>}
                      {r.earlyAccessDate && <div>Early: {new Date(r.earlyAccessDate).toLocaleString()}</div>}
                      {r.basePrice != null && <div className="text-amber-500/70">{r.basePrice} {r.currency}</div>}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button type="button" onClick={() => setEditingRegion(regionToForm(r))}
                      className="text-xs text-stone-400 hover:text-stone-200 px-2 py-1 rounded hover:bg-stone-700 transition-colors">Edit</button>
                    <button type="button" onClick={() => deleteMutation.mutate(r.id)}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-400/10 transition-colors">Delete</button>
                  </div>
                </div>
              </div>
            )
          })}

          {addingRegion ? (
            <RegionFormUI form={announcementToDefaultRegion(announcement)} onSave={f => upsertMutation.mutate(f)} onCancel={() => setAddingRegion(false)} />
          ) : (
            <button type="button" onClick={() => setAddingRegion(true)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              + Add Region
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Announcement Books Panel ─────────────────────────────────────────────────
const SIGNATURE_TYPES = [
  { value: 'unsigned', label: 'Unsigned' },
  { value: 'signed', label: 'Signed' },
  { value: 'digitally_signed', label: 'Digitally Signed' },
] as const

function AnnouncementBooksPanel({ announcement }: { announcement: ApiSaleAnnouncement }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [addMode, setAddMode] = useState(false)

  const editions = announcement.editions ?? []

  // Use default region dates if available, otherwise fall back to announcement dates
  const defaultRegion = announcement.regions?.find(r => r.isDefault) ?? announcement.regions?.[0]
  const dateSource = defaultRegion ?? announcement
  const defaultFirstAccessDate = dateSource.firstAccessDate ? dateSource.firstAccessDate.slice(0, 10) : null
  const defaultEarlyAccessDate = dateSource.earlyAccessDate ? dateSource.earlyAccessDate.slice(0, 10) : null
  const defaultGeneralSaleDate = dateSource.generalSaleDate ? dateSource.generalSaleDate.slice(0, 10) : null

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

  const setVariantMutation = useMutation({
    mutationFn: ({ editionId, signatureType, price, currency }: {
      editionId: string
      signatureType: 'unsigned' | 'signed' | 'digitally_signed'
      price?: number | null
      currency?: string | null
    }) => adminSetAnnouncementVariant(announcement.id, editionId, signatureType, price, currency),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const removeVariantMutation = useMutation({
    mutationFn: ({ editionId, signatureType }: {
      editionId: string
      signatureType: 'unsigned' | 'signed' | 'digitally_signed'
    }) => adminRemoveAnnouncementVariant(announcement.id, editionId, signatureType),
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
        <div className="px-4 pb-4 space-y-3">
          {editions.length === 0 && (
            <p className="text-stone-500 text-xs py-2">No linked books yet.</p>
          )}
          {editions.map(e => {
            const thumb = e.edition?.coverImage ? cloudThumb(e.edition.coverImage, 48, 60) : null
            const activeVariants = new Set((e.variants ?? []).map(v => v.signatureType))
            return (
              <div key={e.editionId} className="bg-stone-800/50 rounded-lg p-3">
                <div className="flex items-center gap-3 mb-3">
                  {thumb
                    ? <img src={thumb} className="w-9 object-cover rounded flex-shrink-0" style={{ height: '44px' }} />
                    : <div className="w-9 bg-stone-700 rounded flex-shrink-0 flex items-center justify-center text-stone-500 text-xs" style={{ height: '44px' }}>?</div>
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
                    className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-400/10 transition-colors flex-shrink-0"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 pl-1">
                  {SIGNATURE_TYPES.map(sig => {
                    const checked = activeVariants.has(sig.value)
                    const variant = (e.variants ?? []).find(v => v.signatureType === sig.value)
                    return (
                      <div key={sig.value} className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer min-w-[140px]">
                          <input
                            type="checkbox"
                            checked={checked}
                            className="accent-amber-400"
                            onChange={ev => {
                              if (ev.target.checked) {
                                setVariantMutation.mutate({ editionId: e.editionId, signatureType: sig.value })
                              } else {
                                removeVariantMutation.mutate({ editionId: e.editionId, signatureType: sig.value })
                              }
                            }}
                          />
                          <span className="text-xs text-stone-300">{sig.label}</span>
                        </label>
                        {checked && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Price"
                              defaultValue={variant?.price ?? ''}
                              className="w-20 bg-stone-700 border border-stone-600 rounded px-2 py-0.5 text-xs text-stone-100 focus:outline-none focus:border-amber-400"
                              onBlur={ev => {
                                const price = ev.target.value ? Number(ev.target.value) : null
                                setVariantMutation.mutate({ editionId: e.editionId, signatureType: sig.value, price })
                              }}
                            />
                            <input
                              type="text"
                              placeholder="Currency"
                              list="sale-currencies"
                              defaultValue={variant?.currency ?? ''}
                              className="w-16 bg-stone-700 border border-stone-600 rounded px-2 py-0.5 text-xs text-stone-100 focus:outline-none focus:border-amber-400"
                              onBlur={ev => {
                                setVariantMutation.mutate({ editionId: e.editionId, signatureType: sig.value, currency: ev.target.value || null })
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
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
                defaultFirstAccessDate={defaultFirstAccessDate}
                defaultEarlyAccessDate={defaultEarlyAccessDate}
                defaultGeneralSaleDate={defaultGeneralSaleDate}
                defaultPrice={announcement.basePrice ?? null}
                defaultCurrency={announcement.currency ?? null}
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
              {/* Signature + bundle badges */}
              {(() => {
                const types = new Set(
                  (announcement.editions ?? []).flatMap(e => (e.variants ?? []).map(v => v.signatureType))
                )
                const signedBadge = types.has('signed')
                  ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300">✍️ Signed</span>
                  : types.has('digitally_signed')
                    ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-900/40 text-sky-300">🖨️ Digital</span>
                    : null
                return (announcement.isBundle || signedBadge) ? (
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {announcement.isBundle && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400">Bundle</span>}
                    {signedBadge}
                  </div>
                ) : null
              })()}
              {companyName && <p className="text-stone-400 text-xs mt-0.5">{companyName}</p>}
              {saleDate && <p className="text-stone-500 text-xs mt-1">📅 {saleDate}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
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
      <AnnouncementRegionsPanel announcement={announcement} />
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
