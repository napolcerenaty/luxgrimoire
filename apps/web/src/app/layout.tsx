import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { DevBanner } from '@/components/layout/DevBanner'
import { BugReportButton } from '@/components/layout/BugReportButton'
import { CookieBanner } from '@/components/layout/CookieBanner'
import { Providers } from '@/components/Providers'

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
  openGraph: {
    siteName: 'LuxGrimoire',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const theme = cookieStore.get('lx-theme')?.value === 'light' ? 'light' : 'dark'

  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body className="bg-stone-950 text-stone-200 min-h-screen font-sans antialiased">
        <Providers initialTheme={theme}>
          <DevBanner />
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          <BugReportButton />
          <CookieBanner />
        </Providers>
      </body>
    </html>
  )
}
