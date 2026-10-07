import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useI18n, type Lang } from '../i18n'

const options: { id: Lang; code: string; name: string }[] = [
  { id: 'en', code: 'EN', name: 'English' },
  { id: 'uk', code: 'UA', name: 'Українська' },
]

/** Language selector: a quiet trigger (globe · code · chevron) that opens a small menu with the languages. */
export default function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()
  const current = options.find((o) => o.id === lang) ?? options[0]

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus({ preventScroll: true })
  }, [])

  const toggle = () => {
    if (!open) {
      // the nav sits at the bottom of the screen on tablets / phones → open the menu upwards there
      const r = triggerRef.current?.getBoundingClientRect()
      setUp(!!r && r.top > window.innerHeight / 2)
      setActive(Math.max(0, options.findIndex((o) => o.id === lang)))
    }
    setOpen((v) => !v)
  }

  const choose = (l: Lang) => {
    close()
    if (l !== lang) window.setTimeout(() => void setLang(l), 130) // let the menu fold away first
  }

  // close on outside press / Esc
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        setActive(e.key === 'Home' ? 0 : options.length - 1)
      } else if (e.key === 'Tab') {
        close(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  // keep focus on the highlighted option while the menu is open
  useEffect(() => {
    if (open) itemRefs.current[active]?.focus({ preventScroll: true })
  }, [open, active])

  return (
    <div className={`lang ${open ? 'is-open' : ''} ${className}`} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${t('Language')}: ${current.name}`}
        onClick={toggle}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            toggle()
          }
        }}
      >
        <svg className="lang-globe" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.6 2.4 3.9 5.4 3.9 9S14.6 18.6 12 21c-2.6-2.4-3.9-5.4-3.9-9S9.4 5.4 12 3z" />
        </svg>
        <span className="lang-code">{current.code}</span>
        <svg className="lang-chev" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>

      <div id={menuId} className={'lang-menu' + (open ? ' open' : '') + (up ? ' up' : '')} role="listbox" aria-label={t('Language')} aria-hidden={!open}>
        {options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            role="option"
            lang={o.id}
            aria-selected={o.id === lang}
            tabIndex={open && i === active ? 0 : -1}
            className={'lang-opt' + (o.id === lang ? ' sel' : '')}
            onClick={() => choose(o.id)}
            onMouseEnter={() => setActive(i)}
          >
            <span className="lang-opt-name">{o.name}</span>
            <span className="lang-opt-code">{o.code}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
