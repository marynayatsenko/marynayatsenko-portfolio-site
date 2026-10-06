import { useI18n, type Lang } from '../i18n'

const options: { id: Lang; label: string; name: string }[] = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'uk', label: 'UA', name: 'Українська' },
]

/** Small two-segment switch (EN | UA) that matches the site's pill navigation. */
export default function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div className={`lang ${className}`} role="group" aria-label={t('Language')}>
      <span className="lang-thumb" style={{ transform: `translateX(${lang === 'uk' ? 100 : 0}%)` }} aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={'lang-btn' + (lang === o.id ? ' on' : '')}
          lang={o.id}
          aria-pressed={lang === o.id}
          title={o.name}
          onClick={() => setLang(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
