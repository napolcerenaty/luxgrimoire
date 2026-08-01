import type { AiParseResult, ArtistEntry, EditionSaleDateEntry } from '@/components/admin/EditionFieldsSection'

interface EditionSetters {
  setPublisher: (v: string) => void
  setPrice: (v: string) => void
  setCurrency: (v: string) => void
  setSaleDates: (fn: (prev: EditionSaleDateEntry[]) => EditionSaleDateEntry[]) => void
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
  if (e.saleDates?.length) {
    const parsed = e.saleDates
    setters.setSaleDates(prev => {
      const existing = new Set(prev.map(d => `${d.label.toLowerCase()}|${d.date}`))
      const toAdd = parsed.filter(d => !existing.has(`${d.label.toLowerCase()}|${d.date}`))
      return [...prev, ...toAdd.map((d, i) => ({ label: d.label, date: d.date, order: prev.length + i }))]
    })
  }
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
