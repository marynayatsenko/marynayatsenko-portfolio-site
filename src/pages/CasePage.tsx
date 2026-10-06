import { useEffect } from 'react'
import { useI18n } from '../i18n'
import PageBody, { type PageData } from '../components/PageBody'
import pages from '../data/pages.json'

const titles: Record<string, string> = {
  'case-admin-system': 'AI-augmented admin panel design',
  'case-claim-statement': 'AI-Powered legal research workflow',
  'massage-chair': 'Massage chair managing app',
}

export default function CasePage({ slug }: { slug: string }) {
  const { t } = useI18n()
  useEffect(() => {
    document.title = `${t(titles[slug])} — ${t('Maryna Yatsenko')}`
    return () => {
      document.title = t('Maryna Yatsenko')
    }
  }, [slug, t])

  return <PageBody data={(pages as unknown as Record<string, PageData>)[slug]} className={`case ${slug}`} />
}
