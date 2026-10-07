import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
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

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** make sure the Cyrillic faces are ready, so text never re-flows after the swap */
const cyrillicReady = () =>
  Promise.race([
    Promise.all(['400', '500', '700'].map((w) => document.fonts.load(`${w} 16px Manrope`, 'Аа'))).catch(() => undefined),
    sleep(700),
  ])

/** remember which piece of content the reader is looking at, so it can be kept in place after the text changes */
function pickAnchor() {
  const x = window.innerWidth / 2
  for (const y of [Math.min(220, window.innerHeight / 3), window.innerHeight / 2]) {
    const hit = document.elementFromPoint(x, y)
    const el = hit?.closest<HTMLElement>('main h1, main h2, main h3, main p, main li, main img, main a, main .card')
    if (el) return { el, top: el.getBoundingClientRect().top }
  }
  return null
}
function restoreAnchor(a: ReturnType<typeof pickAnchor>) {
  if (!a || !a.el.isConnected) return
  const d = a.el.getBoundingClientRect().top - a.top
  if (Math.abs(d) > 1) window.scrollBy(0, d)
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (en: string) => string }
const I18nContext = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (s) => s })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const langRef = useRef(lang)
  langRef.current = lang

  // warm up the Cyrillic font while the browser is idle
  useEffect(() => {
    const warm = () => void cyrillicReady()
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm)
      return () => w.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(warm, 1200)
    return () => window.clearTimeout(id)
  }, [])

  const setLang = useCallback(async (l: Lang) => {
    if (l === langRef.current) return
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* ignore */
    }
    if (l === 'uk') await cyrillicReady()
    const anchor = pickAnchor()
    const commit = () => {
      flushSync(() => setLangState(l))
      document.documentElement.lang = l
      restoreAnchor(anchor)
    }
    if (reducedMotion()) return commit()
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    if (doc.startViewTransition) {
      doc.startViewTransition(commit) // browser cross-fades the old and the new page
    } else {
      const root = document.documentElement
      root.classList.add('lang-out')
      await sleep(150)
      commit()
      root.classList.remove('lang-out')
    }
  }, [])

  const t = useCallback((en: string) => (lang === 'uk' ? dict[en] ?? en : en), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)
