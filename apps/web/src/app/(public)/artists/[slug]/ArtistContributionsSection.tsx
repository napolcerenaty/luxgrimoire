import { apiFetch } from '@/lib/api'
import { ArtistTabs, type GroupedEdition } from './ArtistTabs'

interface Contribution {
  role: string
  edition: {
    id: string
    slug: string
    additionalImages: string[]
    bookBoxCompany: { name: string; brandColors?: string[] | null } | null
    communityPhotoCover?: string | null
  }
}

export async function ArtistContributionsSection({ artistSlug }: { artistSlug: string }) {
  const contributions = await apiFetch<Contribution[]>(`/artists/${artistSlug}/contributions`)

  const editionMap = new Map<string, GroupedEdition>()
  for (const c of contributions) {
    const existing = editionMap.get(c.edition.id)
    if (existing) {
      existing.roles.push(c.role)
    } else {
      editionMap.set(c.edition.id, { edition: c.edition, roles: [c.role] })
    }
  }
  const groupedEditions = Array.from(editionMap.values())

  return <ArtistTabs artistSlug={artistSlug} groupedEditions={groupedEditions} />
}
