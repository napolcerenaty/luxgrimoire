import type { AiParseResult, ArtistEntry } from '@/components/admin/EditionFieldsSection'

interface EditionSetters {
  setPublisher: (v: string) => void
  setPrice: (v: string) => void
  setCurrency: (v: string) => void
  setFirstAccessDate: (v: string) => void
  setEarlyAccessDate: (v: string) => void
  setGeneralSaleDate: (v: string) => void
  /** @deprecated Only used by Create form — edit form adds artists directly via feature-tags API */
  setFeatures?: (fn: (prev: string[]) => string[]) => void
  /** @deprecated Only used by Create form */
  setArtists?: (fn: (prev: ArtistEntry[]) => ArtistEntry[]) => void
}

export function applyAiEditionResult(r: AiParseResult, setters: EditionSetters): void {
  const e = r.edition
  if (!e) return
  if (e.publisher) setters.setPublisher(e.publisher)
  if (e.price != null) setters.setPrice(String(e.price))
  if (e.currency) setters.setCurrency(e.currency)
  if (e.firstAccessDate) setters.setFirstAccessDate(e.firstAccessDate)
  if (e.earlyAccessDate) setters.setEarlyAccessDate(e.earlyAccessDate)
  if (e.generalSaleDate) setters.setGeneralSaleDate(e.generalSaleDate)
  if (e.features?.length && setters.setFeatures) {
    setters.setFeatures(prev => Array.from(new Set([...prev, ...e.features!])))
  }
  if (e.artists?.length && setters.setArtists) {
    setters.setArtists(prev => {
      const normalize = (s: string) => s.toLowerCase().replace(/^@/, '')
      const existing = new Set(prev.map(a => `${normalize(a.name)}|${a.role.toLowerCase()}`))
      const toAdd = e.artists!.filter(a => !existing.has(`${normalize(a.name)}|${a.role.toLowerCase()}`))
      return [...prev, ...toAdd.map(a => ({ name: a.name, role: a.role }))]
    })
  }
}
