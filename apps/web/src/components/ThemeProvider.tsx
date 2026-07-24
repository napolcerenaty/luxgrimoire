'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: 'dark',
  toggleTheme: () => {},
})

function getThemeCookie(): Theme {
  if (typeof document === 'undefined') return 'dark'
  const match = document.cookie.match(/(?:^|;\s*)lx-theme=([^;]+)/)
  return match?.[1] === 'light' ? 'light' : 'dark'
}

function setThemeCookie(theme: Theme) {
  // 1 year, not httpOnly so client JS can read it for toggle
  document.cookie = `lx-theme=${theme}; path=/; max-age=31536000; SameSite=Lax`
}

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode
}) {
  // Lazy-initialized from the cookie on first client render, matching the blocking inline
  // script in the root layout's <head> that already set <html data-theme> before hydration —
  // no server-rendered value to reconcile with (see layout.tsx for why), so no FOUC either way.
  const [theme, setTheme] = useState<Theme>(() => getThemeCookie())

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    setThemeCookie(theme)
    // Update PWA theme-color meta tag dynamically
    const color = theme === 'light' ? '#fafaf9' : '#0c0a09'
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = color
  }, [theme])

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
