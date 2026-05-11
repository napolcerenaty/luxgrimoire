import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

export const metadata: Metadata = {
  title: 'FAQ – LuxGrimoire',
  description: 'Frequently asked questions about LuxGrimoire — the community database for luxury book editions and subscription boxes.',
}

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'What is LuxGrimoire?',
    a: 'LuxGrimoire is a community-driven database and tracking tool for luxury special edition books and book subscription boxes. You can browse editions, track what you own, follow upcoming sales, and discover new subscription boxes.',
  },
  {
    q: 'Is LuxGrimoire free to use?',
    a: <>Yes — browsing, searching, and adding data is completely free. Creating an account unlocks personal features like collection tracking, spending reports, and calendars. The hosting and infrastructure costs are covered personally by the creator. If you&apos;d like to support the project, visit our <Link href="/support" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">Support Us</Link> page.</>,
  },
  {
    q: 'How do I add a missing book or edition?',
    a: 'Head to the Request / Add Data page. You can submit details about a missing book, edition, or subscription box and our team (or community moderators) will review and add it.',
  },
  {
    q: 'How do I report a sale announcement?',
    a: 'Use the "Report a Sale" link in the Community section of the footer, or the Sale Announcement Requests page. You can paste details, links, or screenshots and we\'ll add the announcement.',
  },
  {
    q: 'What are Subscription Boxes?',
    a: 'Subscription boxes (like Illumicrate, FairyLoot, Owlcrate, and many others) are monthly curated packages that include a special edition book along with bookish merchandise. LuxGrimoire tracks what editions each box has included over the years.',
  },
  {
    q: 'What is "Collection Tracking"?',
    a: 'Once you create an account you can mark editions as owned, on your wishlist, or pre-ordered. Your personal collection is private by default and accessible from the Collection page.',
  },
  {
    q: 'What is the Spending Tracker?',
    a: 'The Spending Tracker lets you log the price you paid for each edition and gives you a summary of your spending per month, year, or subscription box.',
  },
  {
    q: 'Do I have to add every subscription book manually?',
    a: 'No — when you add a subscription to your collection you can use the Backfill feature to automatically import all books from that subscription going as far back as you joined. We know this can mean years of history, so we built it to save you that work. That said, please review the imported data: because we don\'t have access to your original invoices or historical pricing, backfill uses the current subscription price and standard renewal dates. If the amounts or dates don\'t match your actual payments, you can edit them afterwards.',
  },
  {
    q: 'How do I change the start date of my subscription?',
    a: 'There is no edit option for the start date once a subscription has been added. To correct it, remove the subscription from your list and add it again with the correct start date.',
  },
  {
    q: 'I found incorrect data. How do I report it?',
    a: 'Use the "Report Abuse / DMCA" page (linked in the footer) and select "Incorrect data". Describe the issue and we\'ll investigate and correct it.',
  },
  {
    q: 'Can I become a moderator or contributor?',
    a: 'Send us a message via the Contact page! We\'re always looking for passionate book lovers who want to help keep the database accurate and up to date.',
  },
  {
    q: 'Can I upload a photo for an edition?',
    a: 'Yes — for editions that do not yet have an official cover image, any logged-in user can submit a community photo. The slot is available as long as no other community photo exists for that edition: the first user to submit locks the slot. The slot reopens only if an admin removes the existing community photo. When submitting you must confirm that the photo is yours and that you grant LuxGrimoire permission to display it.',
  },
  {
    q: 'What happens after I submit a community photo?',
    a: 'Your photo goes through admin review before it appears publicly. While pending it shows an "⏳ Awaiting review" badge. Once approved by an admin it becomes visible on the edition page. Community photos can be removed from the platform at any time, for any reason or no reason, without prior notice — by accepting the terms on upload you acknowledge this.',
  },
  {
    q: 'Why can only one user upload a community photo per edition?',
    a: 'Community photos are a stopgap for editions where we have no official imagery (e.g. when a publisher has not granted usage rights). We allow one submission at a time to keep quality consistent and avoid competing photos. If official artwork becomes available later, it will replace the community photo.',
  },
]

export default function FaqPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-serif font-bold text-amber-400 mb-3 tracking-wide">
        Frequently Asked Questions
      </h1>
      <p className="text-stone-400 mb-12 text-sm">
        Can't find your answer? <a href="/contact" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">Contact us</a>.
      </p>

      <div className="divide-y divide-stone-800">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group py-5">
            <summary className="flex items-center justify-between cursor-pointer list-none gap-4">
              <span className="font-serif text-base text-stone-200 group-open:text-amber-400 transition-colors">
                {q}
              </span>
              <ChevronDown
                size={16}
                className="text-stone-500 shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="mt-3 text-sm text-stone-400 leading-relaxed">{a}</div>
          </details>
        ))}
      </div>
    </div>
  )
}
