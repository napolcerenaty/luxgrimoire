'use client'
import { createContext, useContext, useEffect, useState } from 'react'

export type Language = 'en' | 'pl' | 'de' | 'fr' | 'es' | 'it'

export const LANGUAGES: { code: Language; label: string; country: string }[] = [
  { code: 'en', label: 'English',  country: 'gb' },
  { code: 'pl', label: 'Polski',   country: 'pl' },
  { code: 'de', label: 'Deutsch',  country: 'de' },
  { code: 'fr', label: 'Français', country: 'fr' },
  { code: 'es', label: 'Español',  country: 'es' },
  { code: 'it', label: 'Italiano', country: 'it' },
]

const LanguageContext = createContext<{
  language: Language
  setLanguage: (l: Language) => void
}>({ language: 'en', setLanguage: () => {} })

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    const saved = localStorage.getItem('lx-lang') as Language | null
    if (saved && LANGUAGES.some(l => l.code === saved)) setLanguageState(saved)
  }, [])

  const setLanguage = (l: Language) => {
    setLanguageState(l)
    localStorage.setItem('lx-lang', l)
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
