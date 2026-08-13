import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.01,
    integrations: [Sentry.replayIntegration()],
    debug: false,
    beforeSend(event) {
      // Drop noise from browser extensions that monkey-patch addEventListener and
      // recurse into themselves (e.g. "addEL_hook" — antivirus/coupon extensions).
      // Only matched when every stack frame is extension code (no app filename at
      // all), so a real stack overflow in our own bundle is never silenced.
      const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? []
      const isExtensionRecursion =
        frames.length > 0 &&
        frames.every((f) => !f.filename || f.filename === '<anonymous>') &&
        frames.some((f) => f.function === 'addEL_hook')
      if (isExtensionRecursion) return null
      return event
    },
  })
}
