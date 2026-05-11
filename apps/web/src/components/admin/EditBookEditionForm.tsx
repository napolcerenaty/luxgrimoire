'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiBookEdition } from '@luxgrimoire/shared-types'
import { EditionFieldsSection, type AiParseResult, type ArtistEntry, type EditionCompany } from './EditionFieldsSection'
import { applyAiEditionResult } from '@/lib/applyAiEditionResult'

// ─── Styles ───────────────────────────────────────────────────────────────────
const BTN_PRIMARY = 'px-4 py-2 rounded-lg text-sm font-semibold bg-amber-400 text-stone-950 hover:bg-amber-300 disabled:opacity-50 transition-colors'
const BTN_GHOST = 'px-4 py-2 rounded-lg text-sm font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 transition-colors'
const LBL = 'block text-xs text-stone-400 mb-1'

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
  const [isOmnibus, setIsOmnibus] = useState((edition as any).isOmnibus ?? false)
  const [artists, setArtists] = useState<ArtistEntry[]>(
    (edition.artists ?? []).map(a => ({ id: a.artist.id, name: a.artist.name, role: a.role, existing: true }))
  )
  // Track which existing artists were removed
  const [removedArtistIds, setRemovedArtistIds] = useState<Set<string>>(new Set())

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

  const applyAiResult = (r: AiParseResult) => {
    applyAiEditionResult(r, { setPublisher, setPrice, setCurrency, setFirstAccessDate, setEarlyAccessDate, setGeneralSaleDate, setFeatures, setArtists })
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
          photoCredit: photoCredit.trim() || null,
          basePrice: price || undefined,
          currency: currency || undefined,
          language: language || undefined,
          firstAccessDate: firstAccessDate || undefined,
          earlyAccessDate: earlyAccessDate || undefined,
          generalSaleDate: generalSaleDate || undefined,
          additionalImages: allImages.filter(Boolean),
          features: features.filter(Boolean),
          isOmnibus,
        }),
      })

      // 2. Remove deleted artists
      for (const artistId of removedArtistIds) {
        await authFetch(`/editions/${edition.slug}/artists/${artistId}`, { method: 'DELETE' })
      }

      // 3. Add new artists (those without `existing` flag)
      const artistIdByName = new Map<string, string>()
      for (const art of artists) {
        if (art.existing) continue
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
        onRemoveExistingArtist={id => setRemovedArtistIds(prev => new Set([...prev, id]))}
        features={features}
        onFeaturesChange={setFeatures}
        isOmnibus={isOmnibus}
        onIsOmnibusChange={setIsOmnibus}
        editionSlug={edition.slug}
        companies={companies}
        collections={collections}
      />

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
