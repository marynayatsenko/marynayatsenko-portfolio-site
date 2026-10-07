import { useI18n, type Lang } from '../i18n'

const options: { id: Lang; label: string; name: string }[] = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'uk', label: 'UA', name: 'Українська' },
]

/** Quiet text toggle — deliberately lighter than the nav buttons, so it reads as a secondary control. */
export default function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div className={`lang ${className}`} role="group" aria-label={t('Language')}>
      {options.map((o, i) => (
        <span className="lang-item" key={o.id}>
          {i > 0 && (
            <span className="lang-slash" aria-hidden="true">
              /
            </span>
          )}
          <button type="button" className={'lang-btn' + (lang === o.id ? ' on' : '')} lang={o.id} aria-pressed={lang === o.id} title={o.name} onClick={() => void setLang(o.id)}>
            {o.label}
          </button>
        </span>
      ))}
    </div>
  )
}
