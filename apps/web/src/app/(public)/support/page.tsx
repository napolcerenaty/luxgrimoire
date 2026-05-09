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
          <h2 className="font-serif text-lg text-stone-100 font-semibold mb-3">✨ Always free</h2>
          <p>
            LuxGrimoire was made for people who genuinely love collecting books 📚 Special editions, subscription boxes,
            signed copies, beautiful shelves, preorder stress — all of it.
          </p>
          <p className="mt-3">
            The app is completely free to use and always will be. There are no ads, no premium subscriptions, no locked
            features, and no selling user data 🤍
          </p>
          <p className="mt-3">
            You can freely track your collection, manage subscriptions, follow upcoming editions, keep an eye on your
            spending, and organize everything in one place ✨
          </p>
        </div>

        <div className="rounded-xl border border-stone-700 bg-stone-900/60 p-6">
          <h2 className="font-serif text-lg text-stone-100 font-semibold mb-3">🌙 An independent passion project</h2>
          <p>
            LuxGrimoire is developed and maintained by one person who simply wanted a better way to keep track of the
            books they love.
          </p>
          <p className="mt-3">
            All hosting, database, image storage, and infrastructure costs are paid personally by the creator of
            LuxGrimoire to keep the platform running and continuously improving 💫
          </p>
          <p className="mt-3">
            This isn't a startup backed by investors or a large company — just a small independent project built with
            care for fellow collectors.
          </p>
        </div>

        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-6">
          <h2 className="font-serif text-lg text-stone-100 font-semibold mb-3">☕ Support the project</h2>
          <p className="mb-5">
            If LuxGrimoire has helped you discover a new edition, avoid missing a preorder, organize your collection, or
            simply made collecting more enjoyable 📖, and you'd like to support the project, you're very welcome to buy
            the creator a coffee ☕ — or a book 📚
          </p>
          <p className="mb-5">
            Every bit of support genuinely helps with development, server costs, and keeping LuxGrimoire alive, growing,
            and independent ♡
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
