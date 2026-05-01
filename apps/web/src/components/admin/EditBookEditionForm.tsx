'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { PersonPicker, type PersonEntry } from './pickers/PersonPicker'
import type { ApiBookEdition } from '@luxgrimoire/shared-types'
import MultiImageUpload from './MultiImageUpload'

// ─── Styles ───────────────────────────────────────────────────────────────────
const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-xs text-stone-400 mb-1'
const BTN_PRIMARY = 'px-4 py-2 rounded-lg text-sm font-semibold bg-amber-400 text-stone-950 hover:bg-amber-300 disabled:opacity-50 transition-colors'
const BTN_GHOST = 'px-4 py-2 rounded-lg text-sm font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 transition-colors'
const BTN_SM = 'px-2.5 py-1 rounded-md text-xs font-medium transition-colors'

// ─── Types ────────────────────────────────────────────────────────────────────
type ArtistEntry = { id?: string; name: string; role: string; existing?: boolean }
type Company = { id: string; name: string; slug: string }

interface AiParseResult {
  edition?: {
    publisher?: string
    price?: number; currency?: string
    firstAccessDate?: string; earlyAccessDate?: string; generalSaleDate?: string
    features?: string[]
    artists?: { name: string; role: string }[]
  }
}

// ─── FeatureTags ──────────────────────────────────────────────────────────────
function FeatureTags({ features, onChange }: { features: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !features.includes(v)) onChange([...features, v])
    setInput('')
  }
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-1.5 text-stone-100 text-sm focus:outline-none focus:border-amber-400"
          value={input} placeholder="Add feature…"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" onClick={add}
          className="px-3 py-1.5 rounded-lg text-sm bg-stone-700 text-stone-200 hover:bg-stone-600">Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {features.map((f, i) => (
          <span key={i} className="flex items-center gap-1.5 bg-stone-700 text-stone-200 text-xs px-2.5 py-1 rounded-full">
            {f}
            <button type="button" onClick={() => onChange(features.filter((_, j) => j !== i))}
              className="text-stone-500 hover:text-red-400">×</button>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── AI Parse section ─────────────────────────────────────────────────────────
function AiParseSection({ onResult }: { onResult: (r: AiParseResult) => void }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'text' | 'url'>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)

  const parse = async () => {
    setParsing(true)
    try {
      const payload = tab === 'text' ? { text } : { imageUrl: url }
      const result = await authFetch<AiParseResult>('/ai/parse', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      onResult(result)
      setOpen(false)
      setText(''); setUrl('')
    } catch (e: unknown) {
      alert(`AI parse failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setParsing(false)
    }
  }

  const canParse = tab === 'text' ? text.trim().length > 10 : url.trim().startsWith('http')

  return (
    <div className="border border-amber-500/30 rounded-xl overflow-hidden bg-stone-900/60">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-stone-800/60 transition-colors">
        <span className="flex items-center gap-2 text-amber-400 font-medium">
          <span>✨</span> Parse with AI
        </span>
        <span className="text-stone-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-stone-700/60 p-4 space-y-3">
          <div className="flex gap-1 bg-stone-800 rounded-lg p-0.5">
            {(['text', 'url'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === t ? 'bg-stone-700 text-stone-100' : 'text-stone-500 hover:text-stone-300'}`}>
                {t === 'text' ? 'Paste Text' : 'Image URL'}
              </button>
            ))}
          </div>
          {tab === 'text' ? (
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
              placeholder="Paste social media post, newsletter, or announcement text…"
              className={`${INP} resize-none`} />
          ) : (
            <input value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://… (public image URL)"
              className={INP} />
          )}
          <button type="button" disabled={!canParse || parsing} onClick={parse}
            className={`${BTN_SM} bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-40 px-4 py-2 text-sm`}>
            {parsing ? '✨ Parsing…' : '✨ Auto-fill fields'}
          </button>
          <p className="text-stone-500 text-xs">Fields will be pre-filled — review and adjust before saving.</p>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export interface EditBookEditionFormProps {
  edition: ApiBookEdition
  onSuccess: () => void
  onCancel: () => void
}

export default function EditBookEditionForm({ edition, onSuccess, onCancel }: EditBookEditionFormProps) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  // Pre-populate from existing edition
  const [companyId, setCompanyId] = useState(edition.bookBoxCompanyId ?? '')
  const [collectionId, setCollectionId] = useState((edition as any).collectionId ?? '')
  const [price, setPrice] = useState(edition.basePrice ?? '')
  const [currency, setCurrency] = useState(edition.currency ?? 'USD')
  const [publisher, setPublisher] = useState(edition.publisher ?? '')
  const [photoCredit, setPhotoCredit] = useState((edition as any).photoCredit ?? '')
  const [language, setLanguage] = useState(edition.language ?? '')
  const [firstAccessDate, setFirstAccessDate] = useState(edition.firstAccessDate?.slice(0, 10) ?? '')
  const [earlyAccessDate, setEarlyAccessDate] = useState(edition.earlyAccessDate?.slice(0, 10) ?? '')
  const [generalSaleDate, setGeneralSaleDate] = useState(edition.generalSaleDate?.slice(0, 10) ?? '')
  const [allImages, setAllImages] = useState<string[]>(() => {
    return edition.additionalImages?.length ? [...edition.additionalImages] : []
  })
  const [features, setFeatures] = useState<string[]>(edition.features ?? [])
  const [artists, setArtists] = useState<ArtistEntry[]>(
    (edition.artists ?? []).map(a => ({ id: a.artist.id, name: a.artist.name, role: a.role, existing: true }))
  )
  // Track which existing artists were removed
  const [removedArtistIds, setRemovedArtistIds] = useState<Set<string>>(new Set())

  // Companies list
  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => authFetch<{ data: Company[] }>('/companies?pageSize=100'),
  })
  const companies = companiesData?.data ?? []

  // Collections for selected company
  const { data: collectionsData } = useQuery({
    queryKey: ['collections-by-company', companyId],
    queryFn: () => authFetch<{ data: { id: string; name: string }[] }>(`/book-box-collections?companyId=${companyId}&pageSize=100`),
    enabled: !!companyId,
  })
  const collections = collectionsData?.data ?? []

  const applyAiResult = (r: AiParseResult) => {
    if (r.edition?.publisher) setPublisher(r.edition.publisher)
    if (r.edition?.price != null) setPrice(String(r.edition.price))
    if (r.edition?.currency) setCurrency(r.edition.currency)
    if (r.edition?.firstAccessDate) setFirstAccessDate(r.edition.firstAccessDate)
    if (r.edition?.earlyAccessDate) setEarlyAccessDate(r.edition.earlyAccessDate)
    if (r.edition?.generalSaleDate) setGeneralSaleDate(r.edition.generalSaleDate)
    if (r.edition?.features?.length) {
      setFeatures(prev => Array.from(new Set([...prev, ...r.edition!.features!])))
    }
    if (r.edition?.artists?.length) {
      setArtists(prev => {
        const normalize = (s: string) => s.toLowerCase().replace(/^@/, '')
        const existing = new Set(prev.map(a => `${normalize(a.name)}|${a.role.toLowerCase()}`))
        const toAdd = r.edition!.artists!.filter(a => !existing.has(`${normalize(a.name)}|${a.role.toLowerCase()}`))
        return [...prev, ...toAdd.map(a => ({ name: a.name, role: a.role }))]
      })
    }
  }

  const removeArtist = (index: number) => {
    const art = artists[index]
    if (art.existing && art.id) {
      setRemovedArtistIds(prev => new Set([...prev, art.id!]))
    }
    setArtists(prev => prev.filter((_, j) => j !== index))
  }

  const handleSubmit = async () => {
    setBusy(true)
    try {
      // 1. Patch the edition fields
      await authFetch(`/editions/${edition.slug}`, {
        method: 'PATCH',
        body: JSON.stringify({
          bookBoxCompanyId: companyId || undefined,
          collectionId: collectionId || undefined,
          publisher: publisher.trim() || undefined,
          photoCredit: photoCredit.trim() || undefined,
          basePrice: price || undefined,
          currency: currency || undefined,
          language: language || undefined,
          firstAccessDate: firstAccessDate || undefined,
          earlyAccessDate: earlyAccessDate || undefined,
          generalSaleDate: generalSaleDate || undefined,
          additionalImages: allImages.filter(Boolean),
          features: features.filter(Boolean),
        }),
      })

      // 2. Remove deleted artists
      for (const artistId of removedArtistIds) {
        await authFetch(`/editions/${edition.slug}/artists/${artistId}`, { method: 'DELETE' })
      }

      // 3. Add new artists (those without `existing` flag) — same artist may appear
      //    multiple times with different roles (AI may split them per bullet)
      const artistIdByName = new Map<string, string>() // name.lower → resolved artistId
      for (const art of artists) {
        if (art.existing) continue // already linked
        const name = art.name.trim()
        if (!name) continue
        const key = name.toLowerCase()
        let artistId = art.id
        if (!artistId) {
          if (artistIdByName.has(key)) {
            artistId = artistIdByName.get(key)!
          } else {
            const existing = await authFetch<{ data: { id: string; name: string }[] }>(
              `/artists?search=${encodeURIComponent(name)}&pageSize=5`
            )
            const match = existing.data?.find(a => a.name.toLowerCase() === key)
            if (match) {
              artistId = match.id
            } else {
              const created = await authFetch<{ id: string }>('/artists', {
                method: 'POST', body: JSON.stringify({ name }),
              })
              artistId = created.id
            }
          }
        }
        artistIdByName.set(key, artistId)
        await authFetch(`/editions/${edition.slug}/artists`, {
          method: 'POST',
          body: JSON.stringify({ artistId, role: art.role || 'cover art' }),
        })
      }

      qc.invalidateQueries({ queryKey: ['admin', 'editions'] })
      qc.invalidateQueries({ queryKey: ['artists-search'] })
      setSaved(true)
      setTimeout(() => onSuccess(), 600)
    } catch (e: unknown) {
      alert(`Error saving edition: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs text-stone-500 uppercase tracking-wide font-semibold">Edition details</span>
        {edition.book?.title && (
          <p className="text-stone-300 text-sm mt-0.5">{edition.book.title}</p>
        )}
      </div>

      {/* Company + price */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Company (book box)</label>
          <select value={companyId} onChange={e => { setCompanyId(e.target.value); setCollectionId('') }} className={INP}>
            <option value="">— none —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={LBL}>Price</label>
          <div className="flex gap-2">
            <input value={price} onChange={e => setPrice(e.target.value)}
              placeholder="45.99" className={`${INP} flex-1`} />
            <input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())}
              placeholder="USD" maxLength={3}
              className="w-16 bg-stone-800 border border-stone-700 rounded-lg px-2 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm text-center uppercase" />
          </div>
        </div>
      </div>

      {/* Collection picker (shown when company has collections) */}
      {companyId && collections.length > 0 && (
        <div>
          <label className={LBL}>Collection</label>
          <select value={collectionId} onChange={e => setCollectionId(e.target.value)} className={INP}>
            <option value="">— none —</option>
            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Publisher + Photo credit */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Publisher</label>
          <input value={publisher} onChange={e => setPublisher(e.target.value)}
            placeholder="e.g. Fairyloot Exclusive" className={INP} />
        </div>
        <div>
          <label className={LBL}>Photo by (IG handle)</label>
          <input value={photoCredit} onChange={e => setPhotoCredit(e.target.value)}
            placeholder="@username" className={INP} />
        </div>
      </div>

      {/* Language */}
      <div>
        <label className={LBL}>Language</label>
        <input value={language} onChange={e => setLanguage(e.target.value)}
          placeholder="e.g. English, Polish…" className={INP} />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={LBL}>First access</label>
          <input type="date" value={firstAccessDate} onChange={e => setFirstAccessDate(e.target.value)} className={INP} />
        </div>
        <div>
          <label className={LBL}>Early access</label>
          <input type="date" value={earlyAccessDate} onChange={e => setEarlyAccessDate(e.target.value)} className={INP} />
        </div>
        <div>
          <label className={LBL}>General sale</label>
          <input type="date" value={generalSaleDate} onChange={e => setGeneralSaleDate(e.target.value)} className={INP} />
        </div>
      </div>

      {/* Images */}
      <div>
        <label className={LBL}>Images <span className="text-stone-600 font-normal normal-case tracking-normal">(first image will be the main cover)</span></label>
        <MultiImageUpload
          images={allImages}
          folder="luxgrimoire/editions"
          onChange={setAllImages}
        />
      </div>

      <AiParseSection onResult={applyAiResult} />

      {/* Artists */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={LBL}>Artists / contributors</label>
          <button type="button"
            onClick={() => setArtists(prev => [...prev, { name: '', role: '' }])}
            className={`${BTN_SM} bg-stone-700 text-stone-400 hover:bg-stone-600`}>+ Add artist</button>
        </div>
        {artists.length > 0 && (
          <div className="space-y-2">
            {artists.map((art, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1">
                  {art.name ? (
                    <div className="flex items-center gap-1.5 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200">
                      {!art.existing && <span className="text-amber-400 text-[9px] font-semibold uppercase">new</span>}
                      <span className="flex-1">{art.name}</span>
                      <button
                        onClick={() => setArtists(prev => prev.map((x, j) => j === i ? { ...x, id: undefined, name: '', existing: false } : x))}
                        className="text-stone-500 hover:text-red-400 text-xs">×</button>
                    </div>
                  ) : (
                    <PersonPicker endpoint="artists" placeholder="Search or create artist…"
                      onAdd={(a: PersonEntry) => setArtists(prev => prev.map((x, j) => j === i ? { ...x, id: a.id, name: a.name } : x))} />
                  )}
                </div>
                <input value={art.role} onChange={e => setArtists(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                  placeholder="Role (e.g. cover art, map…)"
                  className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-2 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-xs" />
                <button type="button" onClick={() => removeArtist(i)}
                  className="mt-2 text-red-400 hover:text-red-300 text-xs">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Features */}
      <div>
        <label className={LBL}>Features / extras</label>
        <FeatureTags features={features} onChange={setFeatures} />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy || saved} onClick={handleSubmit}
          className={saved
            ? 'px-4 py-2 rounded-lg text-sm font-semibold bg-green-500 text-white transition-colors'
            : BTN_PRIMARY}>
          {saved ? '✓ Saved!' : busy ? 'Saving…' : 'Save Changes'}
        </button>
        <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
      </div>
    </div>
  )
}
