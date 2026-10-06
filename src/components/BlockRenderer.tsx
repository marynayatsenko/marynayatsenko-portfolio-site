import type { CSSProperties } from 'react'
import { useI18n } from '../i18n'

export type Block = {
  t: 'col' | 'row' | 'box' | 'text' | 'link' | 'img' | 'icon'
  c?: Block | Block[] | null
  mt?: number
  ml?: number
  fw?: number
  w?: number
  h?: number
  grid?: boolean
  inline?: boolean
  fixed?: [number, number]
  pad?: [number, number, number, number]
  bg?: string
  br?: string
  tag?: string
  html?: string
  s?: number
  href?: string
  src?: string
  ar?: number
  hm?: boolean
  li?: boolean
  ta?: string | null
  al?: string
  ot?: number
  ix?: number
  ir?: number
  a?: string
}

const asList = (c: Block | Block[] | null | undefined): Block[] => (!c ? [] : Array.isArray(c) ? c : [c])

function Text({ n }: { n: Block }) {
  const { t } = useI18n()
  const Tag = (n.tag ?? 'p') as 'p' | 'h2' | 'h3'
  return <Tag className={`t${n.s}${n.li ? ' li' : ''}${n.ta ? ' tc' : ''}`} dangerouslySetInnerHTML={{ __html: t(n.html ?? '') }} />
}

export default function BlockRenderer({ n, parentRow }: { n: Block; parentRow?: Block }) {
  const { t } = useI18n()
  const style: CSSProperties = {}
  const cls: string[] = []
  if (n.mt) style.marginTop = n.mt
  if (n.ix) style.marginLeft = n.ix
  if (n.ir) style.marginRight = n.ir
  if (parentRow) {
    if (n.ml) style['--gap' as keyof CSSProperties] = (`${n.ml}px`) as never
    const fixedChild = n.t === 'icon' || n.t === 'link' || (n.t === 'img' && parentRow.inline) || !!n.fixed
    if (n.t === 'text' && (n.fw ?? 999) < 120) {
      style.flex = 'none'
      style.whiteSpace = 'nowrap'
    } else if (n.t === 'link') {
      // links may wrap when a translation is longer than the original text
      style.flex = '0 1 auto'
      style.minWidth = 0
    } else if (fixedChild || (n.t === 'box' && parentRow.inline)) {
      style.flex = 'none'
    } else {
      style.flex = `${n.fw ?? 1} 1 0`
      style.minWidth = 0
    }
    if (n.ot) style['--ot' as keyof CSSProperties] = (`${n.ot}px`) as never
    cls.push('cell')
  }

  switch (n.t) {
    case 'col':
      return (
        <div className={['col', ...cls].join(' ')} style={style}>
          {asList(n.c).map((k, i) => (
            <BlockRenderer key={i} n={k} />
          ))}
        </div>
      )
    case 'row':
      return (
        <div className={['row', n.inline ? 'inline' : '', n.grid ? 'grid' : '', n.al === 'c' ? 'alc' : '', ...cls].join(' ')} style={style}>
          {asList(n.c).map((k, i) => (
            <BlockRenderer key={i} n={k} parentRow={n} />
          ))}
        </div>
      )
    case 'box': {
      const [pt, pr, pb, pl] = n.pad ?? [0, 0, 0, 0]
      style.background = n.bg
      style.borderRadius = n.br
      style.padding = `${pt}px ${pr}px ${pb}px ${pl}px`
      if (n.fixed) {
        style.width = n.fixed[0]
        style.height = n.fixed[1]
        style.flex = 'none'
        style.display = 'flex'
        style.alignItems = 'center'
        style.justifyContent = 'center'
        style.padding = 0
      }
      const kids = asList(n.c)
      const chip = kids.length === 1 && kids[0].t === 'row' && kids[0].inline
      return (
        <div className={['box', chip ? 'chip' : '', ...cls].join(' ')} style={style}>
          {kids.map((k, i) => (
            <BlockRenderer key={i} n={k} />
          ))}
        </div>
      )
    }
    case 'text':
      return parentRow || n.mt ? (
        <div className={cls.join(' ')} style={style}>
          <Text n={n} />
        </div>
      ) : (
        <Text n={n} />
      )
    case 'link':
      return (
        <a
          className={`t${n.s} ${cls.join(' ')}`}
          style={style}
          href={n.href}
          target="_blank"
          rel="noopener noreferrer"
          dangerouslySetInnerHTML={{ __html: t(n.html ?? '') }}
        />
      )
    case 'img':
      return (
        <img
          className={['pic', ...cls].join(' ')}
          style={{ ...style, aspectRatio: n.ar, borderRadius: n.br, ...(parentRow?.inline ? { width: n.fw } : {}) }}
          src={`/assets/img/${n.src}`}
          alt=""
          loading="lazy"
          decoding="async"
        />
      )
    case 'icon':
      return <img className={cls.join(' ')} style={style} src={`/assets/svg/${n.a}.svg`} width={n.w} height={n.h} alt="" />
  }
}
