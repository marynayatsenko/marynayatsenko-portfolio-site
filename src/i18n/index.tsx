import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import ukContent from './uk-content.json'
import { uiUk } from './ui'

export type Lang = 'en' | 'uk'

const dict: Record<string, string> = { ...(ukContent as Record<string, string>), ...uiUk }
const STORAGE_KEY = 'lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'uk') return saved
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && /^uk\b/i.test(navigator.language) ? 'uk' : 'en'
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (en: string) => string }
const I18nContext = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (s) => s })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const t = useCallback((en: string) => (lang === 'uk' ? dict[en] ?? en : en), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)
