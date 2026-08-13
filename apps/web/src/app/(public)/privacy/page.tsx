import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy – LuxGrimoire',
  description: 'Privacy Policy for LuxGrimoire — how we collect, use, and protect your personal data.',
}

const EFFECTIVE_DATE = 'May 1, 2025'
const CONTACT_EMAIL = 'contact@luxgrimoire.com'

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-serif font-bold text-brand-400 mb-3 tracking-wide">Privacy Policy</h1>
      <p className="text-navy-500 text-sm mb-12">Effective date: {EFFECTIVE_DATE}</p>

      <div className="prose prose-invert prose-stone max-w-none space-y-10 text-navy-300 leading-relaxed">

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">1. Who We Are</h2>
          <p>
            LuxGrimoire (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a community-driven database and
            tracking tool for luxury special edition books and book subscription boxes, available at{' '}
            <Link href="https://luxgrimoire.com" className="text-brand-500 hover:text-brand-400 underline underline-offset-2">
              luxgrimoire.com
            </Link>
            . We are the data controller for personal data processed through this service.
          </p>
          <p className="mt-2">
            For any privacy-related questions, please contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:text-brand-400 underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">2. Data We Collect</h2>
          <p>We collect only the data necessary to provide our service:</p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li><strong className="text-navy-300">Account data:</strong> email address, username, password (hashed — never stored in plain text).</li>
            <li><strong className="text-navy-300">Profile data:</strong> optional display name, avatar image.</li>
            <li><strong className="text-navy-300">Collection data:</strong> editions you mark as owned, wishlisted, or pre-ordered; prices you log.</li>
            <li><strong className="text-navy-300">User-generated content:</strong> images you upload (cover photos, edition artwork).</li>
            <li><strong className="text-navy-300">Interaction data:</strong> sale announcements you submit, feature requests, bug reports, contact messages.</li>
            <li><strong className="text-navy-300">Technical data:</strong> IP address, browser type, and access logs for security and abuse prevention.</li>
          </ul>
          <p className="mt-3">We do <strong>not</strong> collect payment data — we do not process payments.</p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">3. Legal Basis for Processing (GDPR)</h2>
          <p>If you are located in the European Economic Area, our legal bases for processing your data are:</p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li><strong className="text-navy-300">Contract performance (Art. 6(1)(b) GDPR):</strong> to create and maintain your account and provide the core service.</li>
            <li><strong className="text-navy-300">Legitimate interests (Art. 6(1)(f) GDPR):</strong> security, fraud prevention, and improving the service.</li>
            <li><strong className="text-navy-300">Consent (Art. 6(1)(a) GDPR):</strong> for optional features such as email notifications where you explicitly opt in.</li>
            <li><strong className="text-navy-300">Legal obligation (Art. 6(1)(c) GDPR):</strong> where required by applicable law.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">4. User-Uploaded Images</h2>
          <p>
            LuxGrimoire allows registered users to upload images (e.g. edition cover photos, company logos) to enrich
            the community database. By uploading an image, you represent and warrant that:
          </p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li>You are the author or rights-holder of the image, or you have obtained all necessary permissions to upload it.</li>
            <li>The image does not infringe the intellectual property rights, privacy rights, or any other rights of any third party.</li>
            <li>You grant LuxGrimoire a non-exclusive, worldwide, royalty-free licence to store, display, resize, and serve the image
                as part of the platform, including on edition detail pages and in promotional materials.</li>
            <li>You retain all ownership rights to images you upload.</li>
          </ul>
          <p className="mt-3">
            Uploaded images are stored on Cloudinary (see <Link href="#third-parties" className="text-brand-500 hover:text-brand-400 underline underline-offset-2">Section 6</Link>).
            You can request deletion of your uploaded images at any time via <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:text-brand-400 underline underline-offset-2">{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">5. How We Use Your Data</h2>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li>To create, authenticate, and maintain your account.</li>
            <li>To provide collection tracking, spending reports, calendars, and wishlist features.</li>
            <li>To send transactional emails (email verification, password reset) via Brevo.</li>
            <li>To send optional notification emails you subscribe to.</li>
            <li>To display user-uploaded images as part of the community database.</li>
            <li>To detect, prevent, and investigate abuse and security incidents.</li>
            <li>To improve the platform&rsquo;s features and performance (using aggregated analytics).</li>
          </ul>
          <p className="mt-3">We do <strong>not</strong> sell, rent, or share your personal data with third parties for marketing purposes.</p>
        </section>

        <section id="third-parties">
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">6. Third-Party Services</h2>
          <p>We use the following third-party processors:</p>
          <div className="mt-3 space-y-3">
            <div className="border border-navy-700 rounded-lg p-4">
              <p className="font-semibold text-navy-200">Cloudinary</p>
              <p className="text-sm text-navy-400 mt-1">Image storage and delivery (CDN). Images you upload are stored on Cloudinary servers. See their <a href="https://cloudinary.com/privacy" className="text-brand-500 hover:text-brand-400 underline underline-offset-2" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
            </div>
            <div className="border border-navy-700 rounded-lg p-4">
              <p className="font-semibold text-navy-200">Brevo (Sendinblue)</p>
              <p className="text-sm text-navy-400 mt-1">Transactional email delivery. Your email address is passed to Brevo solely to deliver emails you request. See their <a href="https://www.brevo.com/legal/privacypolicy/" className="text-brand-500 hover:text-brand-400 underline underline-offset-2" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
            </div>
            <div className="border border-navy-700 rounded-lg p-4">
              <p className="font-semibold text-navy-200">Hetzner Online GmbH</p>
              <p className="text-sm text-navy-400 mt-1">Our hosting provider. Servers are located in the European Union. See their <a href="https://www.hetzner.com/legal/privacy-policy" className="text-brand-500 hover:text-brand-400 underline underline-offset-2" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
            </div>
          </div>
          <p className="mt-3">All processors have signed Data Processing Agreements (DPAs) in compliance with GDPR.</p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">7. Data Retention</h2>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li><strong className="text-navy-300">Account data:</strong> retained for the duration of your account. You can delete your account immediately at any time from your Profile settings — this permanently removes your personal data. You may also request deletion by contacting us.</li>
            <li><strong className="text-navy-300">Collection data:</strong> deleted with your account or upon specific request.</li>
            <li><strong className="text-navy-300">Uploaded images:</strong> retained until you or an administrator removes them.</li>
            <li><strong className="text-navy-300">Server logs:</strong> retained for up to 90 days for security purposes.</li>
            <li><strong className="text-navy-300">Audit logs:</strong> retained for up to 2 years for security and accountability purposes.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">7a. Anonymous Aggregate Statistics</h2>
          <p>
            When users record marketplace sales on LuxGrimoire, an anonymized copy of the sale price (converted to
            EUR at the transaction date) is stored separately for the purpose of computing community resale statistics
            (e.g. average, median, min, and max resale prices for a given edition). This anonymized record contains
            only the edition identifier, the price in EUR, and the sale date — <strong>no personally identifiable
            information is stored</strong>, and there is no link to your account or the original sale record.
          </p>
          <p className="mt-3">
            Because this data is fully anonymous, it is <strong>retained even after account deletion</strong>. It
            cannot be attributed to any individual and therefore falls outside the scope of the right to erasure
            under GDPR (Art. 17). These anonymized statistics help the community understand market values for
            special edition books.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">8. Your Rights (GDPR)</h2>
          <p>If you are in the EEA, you have the following rights:</p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li><strong className="text-navy-300">Access:</strong> request a copy of the personal data we hold about you.</li>
            <li><strong className="text-navy-300">Rectification:</strong> request correction of inaccurate data.</li>
            <li><strong className="text-navy-300">Erasure:</strong> request deletion of your data (&ldquo;right to be forgotten&rdquo;).</li>
            <li><strong className="text-navy-300">Restriction:</strong> request that we limit how we process your data.</li>
            <li><strong className="text-navy-300">Portability:</strong> request a machine-readable export of your data.</li>
            <li><strong className="text-navy-300">Objection:</strong> object to processing based on legitimate interests.</li>
            <li><strong className="text-navy-300">Withdraw consent:</strong> where processing is based on consent, withdraw it at any time.</li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:text-brand-400 underline underline-offset-2">{CONTACT_EMAIL}</a>.
            We will respond within 30 days. You also have the right to lodge a complaint with your local data protection authority.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">9. Cookies & Local Storage</h2>
          <p>LuxGrimoire uses minimal browser storage:</p>
          <ul className="list-disc list-inside mt-3 space-y-1.5 text-navy-400">
            <li><strong className="text-navy-300">Authentication token:</strong> stored in browser local storage to keep you logged in. Expires after 7 days of inactivity.</li>
            <li>We do <strong className="text-navy-300">not</strong> use advertising cookies or third-party tracking scripts.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">10. Security</h2>
          <p>
            We implement appropriate technical and organisational measures to protect your data, including encrypted
            connections (HTTPS), hashed passwords (bcrypt), rate limiting, and access control. However, no system
            is completely secure; please use a strong, unique password for your account.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">11. Children</h2>
          <p>
            LuxGrimoire is not directed at children under the age of 13. We do not knowingly collect personal data
            from children under 13. If you believe we have inadvertently collected such data, please contact us
            immediately.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify registered users of significant
            changes by email. Continued use of the service after the effective date constitutes acceptance of the
            updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-serif font-semibold text-navy-100 mb-3">13. Contact</h2>
          <p>
            For any privacy concerns or data requests, contact:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:text-brand-400 underline underline-offset-2">{CONTACT_EMAIL}</a>
          </p>
        </section>

      </div>
    </div>
  )
}
