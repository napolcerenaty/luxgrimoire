'use client'

import { useState, useRef, useEffect } from 'react'
import { useModalState } from '@/hooks/useModalState'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import type { ApiSaleAnnouncement, ApiBookBoxCompany, SaleType } from '@luxgrimoire/shared-types'
import {
  adminGetSaleAnnouncements,
  adminCreateSaleAnnouncement,
  adminUpdateSaleAnnouncement,
  adminDeleteSaleAnnouncement,
  adminAddAnnouncementEdition,
  adminRemoveAnnouncementEdition,
  adminSetAnnouncementVariant,
  adminRemoveAnnouncementVariant,
  adminSetAnnouncementEditionReprint,
  adminSetAnnouncementEditionStandalone,
  adminSetAllAnnouncementEditionsReprint,
  adminUpsertAnnouncementRegion,
  adminDeleteAnnouncementRegion,
  adminDuplicateSaleAnnouncement,
  adminCreateAnnouncementItem,
  adminUpdateAnnouncementItem,
  adminDeleteAnnouncementItem,
  adminAssignEditionToItem,
  type SaleAnnouncementFormData,
} from '@/lib/api'
import { authFetch } from '@/lib/authFetch'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import CreateBookEditionForm from '@/components/admin/CreateBookEditionForm'
import MultiImageUpload from '@/components/admin/MultiImageUpload'
import { Pagination } from '@/components/admin/Pagination'
import { PublisherPicker } from '@/components/admin/pickers/PublisherPicker'
import type { AiParseResult, EditionCompany } from '@/components/admin/EditionFieldsSection'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { Sparkles } from 'lucide-react'
import { CURRENCIES } from '@/lib/currencies'

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-sm text-stone-400 mb-1'

// UTC offsets in minutes for each timezone abbreviation
const TZ_OFFSETS: Record<string, number> = {
  'UTC': 0, 'GMT': 0, 'WET': 0,
  'BST': 60, 'WEST': 60, 'CET': 60,
  'CEST': 120, 'EET': 120,
  'EEST': 180, 'MSK': 180, 'TRT': 180,
  'GST': 240,
  'PKT': 300,
  'IST': 330,
  'BST_BD': 360,
  'ICT': 420,
  'SGT': 480, 'HKT': 480, 'CST': 480,
  'JST': 540, 'KST': 540,
  'ACST': 570,
  'AEST': 600,
  'ACDT': 630,
  'AEDT': 660,
  'NZST': 720,
  'NZDT': 780,
  'HST': -600,
  'AKST': -540,
  'AKDT': -480,
  'PST': -480, 'PDT': -420,
  'MST': -420, 'MDT': -360,
  'CST_US': -360, 'CDT': -300,
  'EST': -300, 'EDT': -240,
  'AST': -240, 'ADT': -180,
  'BRT': -180, 'ART': -180,
}

/**
 * Convert a UTC ISO string to a "YYYY-MM-DDTHH:mm" value for datetime-local input,
 * expressed in the given sale timezone abbreviation.
 */
function utcIsoToTzLocal(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  try {
    const offsetMs = (TZ_OFFSETS[tz] ?? 0) * 60_000
    return new Date(new Date(iso).getTime() + offsetMs).toISOString().slice(0, 16)
  } catch { return '' }
}

/**
 * Convert a datetime-local input value ("YYYY-MM-DDTHH:mm") expressed in the given
 * sale timezone abbreviation to a full UTC ISO string.
 */
function tzLocalToUtcIso(localStr: string, tz: string): string {
  if (!localStr) return ''
  try {
    const offsetMs = (TZ_OFFSETS[tz] ?? 0) * 60_000
    // Treat the localStr as UTC, then subtract offset to get real UTC
    return new Date(new Date(localStr + ':00Z').getTime() - offsetMs).toISOString()
  } catch { return '' }
}

