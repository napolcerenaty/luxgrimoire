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
  initialTheme = 'dark',
}: {
  children: React.ReactNode
  initialTheme?: Theme
}) {
  // initialTheme is read server-side → <html data-theme> is set before hydration (no FOUC)
  const [theme, setTheme] = useState<Theme>(initialTheme)

  // On mount sync cookie → state in case it changed in another tab
  useEffect(() => {
    const cookieTheme = getThemeCookie()
    if (cookieTheme !== theme) setTheme(cookieTheme)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
