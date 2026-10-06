import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useI18n } from '../i18n'
import Lightbox, { type LightboxItem } from '../components/Lightbox'
import PageBody, { type PageData } from '../components/PageBody'
import pages from '../data/pages.json'

type Open = { items: LightboxItem[]; els: HTMLImageElement[]; index: number }

/** Collect every screen of the visible layout together with the project it belongs to. */
function collect(img: HTMLImageElement): Open | null {
  const view = img.closest('.view')
  if (!view) return null
  const all = Array.from(view.querySelectorAll<HTMLImageElement>('img.pic'))
  const groups: Element[] = []
  const items = all.map((el) => {
    const box = el.closest('.box') ?? view
    let g = groups.indexOf(box)
    if (g < 0) g = groups.push(box) - 1
    const heads = box.querySelectorAll('h2')
    const thumb = el.currentSrc || el.src
    const ratio = el.naturalWidth && el.naturalHeight ? el.naturalWidth / el.naturalHeight : 0
    return { thumb, ratio, src: thumb.replace('/assets/img/', '/assets/img/full/'), group: g, sub: heads[0]?.textContent?.trim() || undefined, title: heads[1]?.textContent?.trim() || 'Gallery' }
  })
  const index = all.indexOf(img)
  return index < 0 ? null : { items, els: all, index }
}

export default function Gallery() {
  const { t } = useI18n()
  const [open, setOpen] = useState<Open | null>(null)

  useEffect(() => {
    document.title = `${t('Gallery')} — ${t('Maryna Yatsenko')}`
    return () => {
      document.title = t('Maryna Yatsenko')
    }
  }, [t])

  // make the screens keyboard-reachable
  useEffect(() => {
    document.querySelectorAll<HTMLImageElement>('.page.gallery img.pic').forEach((img, i) => {
      img.tabIndex = 0
      img.setAttribute('role', 'button')
      img.setAttribute('aria-label', `${t('Open image')} ${(i % 6) + 1} ${t('full size')}`)
    })
  }, [t])

  // the grid picture that is currently "in the viewer" is hidden, so the flight to/from it looks seamless
  useLayoutEffect(() => {
    if (!open) return
    open.els.forEach((el, i) => el.classList.toggle('lb-lifted', i === open.index))
    return () => open.els.forEach((el) => el.classList.remove('lb-lifted'))
  }, [open])

  const openFrom = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLImageElement) || !target.classList.contains('pic')) return false
    const o = collect(target)
    if (o) setOpen(o)
    return !!o
  }, [])

  return (
    <>
      <PageBody
        data={(pages as unknown as Record<string, PageData>)['ui-gallery']}
        className="gallery"
        onClick={(e) => {
          openFrom(e.target)
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && openFrom(e.target)) e.preventDefault()
        }}
      />
      {open && (
        <Lightbox
          items={open.items}
          getOrigin={(i) => open.els[i]?.getBoundingClientRect() ?? null}
          index={open.index}
          onIndexChange={(i) => setOpen((o) => (o ? { ...o, index: i } : o))}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}
