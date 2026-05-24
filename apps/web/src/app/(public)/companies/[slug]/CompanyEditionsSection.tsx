import { CompanyBooksSection, type EditionGroup } from './CompanyBooksSection'

interface Subscription {
  id: string
  slug: string
  name: string
  isCombo: boolean
  isContentStream: boolean
  parentSubscriptionId: string | null
}

interface Collection {
  id: string
  slug: string
  name: string
}

interface Props {
  companySlug: string
  subscriptions: Subscription[]
  collections: Collection[]
  brandColors?: string[] | null
}

export function CompanyEditionsSection({ companySlug, subscriptions, collections, brandColors }: Props) {
  const individualSubs = subscriptions.filter(
    (s) => !s.isCombo && !s.isContentStream && !s.parentSubscriptionId,
  )
  const contentStreams = subscriptions.filter((s) => s.isContentStream)

  const groups: EditionGroup[] = [
    ...individualSubs.map((s) => ({
      label: s.name,
      href: `/subscriptions/${s.slug}`,
      fetchPath: `/companies/${companySlug}/editions?subscriptionId=${s.id}`,
    })),
    ...contentStreams.map((s) => ({
      label: s.name,
      href: `/subscriptions/${s.slug}`,
      fetchPath: `/companies/${companySlug}/editions?subscriptionId=${s.id}`,
    })),
    ...collections.map((c) => ({
      label: c.name,
      href: `/companies/${companySlug}/collections/${c.slug}`,
      fetchPath: `/companies/${companySlug}/editions?collectionId=${c.id}`,
    })),
  ]

  if (groups.length === 0) return null

  return <CompanyBooksSection groups={groups} brandColors={brandColors} />
}
