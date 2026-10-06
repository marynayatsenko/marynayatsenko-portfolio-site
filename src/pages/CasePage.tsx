import { useEffect } from 'react'
import PageBody, { type PageData } from '../components/PageBody'
import pages from '../data/pages.json'

const titles: Record<string, string> = {
  'case-admin-system': 'AI-augmented admin panel design',
  'case-claim-statement': 'AI-Powered legal research workflow',
  'massage-chair': 'Massage chair managing app',
}

export default function CasePage({ slug }: { slug: string }) {
  useEffect(() => {
    document.title = `${titles[slug]} — Maryna Yatsenko`
    return () => {
      document.title = 'Maryna Yatsenko'
    }
  }, [slug])

  return <PageBody data={(pages as unknown as Record<string, PageData>)[slug]} className={`case ${slug}`} />
}
