import { Link } from 'react-router-dom'
import Bi from '../components/Bi'
import { useI18n } from '../i18n'
import homeData from '../data/home.json'

type Item = { k: 'svg' | 'img' | 'box'; a?: string | null; i: number; ha?: string; hw?: number; hh?: number }
type Bp = { items: Item[] }
type CardData = { href: string; bps: Record<'d' | 't' | 'm', Bp> }

const data = homeData as unknown as Record<string, CardData>

type CardMeta = {
  id: string
  bg: string
  label: string
  labelColor?: string
  title: string
  titleShort?: string
  note?: string
}

const cards: CardMeta[] = [
  {
    id: 'admin',
    bg: 'rgb(237, 237, 245)',
    label: 'Custom B2B admin system ↗',
    title: 'Bookstore and stationery retail management admin panel',
    titleShort: 'Retail management admin panel',
    note: 'Built using Claude Code + AI assistance',
  },
  {
    id: 'design',
    bg: 'rgb(214, 224, 255)',
    label: 'Variables. Components ↗',
    title: 'Design system for scalable\n& consistent interfaces',
    titleShort: 'Design system for scalable interfaces',
  },
  { id: 'massage', bg: 'rgb(249, 225, 250)', label: 'Mobile app ↗', title: 'Massage chair managing application' },
  { id: 'claim', bg: 'rgb(214, 224, 255)', label: 'B2B platform ↗', title: 'AI-Powered legal research workflow' },
  { id: 'sports', bg: 'rgb(226, 244, 190)', label: 'Mobile application ↗', title: 'Mobile application for sports' },
  { id: 'finance', bg: 'rgb(252, 229, 195)', label: 'Web application ↗', title: 'Personal finance tracking application' },
]

function Decor({ id, bp }: { id: string; bp: 'd' | 't' | 'm' }) {
  const items = data[id].bps[bp].items
  return (
    <div className={`bp bp-${bp}`} aria-hidden="true">
      {items.map((it) => {
        const cls = `item i-${bp}-${it.i}`
        if (it.k === 'box') return <div key={it.i} className={cls} />
        if (it.k === 'img') return <img key={it.i} className={cls} src={`/assets/img/${it.a}.webp`} alt="" decoding="async" />
        return (
          <span key={it.i}>
            <div className={`${cls} svgbg`} style={{ backgroundImage: `url(/assets/svg/${it.a}.svg)` }} />
            {it.ha && <div className={`item svgbg i-${bp}-${it.i}b`} style={{ backgroundImage: `url(/assets/svg/${it.ha}.svg)` }} />}
          </span>
        )
      })}
    </div>
  )
}

function Card({ m }: { m: CardMeta }) {
  const { t } = useI18n()
  const href = data[m.id].href
  const external = href.startsWith('http')
  const inner = (
    <>
      <Decor id={m.id} bp="d" />
      <Decor id={m.id} bp="t" />
      <Decor id={m.id} bp="m" />
      <span className="card-label">
        <Bi en={m.label} />
      </span>
      {m.note && (
        <span className="card-note">
          <Bi en={m.note} />
        </span>
      )}
      <h2 className="card-title">
        {m.titleShort ? (
          <>
            <span className="only-d">
              <Bi en={m.title} />
            </span>
            <span className="not-d">
              <Bi en={m.titleShort} />
            </span>
          </>
        ) : (
          <Bi en={m.title} />
        )}
      </h2>
    </>
  )
  const props = { className: `card c-${m.id}`, style: { background: m.bg } }
  return external ? (
    <a {...props} href={href} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <Link {...props} to={href.replace('./', '/')}>
      {inner}
    </Link>
  )
}

export default function Home() {
  const { t } = useI18n()
  const by = (id: string) => cards.find((c) => c.id === id)!
  return (
    <main className="home">
      <section className="hero">
        <img className="hero-photo" src="/assets/img/5mrZC0DP6m3Egge8ahXJ5yyzs0.webp" alt={t('Maryna Yatsenko')} />
        <div className="hero-text">
          <h1>
            <Bi en="Hi 👋, I'm Maryna" />
          </h1>
          <p>
            <Bi en="With 2 years of experience in Product UX/UI Design, I create digital products for complex B2B SaaS platforms." />
          </p>
          <p>
            <Bi en="I combine UX research, interface design, design systems, and AI-assisted workflows to turn complex business requirements into clear, usable experiences." />
          </p>
        </div>
      </section>
      <section className="cards">
        <div className="col-left">
          <Card m={by('admin')} />
          <Card m={by('design')} />
        </div>
        <div className="col-right">
          <Card m={by('massage')} />
          <Card m={by('claim')} />
          <Card m={by('sports')} />
          <Card m={by('finance')} />
        </div>
      </section>
    </main>
  )
}
