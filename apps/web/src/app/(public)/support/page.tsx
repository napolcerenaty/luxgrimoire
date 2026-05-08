import type { Metadata } from 'next'
import Link from 'next/link'
import { Heart, Coffee } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Support Us – LuxGrimoire',
  description: "LuxGrimoire is free to use. If you'd like to support the project, you can buy the creator a coffee.",
}

export default function SupportPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-900/30 border border-amber-700/50 mb-6">
          <Heart size={28} className="text-amber-400" />
        </div>
        <h1 className="text-4xl font-serif font-bold text-amber-400 mb-4 tracking-wide">
          Support LuxGrimoire
        </h1>
        <p className="text-stone-400 text-base leading-relaxed">
          LuxGrimoire is a passion project built for the book community.
        </p>
      </div>

      <div className="space-y-6 text-stone-300 text-sm leading-relaxed">
        <div className="rounded-xl border border-stone-700 bg-stone-900/60 p-6">
          <h2 className="font-serif text-lg text-stone-100 font-semibold mb-3">Always free</h2>
          <p>
            LuxGrimoire is completely free to use — browsing, tracking your collection, following sale announcements, and all other features.
            That's how it has always been and how it will stay.
          </p>
        </div>

        <div className="rounded-xl border border-stone-700 bg-stone-900/60 p-6">
          <h2 className="font-serif text-lg text-stone-100 font-semibold mb-3">Running costs</h2>
          <p>
            The hosting, database, image storage, and other infrastructure costs are covered personally by the creator of LuxGrimoire.
            There are no ads, no paid plans, and no data selling — just a straightforward tool for the community.
          </p>
        </div>

        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-6">
          <h2 className="font-serif text-lg text-stone-100 font-semibold mb-3">Want to help?</h2>
          <p className="mb-5">
            If LuxGrimoire has been useful to you and you'd like to support its continued development and hosting,
            you're very welcome to buy the creator a coffee. Every contribution — however small — is genuinely appreciated
            and helps keep the project going. ☕
          </p>
          <a
            href="https://buymeacoffee.com/luxgrimoire"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold font-serif text-sm transition-colors shadow-lg shadow-amber-900/30"
          >
            <Coffee size={18} />
            Buy me a coffee
          </a>
        </div>

        <p className="text-stone-500 text-xs text-center pt-2">
          You can also support the project by{' '}
          <Link href="/data-requests" className="text-amber-600 hover:text-amber-500 underline underline-offset-2">
            contributing data
          </Link>
          ,{' '}
          <Link href="/sale-announcement-requests" className="text-amber-600 hover:text-amber-500 underline underline-offset-2">
            reporting sale announcements
          </Link>
          , or simply spreading the word. Thank you! 💛
        </p>
      </div>
    </div>
  )
}
