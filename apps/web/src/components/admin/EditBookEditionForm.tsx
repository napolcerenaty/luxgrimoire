'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiBookEdition } from '@luxgrimoire/shared-types'
import { EditionFieldsSection, type AiParseResult, type ArtistEntry, type EditionCompany, FEATURE_TAGS_QUERY_KEY } from './EditionFieldsSection'
import { applyAiEditionResult } from '@/lib/applyAiEditionResult'
import { BTN_PRIMARY, BTN_GHOST, LBL } from '@/lib/adminFormStyles'

// ─── Styles ───────────────────────────────────────────────────────────────────
const BTN_DANGER = 'px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/50 text-red-300 hover:bg-red-800/50 transition-colors'

// ─── Edition History Section ──────────────────────────────────────────────────
function EditionHistorySection({ edition, onLinked }: { edition: ApiBookEdition; onLinked: () => void }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [linking, setLinking] = useState(false)
  const [rerouted, setRerouted] = useState<null | { chain: Array<{ slug: string }> }>(null)

  const bookId = edition.book?.id
  const { data: searchResults } = useQuery({
    queryKey: ['edition-search-for-link', bookId, searchQuery],
    queryFn: () => authFetch<{ data: Array<{ id: string; slug: string; bookBoxCompany?: { name: string } | null; generalSaleDate?: string | null }> }>(
      `/editions?bookId=${bookId}&search=${encodeURIComponent(searchQuery)}&pageSize=10`
    ),
    enabled: !!bookId && searchQuery.length > 0,
  })
  const candidates = (searchResults?.data ?? []).filter(e => e.slug !== edition.slug)

  const handleLink = async (relatedEditionSlug: string) => {
    setLinking(true)
    try {
      const res = await authFetch<{ wasRerouted: boolean; chain: Array<{ slug: string }> }>(
        `/editions/${edition.slug}/link-history`,
        { method: 'POST', body: JSON.stringify({ relatedEditionSlug }) }
      )
      if (res.wasRerouted) {
        setRerouted(res)
      }
      onLinked()
    } catch (e) {
      alert(`Link failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLinking(false)
      setSearchQuery('')
    }
  }

  const handleUnlink = async () => {
    if (!confirm('Remove this edition from history chain?')) return
    setLinking(true)
    try {
      await authFetch(`/editions/${edition.slug}/link-history`, { method: 'DELETE' })
      onLinked()
    } catch (e) {
      alert(`Unlink failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLinking(false)
    }
  }

  const prev = edition.previousEdition
  const next = edition.nextEdition

  return (
    <div className="space-y-3">
      <span className="text-xs text-stone-500 uppercase tracking-wide font-semibold">Edition History</span>

      {/* Current chain display */}
      {(prev || next) && (
        <div className="flex flex-col gap-1.5 p-2 bg-stone-800/50 rounded-lg text-xs text-stone-400">
          {prev && (
            <div className="flex items-center gap-2">
              <span className="text-stone-500">← Previous:</span>
              <span className="text-stone-300">{prev.bookBoxCompany?.name ?? prev.slug}</span>
              <span className="text-stone-600 text-[10px]">{prev.generalSaleDate?.slice(0, 10)}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-medium">Current edition</span>
            {prev && (
              <button type="button" onClick={handleUnlink} disabled={linking} className={BTN_DANGER}>
                Unlink from previous
              </button>
            )}
          </div>
          {next && (
            <div className="flex items-center gap-2">
              <span className="text-stone-500">→ Next:</span>
              <span className="text-stone-300">{next.bookBoxCompany?.name ?? next.slug}</span>
              <span className="text-stone-600 text-[10px]">{next.generalSaleDate?.slice(0, 10)}</span>
            </div>
          )}
        </div>
      )}

      {/* Re-routing notice */}
      {rerouted && (
        <div className="p-2 bg-amber-900/30 border border-amber-700/40 rounded-lg text-xs text-amber-300">
          ↻ Chain re-linked: {rerouted.chain.map(e => e.slug).join(' → ')}
        </div>
      )}

      {/* Link search */}
      {!prev && (
        <div className="space-y-1.5">
          <label className={LBL}>Link to a previous edition (same book)</label>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search editions by company or name…"
            className="w-full px-3 py-1.5 rounded bg-stone-700 text-stone-200 text-sm placeholder-stone-500 focus:outline-none"
          />
          {candidates.length > 0 && (
            <div className="flex flex-col gap-1">
              {candidates.map(c => (
                <button
                  key={c.slug}
                  type="button"
                  disabled={linking}
                  onClick={() => handleLink(c.slug)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-stone-700 hover:bg-stone-600 text-sm text-stone-200 text-left transition-colors"
                >
                  <span>{c.bookBoxCompany?.name ?? c.slug}</span>
                  {c.generalSaleDate && <span className="text-stone-500 text-xs">{c.generalSaleDate.slice(0, 10)}</span>}
                </button>
              ))}
            </div>
          )}
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
  const [isOmnibus, setIsOmnibus] = useState(edition.isOmnibus ?? false)

  // Artists state — initialized from existing contributions
  const [artists, setArtists] = useState<ArtistEntry[]>(() =>
    (edition.artists ?? []).map(a => ({ id: a.artist.id, name: a.artist.name, role: a.role, existing: true }))
  )
  const [removedArtistIds, setRemovedArtistIds] = useState<string[]>([])

  // Companies list
  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => authFetch<{ data: EditionCompany[] }>('/companies?pageSize=100'),
  })
  const companies = companiesData?.data ?? []

  // Collections for selected company
  const { data: collectionsData } = useQuery({
    queryKey: ['collections-by-company', companyId],
    queryFn: () => authFetch<{ data: { id: string; name: string }[] }>(`/book-box-collections?companyId=${companyId}&pageSize=100`),
    enabled: !!companyId,
  })
  const collections = collectionsData?.data ?? []

  const applyAiResult = async (r: AiParseResult) => {
    applyAiEditionResult(r, { setPublisher, setPrice, setCurrency, setFirstAccessDate, setEarlyAccessDate, setGeneralSaleDate })
    const slug = edition.slug
    // Collect all artist roles to avoid creating duplicate standalone feature entries
    const artistRoles = new Set(
      (r.edition?.artists ?? []).map(a => a.role?.trim()).filter(Boolean)
    )
    const featurePosts: Promise<unknown>[] = []
    for (const feature of (r.edition?.features ?? [])) {
      const trimmed = feature.trim()
      if (trimmed && !artistRoles.has(trimmed)) {
        featurePosts.push(authFetch(`/editions/${slug}/feature-tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawValue: trimmed, categories: [] }),
        }).catch(() => null))
      }
    }
    if (featurePosts.length > 0) {
      await Promise.all(featurePosts)
      qc.invalidateQueries({ queryKey: FEATURE_TAGS_QUERY_KEY(slug) })
    }
    // Add AI-parsed artists to local state — user must link them via PersonPicker to save
    const aiArtists = (r.edition?.artists ?? [])
      .filter(a => a.role?.trim())
      .map(a => ({ name: a.name ?? '', role: a.role!.trim() }))
    if (aiArtists.length > 0) {
      setArtists(prev => {
        const existingRoles = new Set(prev.map(a => a.role.toLowerCase()))
        const toAdd = aiArtists.filter(a => !existingRoles.has(a.role.toLowerCase()))
        return [...prev, ...toAdd]
      })
    }
  }

  const handleSubmit = async () => {
    setBusy(true)
    try {
      // 1. Patch the edition fields
      await authFetch(`/editions/${edition.slug}`, {
        method: 'PATCH',
        body: JSON.stringify({
          bookBoxCompanyId: companyId || undefined,
          collectionId: collectionId || null,
          publisher: publisher.trim() || undefined,
          photoCredit: photoCredit.trim() || null,
          basePrice: price || undefined,
          currency: currency || undefined,
          language: language || undefined,
          firstAccessDate: firstAccessDate || undefined,
          earlyAccessDate: earlyAccessDate || undefined,
          generalSaleDate: generalSaleDate || undefined,
          additionalImages: allImages.filter(Boolean),
          isOmnibus,
        }),
      })
      // 2. Sync artist contributions
      await Promise.all(
        removedArtistIds.map(artistId =>
          authFetch(`/editions/${edition.slug}/artists/${artistId}`, { method: 'DELETE' }).catch(() => null)
        )
      )
      await Promise.all(
        artists
          .filter(a => !a.existing && a.id)
          .map(a =>
            authFetch(`/editions/${edition.slug}/artists`, {
              method: 'POST',
              body: JSON.stringify({ artistId: a.id, role: a.role, artistName: a.name }),
            }).catch(() => null)
          )
      )

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

      <EditionFieldsSection
        companyId={companyId}
        onCompanyChange={setCompanyId}
        collectionId={collectionId}
        onCollectionChange={setCollectionId}
        price={price}
        onPriceChange={setPrice}
        currency={currency}
        onCurrencyChange={setCurrency}
        publisher={publisher}
        onPublisherChange={setPublisher}
        photoCredit={photoCredit}
        onPhotoCreditChange={setPhotoCredit}
        language={language}
        onLanguageChange={setLanguage}
        firstAccessDate={firstAccessDate}
        onFirstAccessDateChange={setFirstAccessDate}
        earlyAccessDate={earlyAccessDate}
        onEarlyAccessDateChange={setEarlyAccessDate}
        generalSaleDate={generalSaleDate}
        onGeneralSaleDateChange={setGeneralSaleDate}
        allImages={allImages}
        onImagesChange={setAllImages}
        onAiResult={applyAiResult}
        artists={artists}
        onArtistsChange={setArtists}
        onRemoveExistingArtist={id => setRemovedArtistIds(prev => [...prev, id])}
        featureTags={edition.featureTags}
        isOmnibus={isOmnibus}
        onIsOmnibusChange={setIsOmnibus}
        editionSlug={edition.slug}
        companies={companies}
        collections={collections}
      />

      <hr className="border-stone-700/50" />
      <EditionHistorySection edition={edition} onLinked={() => qc.invalidateQueries({ queryKey: ['admin', 'editions'] })} />

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
