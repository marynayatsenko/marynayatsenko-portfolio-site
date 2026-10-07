import { Fragment } from 'react'
import { useI18n } from '../i18n'

/**
 * Both language versions are laid out in the same grid cell and only one is visible,
 * so a text block always keeps the height of the longer version. That keeps the whole
 * page perfectly still when the language is switched.
 */
export default function Bi({ en, html = false }: { en: string; html?: boolean }) {
  const { lang, both } = useI18n()
  const [a, b] = both(en)
  const render = (s: string) =>
    html ? (
      <span className="bi-in" dangerouslySetInnerHTML={{ __html: s }} />
    ) : (
      s.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))
    )
  if (a === b) return html ? <span className="bi-in" dangerouslySetInnerHTML={{ __html: a }} /> : <>{render(a)}</>
  return (
    <span className="bi">
      <span className={lang === 'en' ? 'on' : ''} lang="en">
        {render(a)}
      </span>
      <span className={lang === 'uk' ? 'on' : ''} lang="uk">
        {render(b)}
      </span>
    </span>
  )
}
