import type { Metadata } from 'next'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { getPage } from '@/lib/ghost'
import BlogPostContent from '@/components/blog/BlogPostContent'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Companies & Permissions – LuxGrimoire',
  description: 'How LuxGrimoire displays official promotional materials from publishers and subscription companies, and which companies have granted permission.',
}

const CONTACT_EMAIL = 'contact@luxgrimoire.com'

/** Marker an editor types as its own paragraph in the Ghost body to control where the live
 * companies list renders. Same token is embedded at the equivalent spot in the fallback copy
 * below, so behaviour is identical whether or not the page has been migrated to Ghost yet. */
const COMPANIES_LIST_TOKEN = '[[COMPANIES_LIST]]'
const COMPANIES_LIST_PARAGRAPH_RE = new RegExp(
  `<p>\\s*${COMPANIES_LIST_TOKEN.replace(/[[\]]/g, '\\$&')}\\s*<\\/p>`,
  'i',
)

interface GrantedCompany {
  name: string
  slug: string
  website: string | null
}

function splitOnCompaniesListToken(html: string): { before: string; after: string; found: boolean } {
  const match = COMPANIES_LIST_PARAGRAPH_RE.exec(html)
  if (!match) return { before: html, after: '', found: false }
  return {
    before: html.slice(0, match.index),
    after: html.slice(match.index + match[0].length),
    found: true,
  }
}

async function getGrantedCompanies(): Promise<GrantedCompany[]> {
  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
  const companies = await fetch(`${base}/companies?pageSize=100`, { next: { revalidate: 300 } })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null) as { data?: { name: string; slug: string; website: string | null; hasOfficialImagePermission?: boolean }[] } | null

  return (companies?.data ?? [])
    .filter(c => c.hasOfficialImagePermission)
    .map(c => ({ name: c.name, slug: c.slug, website: c.website ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function GrantedCompaniesList({ companies }: { companies: GrantedCompany[] }) {
  if (companies.length === 0) {
    return (
      <p className="text-navy-500 text-sm italic">
        We&apos;re currently building relationships with publishers and subscription companies —
        this list will be updated as permissions are granted.
      </p>
    )
  }
  return (
    <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 not-prose">
      {companies.map(c => (
        <li key={c.slug}>
          {c.website ? (
            <a
              href={c.website}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-400 underline underline-offset-2 transition-colors"
            >
              {c.name}
              <ExternalLink size={12} className="shrink-0" />
            </a>
          ) : (
            <Link
              href={`/companies/${c.slug}`}
              className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-400 underline underline-offset-2 transition-colors"
            >
              {c.name}
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}

function GhostContentWithCompaniesList({ html, companies }: { html: string; companies: GrantedCompany[] }) {
  const { before, after, found } = splitOnCompaniesListToken(html)
  if (!found) return <BlogPostContent html={html} />
  return (
    <>
      <BlogPostContent html={before} />
      <GrantedCompaniesList companies={companies} />
      <BlogPostContent html={after} />
    </>
  )
}

export default async function CompaniesPermissionsPage() {
  const [ghostPage, companies] = await Promise.all([
    getPage('companies-permissions'),
    getGrantedCompanies(),
  ])

  if (ghostPage?.html) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-serif font-bold text-brand-400 mb-3 tracking-wide">
          {ghostPage.title}
        </h1>
        <GhostContentWithCompaniesList html={ghostPage.html} companies={companies} />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-serif font-bold text-brand-400 mb-3 tracking-wide">
        Companies &amp; Permissions
      </h1>

      <div className="prose prose-invert prose-stone max-w-none space-y-10 text-navy-300 leading-relaxed">

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">Official Promotional Materials</h2>
          <p>
            LuxGrimoire aims to showcase special editions while respecting the work of publishers,
            artists, and designers.
          </p>
          <p className="mt-2">
            Official promotional materials are displayed only with permission from the publisher,
            subscription company, or relevant rights-holder.
          </p>
          <p className="mt-2">
            Images remain the property of their respective rights-holders and are used solely for
            presenting books, subscriptions, and companies within LuxGrimoire.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">
            ✓ What does &ldquo;Images used with brand permission&rdquo; mean?
          </h2>
          <p>
            When you see this badge on a company or subscription page, it means that LuxGrimoire
            has received permission to display that company&apos;s official promotional materials.
          </p>
          <p className="mt-2">
            Permissions vary between companies, but generally include official promotional images,
            mock-ups, and other marketing materials used to present their editions.
          </p>
          <p className="mt-2">
            The permission badge does not mean that the company sponsors or endorses LuxGrimoire.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">Image Credits</h2>
          <p>
            Official promotional materials always include attribution where appropriate. Below an
            edition&apos;s photos, you may see:
          </p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li>
              📷 <strong>photo by @artist, @company</strong> — credits shown below the image. When a
              photographer or artist is credited by the company, their Instagram is included alongside
              the company&apos;s Instagram. If no photographer or artist is credited, only the
              company&apos;s Instagram is shown.
            </li>
            <li>
              <strong>courtesy of {'{'}Company Name{'}'}</strong> — identifies the company as the source
              of the official promotional material and links to its official website.
            </li>
          </ul>
          <p className="mt-3">
            Whenever available, credits are preserved and link back to their original source.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">User Submitted Photos</h2>
          <p>
            When official promotional materials aren&apos;t available for an edition, collectors can
            upload their own photograph of their physical copy.
          </p>
          <p className="mt-2">
            Every submitted image is reviewed before publication. These are always personal photos
            of a collector&apos;s own copy — they are never treated as official promotional material.
            Official promotional materials are added directly by the LuxGrimoire team once permission
            has been granted, following the process described above.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">Copyright &amp; Removal Requests</h2>
          <p>
            Respecting copyright is one of LuxGrimoire&apos;s core principles.
          </p>
          <p className="mt-2">
            If you represent a publisher, subscription company, artist, or rights-holder and believe
            any material should be removed or updated, please{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:text-brand-400 underline underline-offset-2">
              contact us
            </a>
            . Removal requests are handled as quickly as possible.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">Companies Granting Permission</h2>
          <p className="mb-4">
            The following companies have kindly granted LuxGrimoire permission to display their
            official promotional materials. This list is updated as new permissions are received.
          </p>
          <GrantedCompaniesList companies={companies} />
          <p className="mt-4 text-sm text-navy-500">
            Permissions are granted directly to LuxGrimoire and may be subject to conditions
            specified by each company or rights-holder.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">Contact</h2>
          <p>
            Representing a publisher, subscription company, or rights-holder? We&apos;d be happy to
            discuss how LuxGrimoire presents your official promotional materials.
          </p>
          <p className="mt-2">
            📧{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:text-brand-400 underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>

      </div>
    </div>
  )
}
