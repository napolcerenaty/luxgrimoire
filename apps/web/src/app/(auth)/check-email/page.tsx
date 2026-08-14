'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function CheckEmailContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email')

  return (
    <div className="bg-navy-900 border border-navy-800 rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
      <h1 className="font-serif text-3xl text-brand-400 mb-6">LuxGrimoire</h1>
      <div className="text-5xl mb-4">✉</div>
      <h2 className="text-xl font-semibold text-navy-100 mb-3">Check your inbox</h2>
      <p className="text-navy-400 text-sm mb-2">
        We&apos;ve sent a verification link to{' '}
        {email ? (
          <span className="text-navy-200 font-medium">{email}</span>
        ) : (
          'your email address'
        )}
        .
      </p>
      <p className="text-navy-500 text-sm mb-8">
        Click the link in the email to activate your account. The link expires in 24 hours.
      </p>

      <div className="space-y-3">
        <Link
          href={`/resend-verification${email ? `?email=${encodeURIComponent(email)}` : ''}`}
          className="block text-sm text-brand-400 hover:text-brand-300 transition-colors"
        >
          Didn&apos;t receive it? Resend email
        </Link>
        <Link
          href="/login"
          className="block text-sm text-navy-500 hover:text-navy-400 transition-colors"
        >
          Back to login
        </Link>
      </div>
    </div>
  )
}

export default function CheckEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-navy-900 border border-navy-800 rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <CheckEmailContent />
    </Suspense>
  )
}
