import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About – LuxGrimoire',
  description: 'Learn about LuxGrimoire — a community-driven database for luxury book editions and subscription boxes.',
}

export default function AboutPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-4xl font-serif font-bold text-amber-400 mb-8 tracking-wide">About LuxGrimoire</h1>

      <div className="prose prose-invert prose-stone max-w-none space-y-6 text-stone-300 text-sm leading-relaxed">
        <p>
          LuxGrimoire is an independent, community-driven database for luxury special edition books and
          book subscription boxes. Our goal is to make it easy to discover, track, and compare the beautiful
          special editions produced by companies like Illumicrate, FairyLoot, Owlcrate, and many others.
        </p>

        <p>
          Whether you're a collector tracking your shelves, a reader deciding whether to subscribe to a new
          box, or just here to admire gorgeous book art — LuxGrimoire is built for you.
        </p>

        <h2 className="text-xl font-serif font-semibold text-stone-100 mt-8 mb-2">What we offer</h2>
        <ul className="list-disc list-inside space-y-1 text-stone-400">
          <li>Searchable database of luxury editions and subscription boxes</li>
          <li>Monthly theme and edition history for every subscription</li>
          <li>Personal collection & wishlist tracking</li>
          <li>Spending tracker and calendar view</li>
          <li>Sale announcements from box companies</li>
          <li>Community-submitted data and corrections</li>
        </ul>

        <h2 className="text-xl font-serif font-semibold text-stone-100 mt-8 mb-2">Disclaimer</h2>
        <p>
          LuxGrimoire is not affiliated with, endorsed by, or sponsored by any subscription box company
          unless explicitly marked as a Featured Partner (a paid sponsorship). All trademarks, cover images,
          and brand materials belong to their respective owners. We are a fan-made reference database.
        </p>

        <h2 className="text-xl font-serif font-semibold text-stone-100 mt-8 mb-2">Get involved</h2>
        <p>
          Found missing data? Want to help moderate?{' '}
          <Link href="/data-requests" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">
            Submit a data request
          </Link>{' '}
          or{' '}
          <Link href="/contact" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">
            get in touch
          </Link>.
        </p>
      </div>
    </div>
  )
}
