import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Navbar } from '@/components/layout/Navbar'
import { ConditionalFooter } from '@/components/layout/ConditionalFooter'
import { DevBanner } from '@/components/layout/DevBanner'
import { BugReportButton } from '@/components/layout/BugReportButton'
import { CookieBanner } from '@/components/layout/CookieBanner'
import { Providers } from '@/components/Providers'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0a09' },
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
  ],
}

export const metadata: Metadata = {
  title: {
    template: '%s | LuxGrimoire',
    default: 'LuxGrimoire',
  },
  description:
    'Discover and track luxury book editions, special editions, and subscription boxes. Your collection, beautifully organised.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? 'https://luxgrimoire.com',
  ),
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LuxGrimoire',
  },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  openGraph: {
    siteName: 'LuxGrimoire',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
}

// Runs before first paint. Reading the theme cookie server-side (via next/headers `cookies()`)
// would force this layout — and every page under it, including statically generated /blog
// routes — into dynamic per-request rendering. This reads the same cookie client-side,
// synchronously, before React hydrates, so there's no flash and no forced-dynamic routes.
const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)lx-theme=([^;]+)/);if(m&&m[1]==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-stone-950 text-stone-200 min-h-screen font-sans antialiased [overflow-x:clip]">
        <Providers>
          <DevBanner />
          <Navbar />
          <main className="flex-1">{children}</main>
          <ConditionalFooter />
          <BugReportButton />
          <CookieBanner />
        </Providers>
      </body>
    </html>
  )
}
