import { useEffect } from 'react'
import PageBody, { type PageData } from '../components/PageBody'
import pages from '../data/pages.json'

export default function Gallery() {
  useEffect(() => {
    document.title = 'Gallery — Maryna Yatsenko'
    return () => {
      document.title = 'Maryna Yatsenko'
    }
  }, [])
  return <PageBody data={(pages as unknown as Record<string, PageData>)['ui-gallery']} className="gallery" />
}
