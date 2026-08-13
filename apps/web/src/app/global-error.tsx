'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ background: '#0c0a09', color: '#e7e5e4', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0, fontFamily: 'serif', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
          <div
            style={{
              margin: '0 auto 1.25rem',
              width: '3.5rem',
              height: '3.5rem',
              borderRadius: '9999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(42,158,196,0.1)',
              border: '1px solid rgba(42,158,196,0.3)',
              fontSize: '1.5rem',
            }}
          >
            ⚠️
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#a8a29e', fontSize: '0.875rem', margin: 0 }}>
            An unexpected error occurred and has already been logged on our end.
          </p>
          {error.digest && (
            <p style={{ color: '#57534e', fontSize: '0.75rem', marginTop: '0.5rem' }}>Reference: {error.digest}</p>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.75rem',
              padding: '0.625rem 1.5rem',
              borderRadius: '0.75rem',
              background: 'rgba(42,158,196,0.1)',
              color: '#2a9ec4',
              border: '1px solid rgba(42,158,196,0.3)',
              fontSize: '0.875rem',
              fontWeight: 500,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      </body>
    </html>
  )
}
