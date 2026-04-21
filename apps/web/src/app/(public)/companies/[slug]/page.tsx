import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import type { ApiBookBoxCompany } from '@luxgrimoire/shared-types'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const company = await apiFetch<ApiBookBoxCompany>(`/companies/${slug}`)
    return {
      title: company.name,
      description: company.description ?? `${company.name} subscription boxes on LuxGrimoire`,
      openGraph: {
        title: company.name,
        description: company.description ?? undefined,
      },
    }
  } catch {
    return { title: 'Company not found' }
  }
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params

  let company: ApiBookBoxCompany
  try {
    company = await apiFetch<ApiBookBoxCompany>(`/companies/${slug}`)
  } catch {
    notFound()
  }

  const logoUrl = cloudinaryUrl(company.logoUrl, 'w_200,h_200,c_fill,q_auto,f_auto')
  const subscriptions = company.subscriptions ?? []
  const hasActiveSponsored = company.sponsoredSlots?.some((s) => s.isActive) ?? false
  const hasBanner = company.sponsoredSlots?.some(
    (s) => s.isActive && s.type === 'COMPANY_PAGE_BANNER',
  ) ?? false

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: company.name,
    description: company.description,
    ...(company.website ? { url: company.website } : {}),
    ...(logoUrl ? { logo: logoUrl } : {}),
    ...(company.country ? { address: { '@type': 'PostalAddress', addressCountry: company.country } } : {}),
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Featured Partner banner */}
      {hasBanner && (
        <div className="mb-8 rounded-2xl overflow-hidden bg-gradient-to-r from-amber-900/40 via-amber-800/20 to-stone-900 border border-amber-700/40 px-6 py-4 flex items-center gap-3">
          <span className="text-amber-400 text-lg">✦</span>
          <div>
            <p className="text-xs text-amber-400/70 uppercase tracking-widest font-semibold mb-0.5">
              Featured Partner
            </p>
            <p className="text-stone-200 font-serif font-semibold text-base">{company.name}</p>
          </div>
        </div>
      )}

      {/* Company header */}
      <div className="flex flex-col sm:flex-row gap-8 items-start mb-12">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={company.name}
            className="w-24 h-24 rounded-xl object-cover shadow-lg ring-2 ring-amber-700/30 shrink-0"
          />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <p className="text-xs text-amber-600 uppercase tracking-widest font-medium">Company</p>
            {hasActiveSponsored && (
              <Badge variant="warning">✦ Featured Partner</Badge>
            )}
          </div>
          <h1 className="text-4xl font-serif font-bold text-stone-100 mb-3">{company.name}</h1>

          <div className="flex flex-wrap items-center gap-4 mb-4">
            {company.country && (
              <span className="text-sm text-stone-400">{company.country}</span>
            )}
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-amber-500 hover:text-amber-400 transition-colors hover:underline"
              >
                {company.website.replace(/^https?:\/\//, '')} ↗
              </a>
            )}
          </div>

          {company.description && (
            <p className="text-stone-300 leading-relaxed max-w-2xl">{company.description}</p>
          )}
        </div>
      </div>

      {/* Subscriptions */}
      {subscriptions.length > 0 && (
        <section>
          <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">
            Subscriptions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {subscriptions.map((sub) => {
              const cover = cloudinaryUrl(sub.coverImage, 'w_600,h_400,c_fill,q_auto,f_auto')
              return (
                <Link
                  key={sub.id}
                  href={`/subscriptions/${sub.slug}`}
                  className="group rounded-xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors"
                >
                  <div className="aspect-[3/2] overflow-hidden bg-stone-800">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt={sub.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-600 text-sm">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {sub.genre && <Badge variant="outline">{sub.genre}</Badge>}
                      {sub.isDiscontinued && <Badge variant="destructive">Discontinued</Badge>}
                    </div>
                    <h3 className="font-serif font-semibold text-stone-100 group-hover:text-amber-400 transition-colors">
                      {sub.name}
                    </h3>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {subscriptions.length === 0 && (
        <p className="text-stone-500 text-sm">No subscriptions found for this company.</p>
      )}
    </div>
  )
}
