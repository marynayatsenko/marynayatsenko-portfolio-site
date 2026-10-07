import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import Bi from './Bi'
import BlockRenderer, { type Block } from './BlockRenderer'

export type PageTree = { tree: Block; top: number; gap: number; bot: number; back: boolean }
export type PageData = { d: PageTree; m: PageTree }

function BackLink({ gap }: { gap: number }) {
  return (
    <Link to="/" className="back" style={{ marginBottom: gap }}>
      <svg width="12" height="12" viewBox="0 0 12 11.667" aria-hidden="true">
        <path
          d="M 2.871 5.083 L 12 5.083 L 12 6.583 L 2.871 6.583 L 6.894 10.606 L 5.834 11.667 L 0 5.833 L 5.833 0 L 6.894 1.06 Z"
          fill="currentColor"
        />
      </svg>
      <Bi en="Back" />
    </Link>
  )
}

/**
 * Case pages and the gallery are generated from two measured layouts of the
 * original site (desktop and mobile). Both are rendered; CSS shows the right one.
 */
type MainProps = Pick<React.HTMLAttributes<HTMLElement>, 'onClick' | 'onKeyDown'>

export default function PageBody({ data, className, ...handlers }: { data: PageData; className: string } & MainProps) {
  const render = (v: PageTree, cls: string) => (
    <div className={cls} style={{ paddingTop: v.top, paddingBottom: v.bot } as CSSProperties}>
      {v.back && <BackLink gap={v.gap} />}
      <BlockRenderer n={v.tree} />
    </div>
  )
  return (
    <main className={`page ${className}`} {...handlers}>
      {render(data.d, 'view view-d')}
      {render(data.m, 'view view-m')}
    </main>
  )
}