/** Format a stored UTC ISO date for display in the admin UI (no browser-local conversion). */
function fmtAdminDate(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  const local = utcIsoToTzLocal(iso, tz)
  if (!local) return ''
  const [datePart, timePart] = local.split('T')
  const [year, month, day] = datePart.split('-')
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(day)} ${MONTHS[parseInt(month) - 1]} ${year} · ${timePart} ${tz}`
}

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
  return cloudinaryUrl(id, `w_${w},h_${h},c_fill,q_auto,f_auto`)
}

// ─── Edition picker ───────────────────────────────────────────────────────────
interface LinkedEdition {
  editionId: string
  bookTitle: string
  coverImage?: string | null
  publisher?: string | null
  companyName?: string | null
}

interface BookInfo {
  id: string
  title: string
  coverImage?: string | null
  authors?: { author: { name: string } }[]
}

interface EditionInfo {
  id: string
  additionalImages?: string[]
  publisher?: string | null
  bookBoxCompany?: { name: string } | null
}

function EditionPicker({ linked, onAdd, onRemove, defaultFirstAccessDate, defaultEarlyAccessDate, defaultGeneralSaleDate, defaultPrice, defaultCurrency, defaultCompanyId, isBundle, bundleBasePrice }: {
  linked: LinkedEdition[]
  onAdd: (e: LinkedEdition) => void
  onRemove: (editionId: string) => void
  defaultFirstAccessDate?: string | null
  defaultEarlyAccessDate?: string | null
  defaultGeneralSaleDate?: string | null
  defaultPrice?: number | null
  defaultCurrency?: string | null
  defaultCompanyId?: string | null
  isBundle?: boolean
  bundleBasePrice?: number | null
}){
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedBook, setSelectedBook] = useState<BookInfo | null>(null)
  const [mode, setMode] = useState<'search' | 'createBook' | 'createEdition'>('search')

  // ── Bundle Defaults ────────────────────────────────────────────────────────
  const [bdBookCount, setBdBookCount] = useState('')
  const [bdLanguage, setBdLanguage] = useState('English')
  const [bdPublisher, setBdPublisher] = useState('')
  const [bdPhotoCredit, setBdPhotoCredit] = useState('')
  const [bdCompanyId, setBdCompanyId] = useState(defaultCompanyId ?? '')
  const [bdCollectionId, setBdCollectionId] = useState('')
  const [bdParsing, setBdParsing] = useState(false)
  const [bdArtistsText, setBdArtistsText] = useState('')
  const [bdFeatureTags, setBdFeatureTags] = useState<Array<{ rawValue: string; categories: string[] }>>([])
  const [bdArtists, setBdArtists] = useState<Array<{ name: string; role: string }>>([])

  const perBookPrice = isBundle && bundleBasePrice != null && bdBookCount && Number(bdBookCount) > 0
    ? Math.round(bundleBasePrice / Number(bdBookCount) * 100) / 100
    : null

  const { data: companiesResp } = useQuery({
    queryKey: ['bundle-companies'],
    queryFn: () => authFetch<{ data: ApiBookBoxCompany[] } | ApiBookBoxCompany[]>('/companies?pageSize=100'),
    enabled: !!isBundle,
  })
  const bdAllCompanies: ApiBookBoxCompany[] = Array.isArray(companiesResp)
    ? companiesResp
    : (companiesResp as { data: ApiBookBoxCompany[] })?.data ?? []

  const { data: collectionsResp } = useQuery({
    queryKey: ['bundle-collections', bdCompanyId],
    queryFn: () => authFetch<{ data: { id: string; name: string }[] }>(`/book-box-collections?companyId=${bdCompanyId}&pageSize=100`),
    enabled: !!isBundle && !!bdCompanyId,
  })
  const bdCollections: { id: string; name: string }[] = collectionsResp?.data ?? []

  const parseBdArtists = async () => {
    if (!bdArtistsText.trim()) return
    setBdParsing(true)
    try {
      const r = await authFetch<AiParseResult>('/ai/parse', { method: 'POST', body: JSON.stringify({ text: bdArtistsText }) })
      // Store artists
      const newArtists = (r.edition?.artists ?? []).filter(a => a.name?.trim())
      if (newArtists.length > 0) {
        setBdArtists(prev => {
          const existing = new Set(prev.map(a => `${a.name}|${a.role}`))
          return [...prev, ...newArtists.filter(a => !existing.has(`${a.name}|${a.role}`))]
        })
      }
      // Store feature tags (standalone + artist role base names)
      const standaloneFeatures = (r.edition?.features ?? []).map(f => f.trim()).filter(Boolean)
      const artistBaseFeatures = newArtists
        .map(a => (a.role?.trim() ?? '').replace(/\s*\(\w+\)$/, '').trim())
        .filter(Boolean)
      const allFeatureRaws = Array.from(new Set([...standaloneFeatures, ...artistBaseFeatures]))
      const newTags = allFeatureRaws.map(rawValue => ({
        rawValue,
        categories: r.edition?.featureTags?.[rawValue] ?? [],
      }))
      if (newTags.length > 0) {
        setBdFeatureTags(prev => {
          const existing = new Set(prev.map(p => p.rawValue))
          return [...prev, ...newTags.filter(t => !existing.has(t.rawValue))]
        })
      }
    } catch { /* ignore */ }
    setBdParsing(false)
  }
  // ──────────────────────────────────────────────────────────────────────────

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
      coverImage: ed.additionalImages?.[0],
      publisher: ed.publisher,
      companyName: ed.bookBoxCompany?.name,
    })
    setSearch('')
    setDebounced('')
    setSelectedBook(null)
  }

  const inputCls = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'

  if (mode === 'createBook') {
    return (
      <div className="border border-stone-700 rounded-lg p-3 mt-2">
        <CreateBookEditionForm
          key="create-book"
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
          key={`create-edition-${selectedBook.id}`}
          existingBookId={selectedBook.id}
          defaultFirstAccessDate={defaultFirstAccessDate}
          defaultEarlyAccessDate={defaultEarlyAccessDate}
          defaultGeneralSaleDate={defaultGeneralSaleDate}
          defaultPrice={isBundle && perBookPrice != null ? perBookPrice : defaultPrice}
          defaultCurrency={defaultCurrency}
          defaultCompanyId={bdCompanyId || defaultCompanyId}
          defaultLanguage={isBundle ? bdLanguage : undefined}
          defaultPublisher={isBundle ? bdPublisher : undefined}
          defaultCollectionId={isBundle ? bdCollectionId : undefined}
          defaultPhotoCredit={isBundle && bdPhotoCredit ? bdPhotoCredit : undefined}
          defaultArtists={isBundle && bdArtists.length > 0 ? bdArtists : undefined}
          defaultFeatureTags={isBundle && bdFeatureTags.length > 0 ? bdFeatureTags : undefined}
          onSuccess={(editionId) => {
            if (editionId) {
              onAdd({
                editionId,
                bookTitle: selectedBook.title,
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
      {/* Bundle Defaults panel */}
      {isBundle && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg p-3 mb-3 space-y-3">
          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Bundle Defaults</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-400 mb-1">Number of Books</label>
              <input
                type="number" min="1" className={inputCls}
                value={bdBookCount}
                onChange={e => setBdBookCount(e.target.value)}
                placeholder="e.g. 6"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Price per Book <span className="text-stone-600">(calculated)</span></label>
              <input
                type="text" readOnly className={`${inputCls} opacity-60 cursor-default`}
                value={perBookPrice != null ? String(perBookPrice) : '—'}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">Language</label>
            <input className={inputCls} value={bdLanguage} onChange={e => setBdLanguage(e.target.value)} placeholder="English" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-400 mb-1">Publisher</label>
              <PublisherPicker value={bdPublisher} onChange={setBdPublisher} />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Photo Credit</label>
              <input className={inputCls} value={bdPhotoCredit} onChange={e => setBdPhotoCredit(e.target.value)} placeholder="e.g. John Smith" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-400 mb-1">Company</label>
              <select
                className={inputCls}
                value={bdCompanyId}
                onChange={e => { setBdCompanyId(e.target.value); setBdCollectionId('') }}
              >
                <option value="">— No company —</option>
                {bdAllCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Collection</label>
              <select
                className={inputCls}
                value={bdCollectionId}
                onChange={e => setBdCollectionId(e.target.value)}
                disabled={!bdCompanyId}
              >
                <option value="">— No collection —</option>
                {bdCollections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">Artists &amp; Features <span className="text-stone-600">(paste text, then parse)</span></label>
            <textarea
              className={`${inputCls} h-20 resize-none`}
              value={bdArtistsText}
              onChange={e => setBdArtistsText(e.target.value)}
              placeholder="Paste artists/features text here…"
            />
            <button
              type="button"
              onClick={parseBdArtists}
              disabled={bdParsing || !bdArtistsText.trim()}
              className="mt-1 flex items-center gap-1.5 text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2.5 py-1 rounded-lg hover:bg-violet-500/30 disabled:opacity-50 transition-colors"
            >
              <Sparkles size={12} />
              {bdParsing ? 'Parsing…' : 'Parse with AI'}
            </button>
            {(bdArtists.length > 0 || bdFeatureTags.length > 0) && (
              <div className="mt-2 space-y-2">
                {bdArtists.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-stone-500">Artists (applied to each edition):</div>
                      <button type="button" onClick={() => setBdArtists([])} className="text-xs text-stone-500 hover:text-red-400">Clear all</button>
                    </div>
                    <div className="space-y-1">
                      {bdArtists.map((a, i) => (
                        <div key={i} className="flex gap-1 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-1">
                          <div className="flex flex-col shrink-0 justify-center mr-0.5">
                            <button type="button" disabled={i === 0}
                              onClick={() => setBdArtists(prev => { const arr = [...prev]; [arr[i-1], arr[i]] = [arr[i], arr[i-1]]; return arr })}
                              className="text-stone-400 dark:text-stone-500 hover:text-amber-500 dark:hover:text-amber-300 disabled:opacity-20 leading-none text-[10px]">▲</button>
                            <button type="button" disabled={i === bdArtists.length - 1}
                              onClick={() => setBdArtists(prev => { const arr = [...prev]; [arr[i], arr[i+1]] = [arr[i+1], arr[i]]; return arr })}
                              className="text-stone-400 dark:text-stone-500 hover:text-amber-500 dark:hover:text-amber-300 disabled:opacity-20 leading-none text-[10px]">▼</button>
                          </div>
                          <span className="text-stone-400 dark:text-stone-500 text-[10px] w-4 shrink-0 text-right pt-1">{i + 1}.</span>
                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <input
                              className="w-full bg-transparent border-b border-amber-500/30 focus:border-amber-500 dark:focus:border-amber-400 outline-none text-xs text-stone-900 dark:text-amber-200 px-1 py-0.5 placeholder:text-stone-400"
                              value={a.name}
                              onChange={e => setBdArtists(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                              placeholder="Name"
                            />
                            <input
                              className="w-full bg-transparent border-b border-amber-500/20 focus:border-amber-500 dark:focus:border-amber-400 outline-none text-xs text-stone-700 dark:text-amber-400 px-1 py-0.5 placeholder:text-stone-400"
                              value={a.role}
                              onChange={e => setBdArtists(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                              placeholder="Role"
                            />
                          </div>
                          <button type="button" onClick={() => setBdArtists(prev => prev.filter((_, j) => j !== i))}
                            className="text-stone-400 dark:text-stone-500 hover:text-red-500 dark:hover:text-red-400 shrink-0 px-0.5 self-start pt-1">×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {bdFeatureTags.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-stone-500">Features (applied to each edition):</div>
                      <button type="button" onClick={() => setBdFeatureTags([])} className="text-xs text-stone-500 hover:text-red-400">Clear all</button>
                    </div>
                    <div className="space-y-1">
                      {bdFeatureTags.map((t, i) => (
                        <div key={i} className="flex items-center gap-1 bg-violet-500/10 border border-violet-500/20 rounded px-1.5 py-1">
                          <div className="flex flex-col mr-0.5">
                            <button type="button" disabled={i === 0}
                              onClick={() => setBdFeatureTags(prev => { const arr = [...prev]; [arr[i-1], arr[i]] = [arr[i], arr[i-1]]; return arr })}
                              className="text-stone-400 dark:text-stone-500 hover:text-violet-600 dark:hover:text-violet-300 disabled:opacity-20 leading-none text-[10px]">▲</button>
                            <button type="button" disabled={i === bdFeatureTags.length - 1}
                              onClick={() => setBdFeatureTags(prev => { const arr = [...prev]; [arr[i], arr[i+1]] = [arr[i+1], arr[i]]; return arr })}
                              className="text-stone-400 dark:text-stone-500 hover:text-violet-600 dark:hover:text-violet-300 disabled:opacity-20 leading-none text-[10px]">▼</button>
                          </div>
                          <span className="text-stone-400 dark:text-stone-500 text-[10px] w-4 shrink-0 text-right">{i + 1}.</span>
                          <input
                            className="flex-1 min-w-0 bg-transparent border-b border-violet-500/30 focus:border-violet-600 dark:focus:border-violet-400 outline-none text-xs text-stone-900 dark:text-violet-200 px-1 py-0.5 placeholder:text-stone-400"
                            value={t.rawValue}
                            onChange={e => setBdFeatureTags(prev => prev.map((x, j) => j === i ? { ...x, rawValue: e.target.value } : x))}
                            placeholder="Feature"
                          />
                          {t.categories.length > 0 && (
                            <span className="text-[10px] text-violet-700 dark:text-violet-500 shrink-0 max-w-[80px] truncate" title={t.categories.join(', ')}>
                              {t.categories.join(', ')}
                            </span>
                          )}
                          <button type="button" onClick={() => setBdFeatureTags(prev => prev.filter((_, j) => j !== i))}
                            className="text-stone-400 dark:text-stone-500 hover:text-red-500 dark:hover:text-red-400 shrink-0 px-0.5">×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
                  <div className="text-stone-500 text-xs truncate">{e.companyName || e.publisher || '—'}</div>
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
                {ed.additionalImages?.[0]
                  ? <img src={cloudThumb(ed.additionalImages[0], 32, 40) ?? ''} alt="" className="w-8 h-10 object-cover rounded" />
                  : <div className="w-8 h-10 bg-stone-600 rounded" />
                }
                <div>
                  <div className="text-stone-100 text-xs">{ed.bookBoxCompany?.name || '—'}</div>
                  <div className="text-stone-500 text-xs">{ed.publisher ?? ''}</div>
                </div>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setMode('createEdition')}
            className="text-amber-400 hover:text-amber-300 text-xs">+ Create new edition for this book</button>
          <button type="button" onClick={() => setMode('createBook')}
            className="text-amber-400 hover:text-amber-300 text-xs mt-1 block">+ Create new book</button>
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
  endsAt: string
  saleTimezone: string
  basePrice: string
  currency: string
  subscriberBasePrice: string
  allImages: string[]
  isBundle: boolean
  expectedShipping: string
  photoCredit: string
  sourceUrl: string
  saleType: SaleType
  isSoldOut: boolean
  notes: string
}

const EMPTY_FORM: FormState = {
  title: '',
  companyId: '',
  generalSaleDate: '',
  firstAccessDate: '',
  earlyAccessDate: '',
  endsAt: '',
  saleTimezone: 'UTC',
  basePrice: '',
  currency: 'USD',
  subscriberBasePrice: '',
  allImages: [],
  isBundle: false,
  expectedShipping: '',
  photoCredit: '',
  sourceUrl: '',
  saleType: 'LIMITED_PREORDER',
  isSoldOut: false,
  notes: '',
}

function announcementToForm(a: ApiSaleAnnouncement): FormState {
  const tz = a.saleTimezone ?? 'UTC'
  const extraImages: string[] = Array.isArray(a.extraImagesJson) ? a.extraImagesJson : []
  const allImages = [
    ...(a.imageUrl ? [a.imageUrl] : []),
    ...extraImages,
  ]
  return {
    title: a.title,
    companyId: a.companyId ?? '',
    generalSaleDate: utcIsoToTzLocal(a.generalSaleDate, tz),
    firstAccessDate: utcIsoToTzLocal(a.firstAccessDate, tz),
    earlyAccessDate: utcIsoToTzLocal(a.earlyAccessDate, tz),
    endsAt: utcIsoToTzLocal(a.endsAt, tz),
    saleTimezone: a.saleTimezone ?? 'UTC',
    basePrice: a.basePrice != null ? String(a.basePrice) : '',
    currency: a.currency ?? 'USD',
    subscriberBasePrice: a.subscriberBasePrice != null ? String(a.subscriberBasePrice) : '',
    allImages,
    isBundle: a.isBundle,
    expectedShipping: (a as any).expectedShipping ?? '',
    photoCredit: a.photoCredit ?? '',
    sourceUrl: (a as any).sourceUrl ?? '',
    saleType: a.saleType ?? 'LIMITED_PREORDER',
    isSoldOut: a.isSoldOut ?? false,
    notes: a.notes ?? '',
  }
}

function formToData(f: FormState): SaleAnnouncementFormData {
  const tz = f.saleTimezone || 'UTC'
  return {
    title: f.title,
    companyId: f.companyId || undefined,
    generalSaleDate: f.generalSaleDate ? tzLocalToUtcIso(f.generalSaleDate, tz) : null,
    firstAccessDate: f.firstAccessDate ? tzLocalToUtcIso(f.firstAccessDate, tz) : null,
    earlyAccessDate: f.earlyAccessDate ? tzLocalToUtcIso(f.earlyAccessDate, tz) : null,
    endsAt: f.endsAt ? tzLocalToUtcIso(f.endsAt, tz) : null,
    saleTimezone: f.saleTimezone || undefined,
    basePrice: f.basePrice ? parseDecimalInput(f.basePrice) : undefined,
    currency: f.currency || undefined,
    subscriberBasePrice: f.subscriberBasePrice ? parseDecimalInput(f.subscriberBasePrice) : null,
    imageUrl: f.allImages[0] ?? null,
    extraImages: f.allImages.slice(1),
    isBundle: f.isBundle,
    expectedShipping: f.expectedShipping || undefined,
    photoCredit: f.photoCredit,
    sourceUrl: f.sourceUrl || undefined,
    saleType: f.saleType,
    isSoldOut: f.isSoldOut,
    notes: f.notes || null,
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

      {/* Company + Sale Type — 2 cols */}
      <div className="grid sm:grid-cols-2 gap-3">
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
        <div>
          <label className={LBL}>Sale Type</label>
          <select className={INP} value={form.saleType} onChange={set('saleType')}>
            <option value="LIMITED_PREORDER">⏳ Limited Preorder</option>
            <option value="OPEN_PREORDER">🔓 Open Preorder</option>
            <option value="OVERSTOCK">📦 Overstock / In Stock</option>
            <option value="SALE">🏷️ Sale</option>
          </select>
        </div>
      </div>

      {/* Dates — 3 cols on md+, 1 col on mobile */}
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className={LBL}>First Access</label>
          <input type="datetime-local" className={INP} value={form.firstAccessDate} onChange={set('firstAccessDate')} />
        </div>
        <div>
          <label className={LBL}>Early Access</label>
          <input type="datetime-local" className={INP} value={form.earlyAccessDate} onChange={set('earlyAccessDate')} />
        </div>
        <div>
          <label className={LBL}>General Sale *</label>
          <input required type="datetime-local" className={INP} value={form.generalSaleDate} onChange={set('generalSaleDate')} />
        </div>
        <div>
          <label className={LBL}>Ends At <span className="text-stone-600 font-normal">(optional)</span></label>
          <input type="datetime-local" className={INP} value={form.endsAt} onChange={set('endsAt')} />
        </div>
        <div className="sm:col-span-2 md:col-span-2">
          <label className={LBL}>Timezone</label>
          <ComboBox
            value={form.saleTimezone}
            options={TIMEZONE_OPTIONS}
            placeholder="Select timezone…"
            onChange={v => setForm(f => ({ ...f, saleTimezone: v }))}
          />
        </div>
      </div>

      {/* Price + Currency + Subscriber Price — 3 cols */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className={LBL}>Price</label>
          <input type="text" step="0.01" min="0" className={INP} value={form.basePrice} onChange={set('basePrice')} />
        </div>
        <div>
          <label className={LBL}>Currency</label>
          <input className={INP} list="sale-currencies" value={form.currency} onChange={set('currency')} placeholder="USD" />
          <datalist id="sale-currencies">{CURRENCIES.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label className={LBL}>Subscriber Price <span className="text-stone-600 font-normal">(optional)</span></label>
          <input type="text" step="0.01" min="0" className={INP} value={form.subscriberBasePrice} onChange={set('subscriberBasePrice')} placeholder="e.g. 22.00" />
        </div>
      </div>

      {/* Expected Shipping + Source URL — 2 cols */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Expected Shipping</label>
          <input className={INP} value={form.expectedShipping} onChange={set('expectedShipping')} placeholder="e.g. January/February 2026" />
        </div>
        <div>
          <label className={LBL}>Source URL <span className="text-stone-600 font-normal">(announcement link)</span></label>
          <input type="url" className={INP} value={form.sourceUrl} onChange={set('sourceUrl')} placeholder="https://instagram.com/p/…" />
        </div>
      </div>

      {/* Photo Credit */}
      <div>
        <label className={LBL}>Photo by (IG handler)</label>
        <input className={INP} value={form.photoCredit} onChange={set('photoCredit')} placeholder="@photographer" />
      </div>

      {/* Images */}
      <div>
        <label className={LBL}>Images <span className="text-stone-600 font-normal normal-case tracking-normal">(first = main cover)</span></label>
        <MultiImageUpload
          images={form.allImages}
          folder="luxgrimoire/announcements"
          onChange={imgs => setForm(f => ({ ...f, allImages: imgs }))}
        />
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
          <input type="checkbox" checked={form.isBundle} onChange={setCheck('isBundle')} className="accent-amber-400" />
          <span>Is Bundle <span className="text-stone-500">— multiple editions as a set</span></span>
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
          <input type="checkbox" checked={form.isSoldOut} onChange={setCheck('isSoldOut')} className="accent-red-400" />
          <span>Sold Out</span>
        </label>
      </div>

      {/* Notes */}
      <div>
        <label className={LBL}>Notes <span className="text-stone-600 font-normal">(optional — HTML supported)</span></label>
        <textarea
          className={`${INP} min-h-[80px] resize-y font-mono text-xs`}
          value={form.notes}
          onChange={set('notes')}
          placeholder={'Additional notes or details…\nLink syntax: <a href="https://example.com" target="_blank">link text</a>'}
        />
        <p className="mt-1 text-xs text-stone-600">Link: <code className="text-stone-500">{`<a href="URL" target="_blank">text</a>`}</code></p>
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
  isSoldOut: boolean
  saleTimezone: string
  basePrice: string
  currency: string
  subscriberBasePrice: string
}

const EMPTY_REGION: RegionFormData = {
  name: '', countryCodes: '', isDefault: false,
  generalSaleDate: '', firstAccessDate: '', earlyAccessDate: '', endsAt: '',
  isSoldOut: false,
  saleTimezone: 'UTC', basePrice: '', currency: '', subscriberBasePrice: '',
}

function announcementToDefaultRegion(a: ApiSaleAnnouncement): RegionFormData {
  const tz = (a as any).saleTimezone ?? 'UTC'
  return {
    ...EMPTY_REGION,
    generalSaleDate: utcIsoToTzLocal(a.generalSaleDate, tz),
    firstAccessDate: utcIsoToTzLocal(a.firstAccessDate, tz),
    earlyAccessDate: utcIsoToTzLocal(a.earlyAccessDate, tz),
    endsAt: utcIsoToTzLocal(a.endsAt, tz),
    saleTimezone: tz,
    basePrice: a.basePrice != null ? String(a.basePrice) : '',
    currency: a.currency ?? '',
    subscriberBasePrice: a.subscriberBasePrice != null ? String(a.subscriberBasePrice) : '',
    isDefault: true,
  }
}

function regionToForm(r: NonNullable<ApiSaleAnnouncement['regions']>[0]): RegionFormData {
  let codes: string[] = []
  try { codes = Array.isArray(r.countryCodes) ? r.countryCodes : JSON.parse(r.countryCodes) } catch {}
  const tz = r.saleTimezone ?? 'UTC'
  return {
    id: r.id,
    name: r.name,
    countryCodes: codes.join(', '),
    isDefault: r.isDefault,
    generalSaleDate: utcIsoToTzLocal(r.generalSaleDate, tz),
    firstAccessDate: utcIsoToTzLocal(r.firstAccessDate, tz),
    earlyAccessDate: utcIsoToTzLocal(r.earlyAccessDate, tz),
    endsAt: utcIsoToTzLocal(r.endsAt, tz),
    isSoldOut: r.isSoldOut ?? false,
    saleTimezone: tz,
    basePrice: r.basePrice != null ? String(r.basePrice) : '',
    currency: r.currency ?? '',
    subscriberBasePrice: r.subscriberBasePrice != null ? String(r.subscriberBasePrice) : '',
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
      const rTz = form.saleTimezone || 'UTC'
      return adminUpsertAnnouncementRegion(announcement.id, {
        id: form.id,
        name: form.name,
        countryCodes: JSON.stringify(codes),
        isDefault: form.isDefault,
        generalSaleDate: form.generalSaleDate ? tzLocalToUtcIso(form.generalSaleDate, rTz) : null,
        firstAccessDate: form.firstAccessDate ? tzLocalToUtcIso(form.firstAccessDate, rTz) : null,
        earlyAccessDate: form.earlyAccessDate ? tzLocalToUtcIso(form.earlyAccessDate, rTz) : null,
        endsAt: form.endsAt ? tzLocalToUtcIso(form.endsAt, rTz) : null,
        isSoldOut: form.isSoldOut,
        saleTimezone: form.saleTimezone || null,
        basePrice: form.basePrice ? parseDecimalInput(form.basePrice) : null,
        currency: form.currency || null,
        subscriberBasePrice: form.subscriberBasePrice ? parseDecimalInput(form.subscriberBasePrice) : null,
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
        <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
          <input type="checkbox" checked={f.isSoldOut} onChange={e => setF(p => ({ ...p, isSoldOut: e.target.checked }))} className="accent-red-400" />
          Sold out in this region
        </label>
        <div className="space-y-2">
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
            <input type="text" step="0.01" className={INP} value={f.basePrice} onChange={s('basePrice')} placeholder="Override price" />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Currency</label>
            <input className={INP} list="region-currencies" value={f.currency} onChange={s('currency')} placeholder="GBP" />
            <datalist id="region-currencies">{CURRENCIES.map(c => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">Subscriber Price <span className="text-stone-600">(same currency)</span></label>
          <input type="text" step="0.01" className={INP} value={f.subscriberBasePrice} onChange={s('subscriberBasePrice')} placeholder="Lower subscriber price" />
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
            try { codes = Array.isArray(r.countryCodes) ? r.countryCodes : JSON.parse(r.countryCodes) } catch {}
            const isEditing = editingRegion?.id === r.id

            if (isEditing) {
              return <RegionFormUI key={r.id} form={editingRegion!} onSave={f => upsertMutation.mutate(f)} onCancel={() => setEditingRegion(null)} />
            }

            return (
              <div key={r.id} className="bg-stone-800/50 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
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
                      {r.firstAccessDate && <div>First Access: {fmtAdminDate(r.firstAccessDate, r.saleTimezone ?? 'UTC')}</div>}
                      {r.earlyAccessDate && <div>Early Access: {fmtAdminDate(r.earlyAccessDate, r.saleTimezone ?? 'UTC')}</div>}
                      {r.generalSaleDate && <div>General Sale: {fmtAdminDate(r.generalSaleDate, r.saleTimezone ?? 'UTC')}</div>}
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
  { value: 'autopen', label: 'Autopen' },
  { value: 'digitally_signed', label: 'Digitally Signed' },
  { value: 'signed_bookplate', label: 'Signed Bookplate' },
  { value: 'stamped', label: 'Stamped' },
] as const

function AnnouncementBooksPanel({ announcement }: { announcement: ApiSaleAnnouncement }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [addMode, setAddMode] = useState(false)

  const editions = announcement.editions ?? []

  // Compute default dates for CreateBookEditionForm
  const defaultRegion = announcement.regions?.find((r: { isDefault?: boolean }) => r.isDefault) ?? announcement.regions?.[0]
  const dateSource = defaultRegion ?? announcement
  const saleTz = (defaultRegion?.saleTimezone ?? (announcement as { saleTimezone?: string }).saleTimezone ?? 'UTC')
  const defaultFirstAccessDate = dateSource.firstAccessDate ? utcIsoToTzLocal(dateSource.firstAccessDate, saleTz).slice(0, 10) : null
  const defaultEarlyAccessDate = dateSource.earlyAccessDate ? utcIsoToTzLocal(dateSource.earlyAccessDate, saleTz).slice(0, 10) : null
  const defaultGeneralSaleDate = dateSource.generalSaleDate ? utcIsoToTzLocal(dateSource.generalSaleDate, saleTz).slice(0, 10) : null

  const addMutation = useMutation({
    mutationFn: (editionId: string) => adminAddAnnouncementEdition(announcement.id, editionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] })
      if (!announcement.isBundle) setAddMode(false)
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
      signatureType: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped'
      price?: number | null
      currency?: string | null
    }) => adminSetAnnouncementVariant(announcement.id, editionId, signatureType, price, currency),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const removeVariantMutation = useMutation({
    mutationFn: ({ editionId, signatureType }: {
      editionId: string
      signatureType: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped'
    }) => adminRemoveAnnouncementVariant(announcement.id, editionId, signatureType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const setReprintMutation = useMutation({
    mutationFn: ({ editionId, isReprint }: { editionId: string; isReprint: boolean }) =>
      adminSetAnnouncementEditionReprint(announcement.id, editionId, isReprint),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const setStandaloneMutation = useMutation({
    mutationFn: ({ editionId, isStandalone }: { editionId: string; isStandalone: boolean }) =>
      adminSetAnnouncementEditionStandalone(announcement.id, editionId, isStandalone),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const setAllReprintMutation = useMutation({
    mutationFn: (isReprint: boolean) => adminSetAllAnnouncementEditionsReprint(announcement.id, isReprint),
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
          Linked Books and Signature Types
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
          {editions.length > 1 && (
            <div className="flex gap-2 pb-1 border-b border-stone-700/50">
              <button
                type="button"
                onClick={() => setAllReprintMutation.mutate(true)}
                disabled={setAllReprintMutation.isPending}
                className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                🔁 Mark all as reprint
              </button>
              <button
                type="button"
                onClick={() => setAllReprintMutation.mutate(false)}
                disabled={setAllReprintMutation.isPending}
                className="text-xs px-2 py-1 rounded bg-stone-700 text-stone-400 hover:bg-stone-600 transition-colors disabled:opacity-50"
              >
                Clear all reprint
              </button>
            </div>
          )}
          {editions.map(e => {
            const thumb = (e.edition as any)?.additionalImages?.[0] ? cloudThumb((e.edition as any).additionalImages[0], 48, 60) : null
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
                    <label className="flex items-center gap-1.5 mt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!(e as any).isReprint}
                        className="accent-amber-400"
                        onChange={ev => setReprintMutation.mutate({ editionId: e.editionId, isReprint: ev.target.checked })}
                      />
                      <span className="text-xs text-stone-400">🔁 Reprint</span>
                    </label>
                    {(e as any).itemId && (
                      <label className="flex items-center gap-1.5 mt-1 cursor-pointer" title="Also show this edition as standalone (not just within the group)">
                        <input
                          type="checkbox"
                          checked={!!(e as any).isStandalone}
                          className="accent-sky-400"
                          onChange={ev => setStandaloneMutation.mutate({ editionId: e.editionId, isStandalone: ev.target.checked })}
                        />
                        <span className="text-xs text-stone-400">📦 Also standalone</span>
                      </label>
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
                  <p className="text-xs text-stone-500 mb-1">Select all that apply. Enter a price only if this variant differs from the main price.</p>
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
                            <select
                              defaultValue={variant?.currency ?? ''}
                              className="w-20 bg-stone-700 border border-stone-600 rounded px-1 py-0.5 text-xs text-stone-100 focus:outline-none focus:border-amber-400"
                              onChange={ev => {
                                setVariantMutation.mutate({ editionId: e.editionId, signatureType: sig.value, currency: ev.target.value || null })
                              }}
                            >
                              <option value="">—</option>
                              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
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
                  coverImage: (e.edition as any)?.additionalImages?.[0] ?? null,
                  companyName: (e.edition as any)?.bookBoxCompany?.name ?? null,
                }))}
                onAdd={linked => addMutation.mutate(linked.editionId)}
                onRemove={editionId => removeMutation.mutate(editionId)}
                defaultFirstAccessDate={defaultFirstAccessDate}
                defaultEarlyAccessDate={defaultEarlyAccessDate}
                defaultGeneralSaleDate={defaultGeneralSaleDate}
                defaultPrice={announcement.basePrice ?? null}
                defaultCurrency={announcement.currency ?? null}
                defaultCompanyId={announcement.companyId ?? null}
                isBundle={announcement.isBundle ?? false}
                bundleBasePrice={announcement.basePrice ?? null}
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

// ─── Announcement Items Panel (for OVERSTOCK grouping) ────────────────────────
function AnnouncementItemsPanel({ announcement }: { announcement: ApiSaleAnnouncement }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const items = announcement.items ?? []
  const editions = announcement.editions ?? []

  const createMutation = useMutation({
    mutationFn: (name: string) => adminCreateAnnouncementItem(announcement.id, { name: name || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }); setNewItemName('') },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: ({ itemId, name }: { itemId: string; name: string }) => adminUpdateAnnouncementItem(announcement.id, itemId, { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }); setEditingItemId(null) },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => adminDeleteAnnouncementItem(announcement.id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const assignMutation = useMutation({
    mutationFn: ({ editionId, itemId }: { editionId: string; itemId: string | null }) => adminAssignEditionToItem(announcement.id, editionId, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  return (
    <div className="border-t border-stone-700 mt-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-stone-800/40 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-sm text-stone-400">
          📦 Item Groups (Overstock)
          {items.length > 0 && (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">{items.length}</span>
          )}
        </span>
        <span className="text-stone-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-stone-500">Group editions into purchasable bundles within this sale. Editions not assigned to a group are sold individually.</p>

          {/* Existing items */}
          {items.map(item => {
            const itemEditions = editions.filter(e => e.itemId === item.id)
            const unassigned = editions.filter(e => !e.itemId)
            return (
              <div key={item.id} className="bg-stone-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {editingItemId === item.id ? (
                    <>
                      <input
                        className="flex-1 bg-stone-700 border border-stone-600 rounded px-2 py-1 text-xs text-stone-100 focus:outline-none focus:border-amber-400"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && updateMutation.mutate({ itemId: item.id, name: editingName })}
                      />
                      <button type="button" onClick={() => updateMutation.mutate({ itemId: item.id, name: editingName })}
                        className="text-xs text-amber-400 hover:text-amber-300 px-2">Save</button>
                      <button type="button" onClick={() => setEditingItemId(null)}
                        className="text-xs text-stone-500 hover:text-stone-300 px-1">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-xs font-medium text-stone-200">{item.name || `Group ${item.sortOrder + 1}`}</span>
                      <button type="button" onClick={() => { setEditingItemId(item.id); setEditingName(item.name ?? '') }}
                        className="text-xs text-stone-400 hover:text-stone-200">Rename</button>
                      <button type="button" onClick={() => deleteMutation.mutate(item.id)}
                        className="text-xs text-red-400 hover:text-red-300">Delete</button>
                    </>
                  )}
                </div>
                <div className="text-xs text-stone-500">
                  Editions in this group: {itemEditions.length === 0 ? 'none' : itemEditions.map(e => e.edition?.book?.title ?? 'Unknown').join(', ')}
                </div>
                {/* Assign editions to this group */}
                {unassigned.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-stone-600">Add to group:</div>
                    {unassigned.map(e => (
                      <button key={e.editionId} type="button"
                        onClick={() => assignMutation.mutate({ editionId: e.editionId, itemId: item.id })}
                        className="block text-xs text-sky-400 hover:text-sky-300"
                      >
                        + {e.edition?.book?.title ?? 'Unknown'}
                      </button>
                    ))}
                  </div>
                )}
                {/* Remove from group */}
                {itemEditions.length > 0 && (
                  <div className="space-y-1">
                    {itemEditions.map(e => (
                      <button key={e.editionId} type="button"
                        onClick={() => assignMutation.mutate({ editionId: e.editionId, itemId: null })}
                        className="block text-xs text-red-400 hover:text-red-300"
                      >
                        − {e.edition?.book?.title ?? 'Unknown'} (remove from group)
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Add new group */}
          <div className="flex gap-2 items-center">
            <input
              className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-400"
              placeholder="New group name (optional)…"
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createMutation.mutate(newItemName)}
            />
            <button type="button" onClick={() => createMutation.mutate(newItemName)}
              disabled={createMutation.isPending}
              className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 px-2 py-1.5 rounded-lg hover:bg-amber-500/10 transition-colors disabled:opacity-50">
              + Add Group
            </button>
          </div>
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
  onCopy,
  isEditing,
}: {
  announcement: ApiSaleAnnouncement
  companyMap: Record<string, string>
  onEdit: () => void
  onDelete: () => void
  onCopy: () => void
  isEditing?: boolean
}){
  const thumb = announcement.imageUrl ? cloudThumb(announcement.imageUrl, 64, 80) : null
  const companyName = announcement.companyId ? (companyMap[announcement.companyId] ?? announcement.companyId) : null
  const saleDate = announcement.generalSaleDate
    ? fmtAdminDate(announcement.generalSaleDate, announcement.saleTimezone ?? 'UTC')
    : null

  return (
    <div className={`bg-stone-900 border border-stone-700 rounded-xl overflow-hidden${isEditing ? ' rounded-b-none border-b-0' : ''}`}>
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
                const counts: Record<string, number> = {}
                for (const e of (announcement.editions ?? [])) {
                  for (const v of (e.variants ?? [])) {
                    if (v.signatureType) counts[v.signatureType] = (counts[v.signatureType] ?? 0) + 1
                  }
                }
                const sigLabels: Record<string, string> = {
                  signed: '✍️ Signed',
                  autopen: '✒️ Autopen',
                  digitally_signed: '🖨️ Digitally Signed',
                  signed_bookplate: '🏷️ Bookplate',
                  unsigned: 'Unsigned',
                }
                const entries = Object.entries(counts)
                const totalVariants = entries.reduce((s, [, c]) => s + c, 0)
                const badges = entries.map(([type, count]) => (
                  <span key={type} className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                    {sigLabels[type] ?? type}{totalVariants > 1 ? ` ×${count}` : ''}
                  </span>
                ))
                return (announcement.isBundle || badges.length > 0) ? (
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {announcement.isBundle && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400">Bundle</span>}
                    {badges}
                  </div>
                ) : null
              })()}
              {companyName && <p className="text-stone-400 text-xs mt-0.5">{companyName}</p>}
              {saleDate && (() => {
                const typeLabels: Record<string, string> = {
                  LIMITED_PREORDER: '⏳ Limited Preorder',
                  OPEN_PREORDER: '🔓 Open Preorder',
                  OVERSTOCK: '📦 Overstock',
                  SALE: '🏷️ Sale',
                }
                const typeColors: Record<string, string> = {
                  LIMITED_PREORDER: 'bg-violet-500/15 text-violet-300',
                  OPEN_PREORDER: 'bg-sky-500/15 text-sky-300',
                  OVERSTOCK: 'bg-emerald-500/15 text-emerald-300',
                  SALE: 'bg-amber-500/15 text-amber-300',
                }
                const type = (announcement as any).saleType
                return (
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-stone-500 text-xs">📅 {saleDate}</span>
                    {type && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColors[type] ?? 'bg-stone-700 text-stone-400'}`}>
                        {typeLabels[type] ?? type}
                      </span>
                    )}
                    {(announcement as any).isSoldOut && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">Sold Out</span>
                    )}
                  </div>
                )
              })()}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={onEdit}
                className={`text-xs px-3 py-1 rounded border transition-colors ${isEditing ? 'bg-amber-400/20 text-amber-300 border-amber-400/50' : 'text-amber-400 hover:text-amber-300 border-stone-600 hover:border-amber-400/50'}`}>
                {isEditing ? 'Cancel' : 'Edit'}
              </button>
              <button onClick={onCopy}
                className="text-sky-400 hover:text-sky-300 text-xs px-3 py-1 rounded border border-stone-600 hover:border-sky-400/50 transition-colors">
                Copy
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
      {(announcement as any).saleType === 'OVERSTOCK' && <AnnouncementItemsPanel announcement={announcement} />}
      <AnnouncementRegionsPanel announcement={announcement} />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

