import type { Metadata } from 'next'
import Link from 'next/link'
import { getPage } from '@/lib/ghost'
import BlogPostContent from '@/components/blog/BlogPostContent'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Terms of Use – LuxGrimoire',
  description: 'Terms of Use for LuxGrimoire — rules governing use of the platform.',
}

const EFFECTIVE_DATE = 'May 1, 2025'
const CONTACT_EMAIL = 'contact@luxgrimoire.com'

function formatEffectiveDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function TermsPage() {
  // Once the Terms are published as a Ghost Page (slug "terms-of-use"), that becomes the
  // source of truth — its updated_at is the version used for re-consent enforcement, and
  // custom_excerpt is the "what changed" summary shown on /consent. Until then, fall back
  // to the hardcoded copy below (same pattern as the FAQ page).
  const ghostPage = await getPage('terms-of-use')

  if (ghostPage?.html) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-serif font-bold text-brand-400 mb-3 tracking-wide">{ghostPage.title}</h1>
        <p className="text-navy-500 text-sm mb-12">Effective date: {formatEffectiveDate(ghostPage.updated_at)}</p>
        <BlogPostContent html={ghostPage.html} />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-serif font-bold text-brand-400 mb-3 tracking-wide">Terms of Use</h1>
      <p className="text-navy-500 text-sm mb-12">Effective date: {EFFECTIVE_DATE}</p>

      <div className="prose prose-invert prose-stone max-w-none space-y-10 text-navy-300 leading-relaxed">

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">1. Acceptance of Terms</h2>
          <p>
            By accessing or using LuxGrimoire (&ldquo;the Service&rdquo;) at{' '}
            <Link href="https://luxgrimoire.com" className="text-brand-500 hover:text-brand-400 underline underline-offset-2">
              luxgrimoire.com
            </Link>
            , you agree to be bound by these Terms of Use. If you do not agree, do not use the Service.
          </p>
          <p className="mt-2">
            These Terms apply to all visitors, registered users, and contributors. For questions, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:text-brand-400 underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">2. Description of Service</h2>
          <p>
            LuxGrimoire is a community-driven database and personal tracker for luxury special edition books and book
            subscription boxes. The Service allows users to browse a publicly-contributed database, manage personal
            collections, track spending, follow upcoming sale announcements, and contribute data.
          </p>
          <p className="mt-2">
            LuxGrimoire is an independent project and is not affiliated with, endorsed by, or sponsored by any
            book publisher, subscription box company, or book-related brand, unless explicitly stated in a labeled
            sponsored partnership.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">3. Eligibility</h2>
          <p>
            You must be at least 13 years old to use the Service. By creating an account, you confirm that you
            meet this minimum age requirement. If you are under 18, you should review these Terms with a parent
            or guardian.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">4. User Accounts</h2>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>You must provide accurate, current, and complete information when creating your account.</li>
            <li>You may not share your account with others or create accounts on behalf of others without authorisation.</li>
            <li>You must notify us immediately at <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:text-brand-400 underline underline-offset-2">{CONTACT_EMAIL}</a> of any unauthorised use of your account.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">5. User-Generated Content</h2>
          <p>
            Users may contribute content to LuxGrimoire, including database entries, sale announcements, and images.
            By contributing content, you agree that:
          </p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li>Your content is accurate to the best of your knowledge.</li>
            <li>You have the right to contribute the content and it does not violate any law or third-party rights.</li>
            <li>You grant LuxGrimoire a non-exclusive, worldwide, royalty-free licence to display, distribute, and
                modify the content as part of the platform.</li>
            <li>Contributed database content (book titles, edition details, company information) may be accessible
                to all users of the platform.</li>
            <li>By submitting marketplace or collection data, you grant LuxGrimoire the right to use aggregated
                and anonymized data for analytics, valuation insights, and platform statistics. This data is
                retained in anonymized form even after account deletion.</li>
          </ul>
          <p className="mt-3">
            We reserve the right to remove any content that violates these Terms, at our sole discretion.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">6. Image Uploads</h2>
          <p>
            You may upload images (e.g. edition cover photos) to enrich the community database. By uploading
            an image, you confirm that:
          </p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li>You are the author or original photographer, or you have obtained explicit permission from the
                rights-holder to upload the image.</li>
            <li>You are not uploading images that infringe copyright, are protected by digital rights management
                (DRM), or are obtained in violation of any terms of service.</li>
            <li>You understand that publisher cover art, promotional photos, and other commercially-produced images
                may be protected by copyright. Upload only images for which you hold rights or have authorisation.</li>
            <li>You grant LuxGrimoire a non-exclusive, worldwide, royalty-free licence to store, display, resize,
                and serve the image as part of the platform.</li>
            <li>You retain ownership of images you upload. You may request their removal at any time.</li>
          </ul>
          <p className="mt-3">
            LuxGrimoire will respond promptly to valid copyright takedown notices. See Section 11 (DMCA / Copyright)
            for details.
          </p>

          <h3 className="text-base font-semibold text-navy-200 mt-6 mb-2">6a. Community Edition Photos</h3>
          <p>
            For editions that do not have official imagery, logged-in users may submit a community photo of their
            own physical copy. By submitting a community photo you explicitly confirm all of the following:
          </p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li>The photo is your own original work and you are its author.</li>
            <li>You grant LuxGrimoire a non-exclusive, worldwide, royalty-free licence to display the photo
                within the platform for as long as it remains published.</li>
            <li>You acknowledge and accept that your community photo may be removed from the platform at any time,
                for any reason or no reason, without prior notice. No compensation or explanation will be provided
                upon removal.</li>
            <li>You understand that if official imagery for the edition becomes available, your community photo will
                be replaced and permanently deleted from the platform and from our image storage.</li>
          </ul>
          <p className="mt-3">
            Only one community photo submission is permitted per edition at any given time. The first user to submit
            locks the slot; the slot reopens only when an admin removes the existing community photo.
            Attempting to circumvent this restriction (e.g. by creating multiple accounts) is a violation of Section 7
            (Prohibited Conduct) and may result in account termination.
          </p>

          <h3 className="text-base font-semibold text-navy-200 mt-6 mb-2">6b. Official Brand &amp; Promotional Imagery</h3>
          <p>
            Where a company or subscription page displays official promotional materials, LuxGrimoire has
            received permission from the relevant company or rights-holder to use them, as indicated by a
            &ldquo;✓ Images used with brand permission&rdquo; badge. This badge does not
            mean that the company sponsors, endorses, or is otherwise affiliated with LuxGrimoire — see
            Section 2. Full details on how and why materials are used this way, including image credits and
            how to request removal, are available on our{' '}
            <Link href="/companies-permissions" className="text-brand-500 hover:text-brand-400 underline underline-offset-2">
              Companies &amp; Permissions
            </Link>{' '}
            page.
          </p>
          <p className="mt-3">
            Permission to use a company&apos;s official materials may be revoked by that company at any time. When
            this happens, the affected images are removed from the platform without prior notice.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">7. Prohibited Conduct</h2>
          <p>You agree not to:</p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li>Upload, post, or submit false, misleading, or inaccurate information.</li>
            <li>Upload infringing, defamatory, obscene, or otherwise unlawful content.</li>
            <li>Attempt to access, probe, or test the security of the Service without authorisation.</li>
            <li>Use automated tools (bots, scrapers) to collect data from the Service without prior written permission.</li>
            <li>Impersonate any person, company, or entity.</li>
            <li>Interfere with or disrupt the Service or its infrastructure.</li>
            <li>Use the Service for any commercial purpose without our prior written consent.</li>
            <li>Create multiple accounts to circumvent bans or restrictions.</li>
          </ul>
          <p className="mt-3">
            Violation of these rules may result in immediate account suspension or termination.
          </p>
        </section>


        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">8. Intellectual Property</h2>
          <p>
            The LuxGrimoire name, logo, design, and original code are the intellectual property of LuxGrimoire
            and its creators. You may not reproduce, distribute, or create derivative works from them without
            written permission.
          </p>
          <p className="mt-2">
            Book titles, author names, company names, and edition descriptions referenced in the database are
            the property of their respective rights-holders and are used for identification and informational
            purposes only.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">9. Disclaimers</h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, express or
            implied. We do not warrant that:
          </p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li>Database information is complete, accurate, or up to date.</li>
            <li>The Service will be uninterrupted or error-free.</li>
            <li>Prices, availability, or sale dates of any featured edition or subscription are accurate.</li>
          </ul>
          <p className="mt-3">
            Always verify purchase information directly with the relevant publisher or subscription box company.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">10. DMCA / Copyright Takedown</h2>
          <p>
            If you believe that content on LuxGrimoire infringes your copyright, please send a takedown notice to{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:text-brand-400 underline underline-offset-2">{CONTACT_EMAIL}</a> including:
          </p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li>A description of the copyrighted work you believe has been infringed.</li>
            <li>The URL or location of the allegedly infringing content on our platform.</li>
            <li>Your contact information (name, email address).</li>
            <li>A statement that you have a good faith belief that the use is not authorised by the rights-holder.</li>
            <li>A statement that the information in your notice is accurate, under penalty of perjury.</li>
          </ul>
          <p className="mt-3">
            We will respond to valid notices promptly and remove infringing content as required.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">11. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, LuxGrimoire and its contributors shall not be
            liable for any indirect, incidental, special, or consequential damages arising from use of or
            inability to use the Service, including loss of data or profits.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">12. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the European Union and the Republic of Poland, without regard
            to conflict of law principles. Any disputes shall be subject to the exclusive jurisdiction of the
            courts of Poland.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">13. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. When we make a material change, registered users will be
            shown a summary of what changed and asked to review and accept the updated Terms the next time they log
            in — access to the Service is paused until you do. If you do not accept, you will not be able to
            continue using the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">14. Contact</h2>
          <p>
            Questions about these Terms:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:text-brand-400 underline underline-offset-2">{CONTACT_EMAIL}</a>
          </p>
        </section>

      </div>
    </div>
  )
}
