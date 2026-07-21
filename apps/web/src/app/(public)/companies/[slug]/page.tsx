import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'

import { Badge } from '@/components/ui/Badge'
import type { ApiBookBoxCompany } from '@luxgrimoire/shared-types'
import { SubCoverImage } from '@/components/subscriptions/SubCoverImage'
import { CompanyEditionsSection } from './CompanyEditionsSection'
import { CompanySaleAnnouncementsSection } from '@/components/sales/CompanySaleAnnouncementsSection'

// Minimal inline SVG icons for social platforms
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.78a4.85 4.85 0 01-1.01-.09z" />
    </svg>
  )
}

function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.452-1.768.94-.980 1.443-2.405 1.443-4.101 0-1.715-.507-3.145-1.469-4.131-.505-.518-1.109-.882-1.764-1.073.13 1.08.114 2.157-.055 3.153-.291 1.681-1.056 2.97-2.252 3.764-1.037.685-2.36.994-3.935.916-1.302-.064-2.477-.444-3.403-1.1-.986-.695-1.613-1.72-1.77-2.88-.14-1.02.115-2.01.724-2.87.62-.88 1.558-1.54 2.76-1.965 1.131-.4 2.43-.575 3.857-.519.596.024 1.162.075 1.695.148-.028-.352-.094-.679-.199-.977-.352-1.006-1.186-1.529-2.479-1.529-1.085 0-2.098.416-2.855 1.172l-1.44-1.44C8.5 4.72 10.007 4.029 11.76 4.029c1.94 0 3.453.72 4.37 2.083.617.925.93 2.115.93 3.536 0 .109-.002.217-.007.325.84.283 1.607.739 2.275 1.347 1.374 1.27 2.096 3.113 2.096 5.326 0 2.338-.697 4.236-2.014 5.491C18.11 23.3 15.5 24 12.186 24z" />
    </svg>
  )
}

function BlueskyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 01-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.299-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
    </svg>
  )
}

interface Props {
  params: Promise<{ slug: string }>
}

