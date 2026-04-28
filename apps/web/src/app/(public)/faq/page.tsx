import type { Metadata } from 'next'
import { ChevronDown } from 'lucide-react'

export const metadata: Metadata = {
  title: 'FAQ – LuxGrimoire',
  description: 'Frequently asked questions about LuxGrimoire — the community database for luxury book editions and subscription boxes.',
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What is LuxGrimoire?',
    a: 'LuxGrimoire is a community-driven database and tracking tool for luxury special edition books and book subscription boxes. You can browse editions, track what you own, follow upcoming sales, and discover new subscription boxes.',
  },
  {
    q: 'Is LuxGrimoire free to use?',
    a: 'Yes — browsing, searching, and adding data is completely free. Creating an account unlocks personal features like collection tracking, spending reports, and calendars.',
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
    q: 'How are brand colors used?',
    a: 'When a book box company has no cover images for an edition, LuxGrimoire can extract the brand\'s main colors from their website and use those as a decorative palette in calendars and edition placeholders. Colors are extracted automatically and can be re-run by admins.',
  },
  {
    q: 'I found incorrect data. How do I report it?',
    a: 'Use the "Report Abuse / DMCA" page (linked in the footer) and select "Incorrect data". Describe the issue and we\'ll investigate and correct it.',
  },
  {
    q: 'Is this affiliated with any subscription box company?',
    a: 'No. LuxGrimoire is an independent, fan-made community project. Featured partners are paid sponsored slots clearly labeled as such — they have no editorial influence over the database.',
  },
  {
    q: 'Can I become a moderator or contributor?',
    a: 'Send us a message via the Contact page! We\'re always looking for passionate book lovers who want to help keep the database accurate and up to date.',
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
            <p className="mt-3 text-sm text-stone-400 leading-relaxed">{a}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
