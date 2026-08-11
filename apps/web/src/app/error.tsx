'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCw, Bug } from 'lucide-react'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10 border border-brand-500/30">
          <AlertTriangle size={24} className="text-brand-500" />
        </div>
        <h1 className="font-serif text-2xl font-semibold text-stone-100 mb-2">Something went wrong</h1>
        <p className="text-sm text-stone-400">
          An unexpected error occurred while loading this page. It&apos;s already been logged on our end —
          no need to report it unless you&apos;d like to add details.
        </p>
        {error.digest && (
          <p className="text-xs text-stone-600 mt-2">Reference: {error.digest}</p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/30 text-sm font-medium hover:bg-brand-500/20 transition-colors"
          >
            <RotateCw size={15} />
            Try again
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-bug-report', { detail: { category: 'error' } }))}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-stone-700 text-stone-300 text-sm font-medium hover:bg-stone-800 transition-colors"
          >
            <Bug size={15} />
            Report a bug
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-stone-400 text-sm font-medium hover:text-stone-200 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
