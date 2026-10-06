import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'

export default function NotFound() {
  const { t } = useI18n()
  return (
    <main className="page notfound">
      <h2 className="nf-title">{t('Page not found')}</h2>
      <Link to="/" className="back">
        {t('Back to home')}
      </Link>
    </main>
  )
}