// ─── AI Sale Parse types ──────────────────────────────────────────────────────
interface AiSaleRegion {
  name: string
  isDefault: boolean
  countryCodes?: string
  price?: number
  currency?: string
  saleTimezone?: string
  firstAccessDate?: string
  earlyAccessDate?: string
  generalSaleDate?: string
}

interface AiSaleResult {
  title?: string
  companyName?: string
  subscriberBasePrice?: number
  expectedShipping?: string
  saleType?: SaleType
  endsAt?: string
  regions?: AiSaleRegion[]
}

// ─── AI Sale Parse Modal ──────────────────────────────────────────────────────
function AiSaleParseModal({ onApply, onClose }: {
  onApply: (result: AiSaleResult, sourceUrl?: string) => void
  onClose: () => void
}) {
  const [inputMode, setInputMode] = useState<'text' | 'url' | 'screenshot'>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AiSaleResult | null>(null)
  const [parsedUrl, setParsedUrl] = useState<string | undefined>(undefined)

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

  const handleParse = async () => {
    if (inputMode === 'url' && !url.trim()) return
    if (inputMode === 'text' && !text.trim()) return
    if (inputMode === 'screenshot' && !imageBase64) return
    setLoading(true)
    setError(null)
    try {
      const body = inputMode === 'url'
        ? { url: url.trim() }
        : inputMode === 'screenshot'
          ? { imageBase64 }
          : { text: text.trim() }
      const r = await authFetch<AiSaleResult>('/ai/parse-sale', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setResult(r)
      setParsedUrl(inputMode === 'url' ? url.trim() : undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const canParse = inputMode === 'url' ? !!url.trim() : inputMode === 'screenshot' ? !!imageBase64 : !!text.trim()

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col gap-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-stone-100 font-semibold text-lg">Parse announcement with AI</h2>
          <button type="button" onClick={onClose} className="text-stone-500 hover:text-stone-300 text-xl">✕</button>
        </div>

        {!result ? (
          <>
            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-stone-700 self-start">
              <button type="button" onClick={() => setInputMode('text')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${inputMode === 'text' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-stone-200'}`}>
                Paste text
              </button>
              <button type="button" onClick={() => setInputMode('url')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${inputMode === 'url' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-stone-200'}`}>
                Enter URL
              </button>
              <button type="button" onClick={() => setInputMode('screenshot')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${inputMode === 'screenshot' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-stone-200'}`}>
                Screenshot
              </button>
            </div>

            {inputMode === 'text' ? (
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Paste the full announcement text here…"
                rows={10}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-400 resize-y"
              />
            ) : inputMode === 'url' ? (
              <div className="space-y-1">
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleParse()}
                  placeholder="https://www.fairyloot.com/blogs/…"
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-400"
                />
                <p className="text-xs text-stone-500">The page will be fetched server-side and its text sent to AI. Works with FairyLoot, OwlCrate, Illumicrate, etc.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <input type="file" accept="image/*" onChange={handleFileChange}
                  className="block w-full text-sm text-stone-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-stone-700 file:text-stone-200 hover:file:bg-stone-600 cursor-pointer" />
                {imagePreview && (
                  <img src={imagePreview} alt="Preview" className="max-h-60 rounded-lg border border-stone-700 object-contain" />
                )}
                <p className="text-xs text-stone-500">Image is processed in-memory and never saved to storage.</p>
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-400 hover:text-stone-200">Cancel</button>
              <button type="button" onClick={handleParse} disabled={loading || !canParse}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-colors">
                {loading ? 'Parsing…' : 'Parse with AI'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4 text-sm">
              {result.title && (
                <div>
                  <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">Title</p>
                  <p className="text-stone-100 font-medium">{result.title}</p>
                </div>
              )}
              {result.saleType && (
                <div>
                  <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">Sale Type</p>
                  <p className="text-stone-300">{{ LIMITED_PREORDER: 'Limited Preorder', OPEN_PREORDER: 'Open Preorder', OVERSTOCK: 'Overstock', SALE: 'Sale' }[result.saleType] ?? result.saleType}</p>
                </div>
              )}
              {result.expectedShipping && (
                <div>
                  <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">Expected shipping</p>
                  <p className="text-stone-300">{result.expectedShipping}</p>
                </div>
              )}
              {result.endsAt && (
                <div>
                  <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">Ends At</p>
                  <p className="text-stone-300">{new Date(result.endsAt).toLocaleString('en-GB')} UTC</p>
                </div>
              )}
              {result.regions && result.regions.length > 0 && (
                <div>
                  <p className="text-stone-500 text-xs uppercase tracking-wider mb-2">Regional windows ({result.regions.length})</p>
                  <div className="space-y-2">
                    {result.regions.map((r, i) => (
                      <div key={i} className="bg-stone-800 rounded-lg p-3 border border-stone-700">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-stone-100 font-medium">{r.name}</span>
                          {r.isDefault && <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">default</span>}
                          {r.currency && r.price != null && (
                            <span className="text-amber-400 text-xs ml-auto">{r.currency} {r.price}</span>
                          )}
                        </div>
                        <div className="text-xs text-stone-500 space-y-0.5">
                          {r.countryCodes && <p>Countries: {r.countryCodes}</p>}
                          {r.firstAccessDate && <p>First access: {new Date(r.firstAccessDate).toLocaleString('en-GB')} UTC</p>}
                          {r.earlyAccessDate && <p>Early access: {new Date(r.earlyAccessDate).toLocaleString('en-GB')} UTC</p>}
                          {r.generalSaleDate && <p>General sale: {new Date(r.generalSaleDate).toLocaleString('en-GB')} UTC</p>}
                          {r.saleTimezone && <p>Timezone: {r.saleTimezone}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-stone-800">
              <button type="button" onClick={() => setResult(null)} className="text-sm text-stone-500 hover:text-stone-300">
                ← Re-parse
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-400 hover:text-stone-200">Cancel</button>
                <button type="button" onClick={() => onApply(result, parsedUrl)}
                  className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-500 transition-colors">
                  Apply to form
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function AdminSaleAnnouncementsPage() {
  const queryClient = useQueryClient()
  const createModal = useModalState()
  const [editItem, setEditItem] = useState<ApiSaleAnnouncement | null>(null)
  const [deleteItem, setDeleteItem] = useState<ApiSaleAnnouncement | null>(null)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [saleTypeFilter, setSaleTypeFilter] = useState<SaleType | ''>('')

  // AI parse state
  const { isOpen: showAiModal, setIsOpen: setShowAiModal } = useModalState()
  const [createInitial, setCreateInitial] = useState<FormState>(EMPTY_FORM)
  const [createFormKey, setCreateFormKey] = useState(0)
  const pendingRegionsRef = useRef<AiSaleRegion[]>([])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [search])

  const { data: saData, isLoading } = useQuery({
    queryKey: ['admin', 'sale-announcements', page, debouncedSearch, companyFilter, saleTypeFilter],
    queryFn: () => adminGetSaleAnnouncements({ page, pageSize: 10, search: debouncedSearch || undefined, companyId: companyFilter || undefined, saleType: saleTypeFilter || undefined }),
    placeholderData: keepPreviousData,
  })
  const announcements = saData?.data ?? []
  const totalPages = saData?.totalPages ?? 1

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
    onSuccess: (newAnnouncement) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] })
      createModal.close()
      setCreateInitial(EMPTY_FORM)
      setCreateFormKey(k => k + 1)
      const regions = pendingRegionsRef.current
      if (regions.length > 0) {
        pendingRegionsRef.current = []
        Promise.all(
          regions.map(r => {
            const codes = r.countryCodes
              ? r.countryCodes.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
              : []
            return adminUpsertAnnouncementRegion(newAnnouncement.id, {
              name: r.name,
              countryCodes: codes.length > 0 ? JSON.stringify(codes) : undefined,
              isDefault: r.isDefault,
              generalSaleDate: r.generalSaleDate ?? null,
              firstAccessDate: r.firstAccessDate ?? null,
              earlyAccessDate: r.earlyAccessDate ?? null,
              saleTimezone: r.saleTimezone ?? null,
              basePrice: r.price ?? null,
              currency: r.currency ?? null,
            })
          })
        ).then(() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] })
        }).catch(e => alert(`Error creating regions: ${(e as Error).message}`))
      }
    },
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

  const copyMutation = useMutation({
    mutationFn: (id: string) => adminDuplicateSaleAnnouncement(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sale-announcements'] }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const handleAiApply = (result: AiSaleResult, sourceUrl?: string) => {
    setShowAiModal(false)
    const defaultRegion = result.regions?.find(r => r.isDefault) ?? result.regions?.[0]
    const tz = defaultRegion?.saleTimezone ?? 'UTC'

    // Try to match companyName to known companies
    let resolvedCompanyId = ''
    if (result.companyName) {
      const name = result.companyName.toLowerCase()
      const match = allCompanies.find(c =>
        c.name.toLowerCase() === name ||
        c.name.toLowerCase().includes(name) ||
        name.includes(c.name.toLowerCase())
      )
      if (match) resolvedCompanyId = match.id
    }

    const newInitial: FormState = {
      ...EMPTY_FORM,
      title: result.title ?? '',
      companyId: resolvedCompanyId,
      expectedShipping: result.expectedShipping ?? '',
      photoCredit: '',
      saleTimezone: tz,
      firstAccessDate: defaultRegion?.firstAccessDate ? utcIsoToTzLocal(defaultRegion.firstAccessDate, tz) : '',
      earlyAccessDate: defaultRegion?.earlyAccessDate ? utcIsoToTzLocal(defaultRegion.earlyAccessDate, tz) : '',
      generalSaleDate: defaultRegion?.generalSaleDate ? utcIsoToTzLocal(defaultRegion.generalSaleDate, tz) : '',
      endsAt: result.endsAt ? utcIsoToTzLocal(result.endsAt, tz) : '',
      basePrice: defaultRegion?.price != null ? String(defaultRegion.price) : '',
      currency: defaultRegion?.currency ?? 'USD',
      subscriberBasePrice: (defaultRegion as any)?.subscriberBasePrice != null
        ? String((defaultRegion as any).subscriberBasePrice)
        : result.subscriberBasePrice != null ? String(result.subscriberBasePrice) : '',
      sourceUrl: sourceUrl ?? '',
      saleType: result.saleType ?? 'LIMITED_PREORDER',
      isSoldOut: false,
      notes: '',
    }
    setCreateInitial(newInitial)
    setCreateFormKey(k => k + 1)
    pendingRegionsRef.current = (result.regions?.length ?? 0) > 1 ? (result.regions ?? []) : []
    setEditItem(null)
    createModal.open()
  }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <h1 className="text-2xl font-bold text-stone-100 mr-auto">Sale Announcements</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => setShowAiModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-stone-800 text-stone-300 hover:bg-stone-700 border border-stone-700 hover:border-stone-600 transition-colors">
            <Sparkles size={14} className="text-amber-400" />
            Parse with AI
          </button>
          <button
            onClick={() => {
              if (!createModal.isOpen) {
                setCreateInitial(EMPTY_FORM)
                setCreateFormKey(k => k + 1)
                pendingRegionsRef.current = []
              }
              createModal.toggle()
              setEditItem(null)
            }}
            className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors"
          >
            {createModal.isOpen ? '✕ Cancel' : '+ Add Sale'}
          </button>
        </div>
      </div>

      {/* Inline create form */}
      {createModal.isOpen && (
        <div className="bg-stone-900 border border-amber-500/40 rounded-xl p-5 mb-5">
          <h2 className="text-amber-400 font-semibold text-sm mb-4">New Sale Announcement</h2>
          <SaleAnnouncementForm
            key={createFormKey}
            initial={createInitial}
            submitLabel="Create"
            submitting={createMutation.isPending}
            onSubmit={form => createMutation.mutate(form)}
          />
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="search"
          placeholder="Search announcements…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 w-64 text-sm"
        />
        <select
          value={companyFilter}
          onChange={e => { setCompanyFilter(e.target.value); setPage(1) }}
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-300 focus:outline-none focus:border-amber-400 text-sm"
        >
          <option value="">All companies</option>
          {allCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={saleTypeFilter}
          onChange={e => { setSaleTypeFilter(e.target.value as SaleType | ''); setPage(1) }}
          className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-300 focus:outline-none focus:border-amber-400 text-sm"
        >
          <option value="">All types</option>
          <option value="LIMITED_PREORDER">Limited Preorder</option>
          <option value="OPEN_PREORDER">Open Preorder</option>
          <option value="OVERSTOCK">Overstock</option>
          <option value="SALE">Sale</option>
        </select>
        {(search || companyFilter || saleTypeFilter) && (
          <button onClick={() => { setSearch(''); setCompanyFilter(''); setSaleTypeFilter(''); setPage(1) }}
            className="text-stone-400 hover:text-stone-200 text-sm px-3 py-2">Clear</button>
        )}
      </div>

      {isLoading ? (
        <div className="text-stone-400 py-8 text-center">Loading…</div>
      ) : announcements.length === 0 ? (
        <div className="text-stone-500 py-8 text-center">No sale announcements yet.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map(a => (
            <div key={a.id}>
              <AnnouncementCard
                announcement={a}
                companyMap={companyMap}
                onEdit={() => { setEditItem(editItem?.id === a.id ? null : a); createModal.close() }}
                onDelete={() => setDeleteItem(a)}
                onCopy={() => copyMutation.mutate(a.id)}
                isEditing={editItem?.id === a.id}
              />
              {editItem?.id === a.id && (
                <div className="bg-stone-900 border border-amber-500/40 border-t-0 rounded-b-xl p-5 -mt-1">
                  <h2 className="text-amber-400 font-semibold text-sm mb-4">Edit Sale Announcement</h2>
                  <SaleAnnouncementForm
                    key={editItem.id}
                    initial={announcementToForm(editItem)}
                    submitLabel="Save Changes"
                    submitting={editMutation.isPending}
                    onSubmit={form => editMutation.mutate({ id: editItem.id, form })}
                  />
                  <button
                    type="button"
                    onClick={() => setEditItem(null)}
                    className="mt-3 text-stone-500 hover:text-stone-300 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <ConfirmDialog
        open={deleteItem !== null}
        message={`Delete "${deleteItem?.title}"? This cannot be undone.`}
        onConfirm={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
        onCancel={() => setDeleteItem(null)}
      />

      {showAiModal && (
        <AiSaleParseModal
          onApply={handleAiApply}
          onClose={() => setShowAiModal(false)}
        />
      )}
    </div>
  )
}
