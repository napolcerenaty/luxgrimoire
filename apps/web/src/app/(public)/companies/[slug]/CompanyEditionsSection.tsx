import { apiFetch } from '@/lib/api'
import type { ApiCompanyEdition } from '@luxgrimoire/shared-types'
import { CompanyBooksSection, type EditionGroup } from './CompanyBooksSection'

interface Subscription {
  id: string
  slug: string
  name: string
}

interface Props {
  companySlug: string
  subscriptions: Subscription[]
  brandColors?: string[] | null
}

export async function CompanyEditionsSection({ companySlug, subscriptions, brandColors }: Props) {
  const editions = await apiFetch<ApiCompanyEdition[]>(`/companies/${companySlug}/editions`)

  if (!editions || editions.length === 0) return null

  // Group editions by subscription → collection → standalone
  const bySubscription = new Map<string, EditionGroup>()
  const byCollection = new Map<string, EditionGroup>()
  const standalone: ApiCompanyEdition[] = []

  for (const edition of editions) {
    if (edition.subscriptionId) {
      const sub = subscriptions.find((s) => s.id === edition.subscriptionId)
      const key = edition.subscriptionId
      if (!bySubscription.has(key)) {
        bySubscription.set(key, {
          label: sub?.name ?? 'Subscription',
          href: sub ? `/subscriptions/${sub.slug}` : null,
          editions: [],
        })
      }
      bySubscription.get(key)!.editions.push(edition)
    } else if (edition.collection) {
      const key = edition.collection.id
      if (!byCollection.has(key)) {
        byCollection.set(key, {
          label: edition.collection.name,
          href: `/companies/${companySlug}/collections/${edition.collection.slug}`,
          editions: [],
        })
      }
      byCollection.get(key)!.editions.push(edition)
    } else {
      standalone.push(edition)
    }
  }

  const editionGroups: EditionGroup[] = []
  bySubscription.forEach((g) => editionGroups.push(g))
  byCollection.forEach((g) => editionGroups.push(g))
  if (standalone.length > 0) {
    editionGroups.push({ label: 'Exclusive Editions', href: null, editions: standalone })
  }

  // Re-order: Exclusive Editions first, then named collections, then subscription groups
  const orderedGroups: EditionGroup[] = [
    ...editionGroups.filter((g) => g.label === 'Exclusive Editions'),
    ...editionGroups.filter((g) => g.href?.includes('/collections/')),
    ...editionGroups.filter((g) => g.href?.includes('/subscriptions/')),
    ...editionGroups.filter((g) => !g.href && g.label !== 'Exclusive Editions'),
  ]

  return <CompanyBooksSection groups={orderedGroups} brandColors={brandColors} />
}
