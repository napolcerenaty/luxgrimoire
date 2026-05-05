import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'LuxGrimoire — Back Soon', robots: 'noindex' }

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-stone-950 text-stone-100">
      {/* Logo mark */}
      <div className="mb-8 text-amber-500 opacity-80">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M32 8L8 20v24l24 12 24-12V20L32 8z" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M32 8v36M8 20l24 12 24-12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
        </svg>
      </div>

      <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-3 text-center">
        LuxGrimoire
      </h1>
      <p className="text-stone-400 text-lg mb-2 text-center">We&apos;re currently performing maintenance.</p>
      <p className="text-stone-500 text-sm text-center">We&apos;ll be back shortly. Thank you for your patience.</p>

      <div className="mt-10 flex gap-1.5">
        {[0, 150, 300].map(delay => (
          <span
            key={delay}
            className="w-2 h-2 rounded-full bg-amber-500 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
