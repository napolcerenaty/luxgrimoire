'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useTheme } from '@/components/ThemeProvider'

export default function BlogNavLogo() {
  const { theme } = useTheme()
  return (
    <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="Back to LuxGrimoire app">
      <Image
        src={theme === 'dark' ? '/logo-light.png' : '/logo-dark.png'}
        alt="LuxGrimoire"
        width={32}
        height={32}
        className="h-8 w-auto"
        priority
      />
      <span className="hidden sm:inline font-serif font-bold tracking-widest text-amber-400 text-base">LuxGrimoire</span>
    </Link>
  )
}
