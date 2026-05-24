import { apiFetch } from '@/lib/api'
import type { ApiCompanyEdition } from '@luxgrimoire/shared-types'
import { CompanyBooksSection, type EditionGroup } from './CompanyBooksSection'

interface Subscription {
  id: string
  slug: string
  name: string
  isCombo: boolean
  isContentStream: boolean
  parentSubscriptionId: string | null
}

interface Props {
  companySlug: string
  subscriptions: Subscription[]
  brandColors?: string[] | null
}

export async function CompanyEditionsSection({ companySlug, subscriptions, brandColors }: Props) {
  const editions = await apiFetch<ApiCompanyEdition[]>(`/companies/${companySlug}/editions`)

  if (!editions || editions.length === 0) return null

  const individualSubs = subscriptions.filter(
    (s) => !s.isCombo && !s.isContentStream && !s.parentSubscriptionId,
  )
  const contentStreams = subscriptions.filter((s) => s.isContentStream)
  const individualSubIds = new Set(individualSubs.map((s) => s.id))
  const contentStreamIds = new Set(contentStreams.map((s) => s.id))

  const byIndividualSub = new Map<string, EditionGroup>()
  const byContentStream = new Map<string, EditionGroup>()
  const byCollection = new Map<string, EditionGroup>()
  const standalone: ApiCompanyEdition[] = []

  for (const edition of editions) {
    if (edition.subscriptionId && individualSubIds.has(edition.subscriptionId)) {
      const sub = individualSubs.find((s) => s.id === edition.subscriptionId)!
      if (!byIndividualSub.has(sub.id)) {
        byIndividualSub.set(sub.id, { label: sub.name, href: `/subscriptions/${sub.slug}`, editions: [] })
      }
      byIndividualSub.get(sub.id)!.editions.push(edition)
    } else if (edition.subscriptionId && contentStreamIds.has(edition.subscriptionId)) {
      const sub = contentStreams.find((s) => s.id === edition.subscriptionId)!
      if (!byContentStream.has(sub.id)) {
        byContentStream.set(sub.id, { label: sub.name, href: `/subscriptions/${sub.slug}`, editions: [] })
      }
      byContentStream.get(sub.id)!.editions.push(edition)
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
    } else if (!edition.subscriptionId) {
      standalone.push(edition)
    }
  }

  // Order: individual subs → content streams → collections → exclusive editions
  const orderedGroups: EditionGroup[] = [
    ...byIndividualSub.values(),
    ...byContentStream.values(),
    ...byCollection.values(),
    ...(standalone.length > 0 ? [{ label: 'Exclusive Editions', href: null, editions: standalone }] : []),
  ]

  return <CompanyBooksSection groups={orderedGroups} brandColors={brandColors} />
}