function EditionsSkeleton() {
  return (
    <section className="mt-12">
      <div className="h-7 w-24 bg-stone-800 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] bg-stone-800 rounded-lg animate-pulse" />
        ))}
      </div>
    </section>
  )
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

  const logoUrl = cloudinaryUrl(company.logoUrl, 'w_400,h_200,c_fit,q_auto,f_auto')
  const subscriptions = company.subscriptions ?? []
  const displaySubscriptions = subscriptions.filter((s) => !s.isContentStream)
  // Backend already returns these sorted active→upcoming→discontinued, but partition explicitly
  // here rather than relying on that order — the three sections render very differently.
  const activeSubscriptions = displaySubscriptions.filter((s) => !s.isDiscontinued && !s.isUpcoming)
  const upcomingSubscriptions = displaySubscriptions.filter((s) => !s.isDiscontinued && s.isUpcoming)
  const discontinuedSubscriptions = displaySubscriptions.filter((s) => s.isDiscontinued)

  const socials = [
    company.website
      ? { label: 'Website', href: company.website, icon: 'website' as const }
      : null,
    company.instagram
      ? { label: 'Instagram', href: `https://instagram.com/${company.instagram.replace(/^@/, '')}`, icon: 'instagram' as const }
      : null,
    company.facebook
      ? { label: 'Facebook', href: company.facebook.startsWith('http') ? company.facebook : `https://facebook.com/${company.facebook}`, icon: 'facebook' as const }
      : null,
    company.x
      ? { label: 'X / Twitter', href: `https://x.com/${company.x.replace(/^@/, '')}`, icon: 'x' as const }
      : null,
    company.tiktok
      ? { label: 'TikTok', href: `https://tiktok.com/@${company.tiktok.replace(/^@/, '')}`, icon: 'tiktok' as const }
      : null,
    company.threads
      ? { label: 'Threads', href: `https://threads.net/@${company.threads.replace(/^@/, '')}`, icon: 'threads' as const }
      : null,
    company.bluesky
      ? { label: 'Bluesky', href: `https://bsky.app/profile/${company.bluesky.replace(/^@/, '')}`, icon: 'bluesky' as const }
      : null,
  ].filter(Boolean) as { label: string; href: string; icon: 'website' | 'instagram' | 'facebook' | 'x' | 'tiktok' | 'threads' | 'bluesky' }[]

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
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />


      {/* Company header: logo+links left, info right */}
      <div className="flex flex-col sm:flex-row gap-8 items-start mb-12">
        {/* Left column: logo + social links */}
        <div className="shrink-0 flex flex-col items-start gap-4">
          {logoUrl && (
            <div className="w-44 h-24 rounded-xl bg-white/5 border border-stone-700/40 flex items-center justify-center overflow-hidden p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={company.name} className="w-full h-full object-contain" />
            </div>
          )}

          {/* Social links as a column */}
          {socials.length > 0 && (
            <div className="flex flex-col gap-1.5 w-44">
              {socials.map((s) => (
                <a
                  key={s.icon}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.label}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-amber-600/50 text-stone-300 hover:text-amber-400 transition-colors text-xs font-medium"
                >
                  {s.icon === 'instagram' && <InstagramIcon className="w-3.5 h-3.5 shrink-0" />}
                  {s.icon === 'facebook' && <FacebookIcon className="w-3.5 h-3.5 shrink-0" />}
                  {s.icon === 'x' && <XIcon className="w-3.5 h-3.5 shrink-0" />}
                  {s.icon === 'tiktok' && <TikTokIcon className="w-3.5 h-3.5 shrink-0" />}
                  {s.icon === 'threads' && <ThreadsIcon className="w-3.5 h-3.5 shrink-0" />}
                  {s.icon === 'bluesky' && <BlueskyIcon className="w-3.5 h-3.5 shrink-0" />}
                  {s.icon === 'website' && (
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                    </svg>
                  )}
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Right column: company info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <p className="text-xs text-amber-600 uppercase tracking-widest font-medium">Company</p>
            {company.hasOfficialImagePermission && (
              <Badge variant="outline">✓ Images used with brand permission</Badge>
            )}
          </div>
          <h1 className="text-4xl font-serif font-bold text-stone-100 mb-3">{company.name}</h1>
          {company.country && (
            <span className="text-sm text-stone-400 mb-3 block">{company.country}</span>
          )}
          {company.description && (
            <p className="text-stone-300 leading-relaxed max-w-2xl">{company.description}</p>
          )}
        </div>
      </div>

      {/* Below the header: main column (subscriptions, editions) + a sticky rail on desktop
          (next-sale countdown, latest announcements) so browsing content and glanceable content
          don't have to compete for the same single scrolling column. Collapses to one column
          on mobile, where a sticky rail wouldn't make sense anyway. */}
      <div className="flex flex-col lg:flex-row gap-8 items-start mt-12">
      <div className="flex-1 min-w-0 order-2 lg:order-1">

      {/* Subscriptions — grouped active/upcoming/discontinued instead of one mixed grid */}
      {displaySubscriptions.length > 0 && (
        <section>
          <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">Subscriptions</h2>
          {activeSubscriptions.length === 0 && upcomingSubscriptions.length === 0 && (
            <p className="text-stone-500 text-sm mb-4">No active subscriptions right now.</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...activeSubscriptions, ...upcomingSubscriptions].map((sub) => {
              const cover = cloudinaryUrl(sub.coverImage ?? sub.logoUrl, 'w_600,q_auto,f_auto')
              const subGenres = [
                ...(Array.isArray((sub as any).genres) ? (sub as any).genres : []),
                ...(sub.genre ? [sub.genre] : []),
              ].filter((g: string, i: number, arr: string[]) => arr.indexOf(g) === i)
              return (
                <Link
                  key={sub.id}
                  href={`/subscriptions/${sub.slug}`}
                  className={`group rounded-xl overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-700/50 transition-colors ${sub.isUpcoming ? 'edition-glow-amber' : ''}`}
                >
                  <SubCoverImage coverUrl={cover} name={sub.name} brandColors={company.brandColors} />
                  <div className="p-3">
                    <h3 className="font-serif text-sm font-semibold text-stone-100 group-hover:text-amber-400 transition-colors leading-tight mb-1">
                      {sub.name}
                    </h3>
                    <div className="flex items-center gap-1 flex-wrap">
                      {subGenres.slice(0, 2).map((g: string) => <Badge key={g} variant="outline">{g}</Badge>)}
                      {sub.isUpcoming && <Badge variant="outline">🔔 Upcoming</Badge>}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Discontinued — a much smaller secondary line, not full cards, since it's not
              actionable for someone deciding what to follow. */}
          {discontinuedSubscriptions.length > 0 && (
            <div className="mt-5 pt-4 border-t border-stone-800/60">
              <p className="text-xs text-stone-500 mb-2">Discontinued</p>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {discontinuedSubscriptions.map((sub) => {
                  const logo = cloudinaryUrl(sub.logoUrl, 'w_64,h_64,c_fit,q_auto,f_auto')
                  return (
                    <Link
                      key={sub.id}
                      href={`/subscriptions/${sub.slug}`}
                      className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-300 transition-colors"
                    >
                      {logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" className="w-4 h-4 rounded object-contain bg-stone-900" />
                      )}
                      <span className="underline decoration-stone-700 underline-offset-2">{sub.name}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Books with tabs, search, load-more — streams in via Suspense */}
      <Suspense fallback={<EditionsSkeleton />}>
        <CompanyEditionsSection
          companySlug={slug}
          subscriptions={subscriptions.map((s) => ({ id: s.id, slug: s.slug, name: s.name, isCombo: s.isCombo, isContentStream: s.isContentStream, parentSubscriptionId: s.parentSubscriptionId ?? null }))}
          collections={(company.collections ?? []).map((c) => ({ id: c.id, slug: c.slug, name: c.name }))}
          brandColors={company.brandColors}
        />
      </Suspense>

      </div>

      {/* Sticky rail — next-sale countdown + latest announcements. A client component that
          fetches independently on mount, so it never blocks the header/subscriptions render
          above, and (unlike the public, shared-cache company payload) can be personalized. */}
      <div className="w-full lg:w-80 shrink-0 order-1 lg:order-2 lg:sticky lg:top-6">
        <CompanySaleAnnouncementsSection companyId={company.id} companySlug={slug} />
      </div>

      </div>
    </div>
  )
}
