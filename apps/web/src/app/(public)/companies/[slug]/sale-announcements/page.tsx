import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import type { ApiBookBoxCompany } from '@luxgrimoire/shared-types'
import { CompanySaleAnnouncementsList } from '@/components/sales/CompanySaleAnnouncementsList'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const company = await apiFetch<ApiBookBoxCompany>(`/companies/${slug}`)
    return { title: `Sale Announcements — ${company.name}` }
  } catch {
    return { title: 'Company not found' }
  }
}

export default async function CompanySaleAnnouncementsPage({ params }: Props) {
  const { slug } = await params

  let company: ApiBookBoxCompany
  try {
    company = await apiFetch<ApiBookBoxCompany>(`/companies/${slug}`)
  } catch {
    notFound()
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <Link
        href={`/companies/${slug}`}
        className="text-xs text-stone-500 hover:text-amber-400 transition-colors mb-4 inline-block"
      >
        ← {company.name}
      </Link>
      <h1 className="text-3xl font-serif font-bold text-stone-100 mb-6">Sale Announcements</h1>
      <CompanySaleAnnouncementsList companyId={company.id} />
    </div>
  )
}
