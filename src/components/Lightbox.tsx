import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'

export type LightboxItem = {
  /** full-resolution image shown in the viewer */
  src: string
  /** small version (already cached from the page) used as placeholder */
  thumb: string
  /** width / height of the image */
  ratio: number
  title: string
  sub?: string
  /** items sharing a group id belong to one project (dots indicator) */
  group: number
}

type View = { s: number; x: number; y: number }

const MIN = 1
const MAX = 8
const STEP = 1.25
const FIT: View = { s: 1, x: 0, y: 0 }
/** iOS-like deceleration curve: fast start, long soft landing */
const EASE = 'cubic-bezier(.32,.72,0,1)'
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

type Props = {
  items: LightboxItem[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
  /** on-page rect of the thumbnail for an index; the image flies from / back to it */
  getOrigin?: (i: number) => DOMRect | null
}

export default function Lightbox({ items, index, onIndexChange, onClose, getOrigin }: Props) {
  const { t } = useI18n()
  const [view, setView] = useState<View>(FIT)
  const [drag, setDrag] = useState(0)
  const [dismissY, setDismissY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  const [loaded, setLoaded] = useState<Record<number, boolean>>({ [index]: true })
  const [ratios, setRatios] = useState<Record<number, number>>(() => Object.fromEntries(items.map((it, i) => [i, it.ratio || 1.4])))
  const [fullReady, setFullReady] = useState<Record<string, boolean>>({})

  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRefs = useRef<(HTMLImageElement | null)[]>([])
  const flyRefs = useRef<(HTMLDivElement | null)[]>([])
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const curRef = useRef<View>(FIT)
  const tgtRef = useRef<View>(FIT)
  const raf = useRef(0)
  const lastT = useRef(0)
  const indexRef = useRef(index)
  indexRef.current = index
  const closingRef = useRef(false)
  const vel = useRef({ x: 0, y: 0, t: 0, px: 0, py: 0 })
  const lastTap = useRef({ t: 0, x: 0, y: 0 })
  const g = useRef({
    kind: 'none' as 'none' | 'one' | 'pinch',
    sx: 0, sy: 0, vx: 0, vy: 0, t0: 0, dx: 0, dy: 0,
    moved: false,
    axis: '' as '' | 'x' | 'y',
    onImage: false,
    d0: 1, s0: 1, mx0: 0, my0: 0,
  })

  const item = items[index]
  const groupItems = items.map((it, i) => ({ it, i })).filter(({ it }) => it.group === item.group)

  /* ---------- zoom state: current view eases towards a target (frame-rate independent) ---------- */
  const commit = (v: View) => {
    curRef.current = v
    setView(v)
  }
  const step = useCallback((now: number) => {
    const dt = Math.min(0.05, (now - lastT.current) / 1000 || 0.016)
    lastT.current = now
    const f = 1 - Math.exp(-dt / 0.075)
    const c = curRef.current
    const t = tgtRef.current
    const n = { s: c.s + (t.s - c.s) * f, x: c.x + (t.x - c.x) * f, y: c.y + (t.y - c.y) * f }
    const done = Math.abs(t.s - n.s) < 0.002 && Math.abs(t.x - n.x) < 0.25 && Math.abs(t.y - n.y) < 0.25
    commit(done ? t : n)
    raf.current = done ? 0 : requestAnimationFrame(step)
  }, [])
  const animateTo = useCallback(
    (t: View) => {
      tgtRef.current = t
      if (reducedMotion()) {
        cancelAnimationFrame(raf.current)
        raf.current = 0
        commit(t)
        return
      }
      if (!raf.current) {
        lastT.current = performance.now()
        raf.current = requestAnimationFrame(step)
      }
    },
    [step],
  )
  const jumpTo = useCallback((t: View) => {
    cancelAnimationFrame(raf.current)
    raf.current = 0
    tgtRef.current = t
    commit(t)
  }, [])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const stageRect = () => stageRef.current?.getBoundingClientRect()

  const clampView = useCallback((s: number, x: number, y: number): View => {
    s = clamp(s, MIN, MAX)
    if (s <= MIN + 0.001) return FIT
    const st = stageRef.current?.getBoundingClientRect()
    const img = imgRefs.current[indexRef.current]
    const w = (img?.offsetWidth ?? st?.width ?? 0) * s
    const h = (img?.offsetHeight ?? st?.height ?? 0) * s
    const mx = Math.max(0, (w - (st?.width ?? 0)) / 2)
    const my = Math.max(0, (h - (st?.height ?? 0)) / 2)
    return { s, x: clamp(x, -mx, mx), y: clamp(y, -my, my) }
  }, [])

  /** zoom to `ns`, keeping the point (cx, cy) — relative to the stage centre — still */
  const zoomAt = useCallback(
    (ns: number, cx: number, cy: number, smooth = true) => {
      const t = tgtRef.current
      ns = clamp(ns, MIN, MAX)
      const k = ns / t.s
      const next = clampView(ns, cx - (cx - t.x) * k, cy - (cy - t.y) * k)
      smooth ? animateTo(next) : jumpTo(next)
    },
    [animateTo, clampView, jumpTo],
  )

  const actualSize = useCallback(() => {
    const img = imgRefs.current[indexRef.current]
    if (img?.offsetWidth) zoomAt(Math.max(1, img.naturalWidth / img.offsetWidth), 0, 0)
  }, [zoomAt])

  const go = useCallback(
    (d: number) => {
      const ni = indexRef.current + d
      if (ni >= 0 && ni < items.length) onIndexChange(ni)
    },
    [items.length, onIndexChange],
  )

  /* ---------- closing: image flies back to its thumbnail, backdrop fades ---------- */
  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    setDragging(false)
    const idx = indexRef.current
    const fly = flyRefs.current[idx]
    const origin = getOrigin?.(idx) ?? null
    const onScreen = origin && origin.bottom > 0 && origin.top < window.innerHeight && origin.right > 0 && origin.left < window.innerWidth
    if (reducedMotion() || !fly || !onScreen) {
      window.setTimeout(onClose, reducedMotion() ? 0 : 280)
      return
    }
    const fly2 = () => {
      const r = (imgRefs.current[idx] ?? fly).getBoundingClientRect()
      const s = origin.width / r.width
      const dx = origin.left + origin.width / 2 - (r.left + r.width / 2)
      const dy = origin.top + origin.height / 2 - (r.top + r.height / 2)
      const a = fly.animate(
        [{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx}px,${dy}px) scale(${s})` }],
        { duration: 480, easing: EASE, fill: 'forwards' },
      )
      imgRefs.current[idx]?.animate([{ borderRadius: '16px' }, { borderRadius: `${6 / s}px` }], { duration: 480, easing: EASE, fill: 'forwards' })
      a.onfinish = () => onClose()
    }
    if (curRef.current.s > 1.02) {
      animateTo(FIT)
      window.setTimeout(fly2, 240)
    } else {
      jumpTo(FIT)
      fly2()
    }
  }, [animateTo, getOrigin, jumpTo, onClose])

  /* ---------- opening: image flies out of its thumbnail ---------- */
  useLayoutEffect(() => {
    const fly = flyRefs.current[index]
    const origin = getOrigin?.(index)
    if (reducedMotion() || !fly || !origin || !origin.width) return
    const t = (imgRefs.current[index] ?? fly).getBoundingClientRect()
    const s = origin.width / t.width
    const dx = origin.left + origin.width / 2 - (t.left + t.width / 2)
    const dy = origin.top + origin.height / 2 - (t.top + t.height / 2)
    fly.animate(
      [{ transform: `translate(${dx}px,${dy}px) scale(${s})` }, { transform: 'translate(0,0) scale(1)' }],
      { duration: 620, easing: EASE, fill: 'backwards' },
    )
    imgRefs.current[index]?.animate([{ borderRadius: `${6 / s}px` }, { borderRadius: '16px' }], { duration: 620, easing: EASE, fill: 'backwards' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* full-resolution preload for current + neighbours */
  useEffect(() => {
    for (const i of [index, index + 1, index - 1]) {
      const it = items[i]
      if (!it || it.src === it.thumb) continue
      const im = new Image()
      im.decoding = 'async'
      im.onload = () => setFullReady((f) => (f[it.src] ? f : { ...f, [it.src]: true }))
      im.src = it.src
    }
  }, [index, items])

  /* new slide -> back to fit */
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    jumpTo(FIT)
    setDrag(0)
    setDismissY(0)
  }, [index, jumpTo])

  /* body scroll lock + focus restore */
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const sbw = window.innerWidth - document.documentElement.clientWidth
    const prevOverflow = document.body.style.overflow
    const prevPad = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`
    rootRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPad
      prevFocus?.focus?.({ preventScroll: true })
    }
  }, [])

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key
      const mod = e.ctrlKey || e.metaKey
      if (k === 'Escape') {
        e.preventDefault()
        requestClose()
      } else if (k === 'ArrowRight' || k === 'PageDown') {
        e.preventDefault()
        go(1)
      } else if (k === 'ArrowLeft' || k === 'PageUp') {
        e.preventDefault()
        go(-1)
      } else if (k === 'Home') {
        e.preventDefault()
        onIndexChange(0)
      } else if (k === 'End') {
        e.preventDefault()
        onIndexChange(items.length - 1)
      } else if (k === '+' || k === '=' || e.code === 'NumpadAdd') {
        e.preventDefault()
        zoomAt(tgtRef.current.s * STEP, 0, 0)
      } else if (k === '-' || k === '_' || e.code === 'NumpadSubtract') {
        e.preventDefault()
        zoomAt(tgtRef.current.s / STEP, 0, 0)
      } else if ((k === '0' || e.code === 'Numpad0') && !e.shiftKey) {
        e.preventDefault()
        animateTo(FIT)
      } else if (k === '1' && !mod) {
        e.preventDefault()
        actualSize()
      } else if ((k === 'ArrowUp' || k === 'ArrowDown') && tgtRef.current.s > 1) {
        e.preventDefault()
        const t = tgtRef.current
        animateTo(clampView(t.s, t.x, t.y + (k === 'ArrowUp' ? 90 : -90)))
      } else if (k === 'Tab') {
        const f = rootRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
        if (!f || !f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === rootRef.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actualSize, animateTo, clampView, go, items.length, onIndexChange, requestClose, zoomAt])

  /* ---------- wheel / trackpad pinch (needs a non-passive listener) ---------- */
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const st = el.getBoundingClientRect()
      const cx = e.clientX - st.left - st.width / 2
      const cy = e.clientY - st.top - st.height / 2
      const unit = e.deltaMode === 1 ? 16 : 1
      const speed = e.ctrlKey ? 0.012 : 0.0017
      zoomAt(tgtRef.current.s * Math.exp(-e.deltaY * unit * speed), cx, cy)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  /* ---------- pointer gestures: pan (with inertia), pinch, swipe, double-tap ---------- */
  const rel = (x: number, y: number) => {
    const st = stageRect()
    return { x: x - (st?.left ?? 0) - (st?.width ?? 0) / 2, y: y - (st?.top ?? 0) - (st?.height ?? 0) / 2 }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (closingRef.current || (e.target as HTMLElement).closest('button')) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    cancelAnimationFrame(raf.current)
    raf.current = 0
    tgtRef.current = curRef.current
    const c = curRef.current
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const m = rel((a.x + b.x) / 2, (a.y + b.y) / 2)
      Object.assign(g.current, { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: c.s, vx: c.x, vy: c.y, mx0: m.x, my0: m.y, moved: true, axis: '' })
      setDrag(0)
      setDismissY(0)
      setDragging(false)
    } else {
      Object.assign(g.current, { kind: 'one', sx: e.clientX, sy: e.clientY, vx: c.x, vy: c.y, t0: performance.now(), dx: 0, dy: 0, moved: false, axis: '', onImage: (e.target as HTMLElement).tagName === 'IMG' })
      vel.current = { x: 0, y: 0, t: performance.now(), px: e.clientX, py: e.clientY }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const s = g.current
    if (s.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const m = rel((a.x + b.x) / 2, (a.y + b.y) / 2)
      const ns = clamp(s.s0 * (Math.hypot(a.x - b.x, a.y - b.y) / s.d0), MIN * 0.8, MAX)
      const k = ns / s.s0
      const nx = m.x - (s.mx0 - s.vx) * k
      const ny = m.y - (s.my0 - s.vy) * k
      jumpTo(ns < MIN ? { s: ns, x: 0, y: 0 } : clampView(ns, nx, ny))
      return
    }
    if (s.kind !== 'one') return
    const dx = e.clientX - s.sx
    const dy = e.clientY - s.sy
    s.dx = dx
    s.dy = dy
    const now = performance.now()
    const dt = Math.max(1, now - vel.current.t)
    vel.current = { x: 0.8 * vel.current.x + 0.2 * ((e.clientX - vel.current.px) / dt), y: 0.8 * vel.current.y + 0.2 * ((e.clientY - vel.current.py) / dt), t: now, px: e.clientX, py: e.clientY }
    if (!s.moved && Math.hypot(dx, dy) > 6) s.moved = true
    if (!s.moved) return
    setDragging(true)
    if (curRef.current.s > 1.001) {
      jumpTo(clampView(curRef.current.s, s.vx + dx, s.vy + dy))
      return
    }
    if (!s.axis) s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (s.axis === 'x') {
      const atEdge = (indexRef.current === 0 && dx > 0) || (indexRef.current === items.length - 1 && dx < 0)
      setDrag(atEdge ? dx * 0.3 : dx)
    } else {
      setDismissY(dy)
    }
  }

  const endPointer = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    const s = g.current
    setDragging(false)

    if (s.kind === 'pinch') {
      if (pointers.current.size === 1) {
        const [p] = [...pointers.current.values()]
        Object.assign(s, { kind: 'one', sx: p.x, sy: p.y, vx: curRef.current.x, vy: curRef.current.y, t0: performance.now(), moved: true, axis: '', dx: 0, dy: 0 })
        vel.current = { x: 0, y: 0, t: performance.now(), px: p.x, py: p.y }
      } else {
        s.kind = 'none'
      }
      if (curRef.current.s < MIN + 0.001) animateTo(FIT)
      else if (pointers.current.size === 0) animateTo(clampView(curRef.current.s, curRef.current.x, curRef.current.y))
      return
    }
    if (s.kind !== 'one') return
    s.kind = 'none'
    const stage = stageRect()

    if (!s.moved) {
      // tap: double-tap zooms, a single tap on the backdrop closes
      const now = performance.now()
      const lt = lastTap.current
      const onImage = s.onImage
      if (now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
        const p = rel(e.clientX, e.clientY)
        if (tgtRef.current.s > 1.05) animateTo(FIT)
        else zoomAt(2.5, p.x, p.y)
        lastTap.current = { t: 0, x: 0, y: 0 }
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY }
        if (!onImage && curRef.current.s <= 1.05) {
          window.setTimeout(() => {
            if (lastTap.current.t === now) requestClose()
          }, 330)
        }
      }
      return
    }

    if (curRef.current.s > 1.001) {
      // let the picture glide on after a flick
      const v = vel.current
      if (Math.hypot(v.x, v.y) > 0.25) {
        const c = curRef.current
        animateTo(clampView(c.s, c.x + v.x * 220, c.y + v.y * 220))
      }
      return
    }
    const dt = Math.max(1, performance.now() - s.t0)
    if (s.axis === 'x') {
      const speed = s.dx / dt
      if (Math.abs(s.dx) > (stage?.width ?? 400) * 0.16 || Math.abs(speed) > 0.45) {
        const ni = indexRef.current + (s.dx < 0 ? 1 : -1)
        if (ni >= 0 && ni < items.length) {
          setDrag(0)
          onIndexChange(ni)
          return
        }
      }
      setDrag(0)
    } else if (s.axis === 'y') {
      if (Math.abs(s.dy) > 110 || Math.abs(s.dy / dt) > 0.6) requestClose()
      else setDismissY(0)
    }
  }

  const zoomed = view.s > 1.02
  const pct = Math.round(view.s * 100)
  const bg = 1 - Math.min(Math.abs(dismissY) / 420, 0.6)
  const stageW = stageRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1000)

  return createPortal(
    <div
      ref={rootRef}
      className={'lb' + (closing ? ' closing' : '') + (zoomed ? ' is-zoomed' : '')}
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} — ${t('image')} ${index + 1} ${t('of')} ${items.length}`}
      tabIndex={-1}
    >
      <div className="lb-bg" style={{ opacity: closing ? undefined : bg }} />

      <header className="lb-head">
        <div className="lb-cap">
          {item.sub && <span className="lb-sub">{item.sub}</span>}
          <h2 className="lb-title">{item.title}</h2>
        </div>
        <button type="button" className="lb-round lb-close" onClick={requestClose} aria-label={t('Close')}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
        </button>
      </header>

      <div
        ref={stageRef}
        className={'lb-stage' + (zoomed ? ' zoomed' : '') + (dragging ? ' grabbing' : '')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        style={{
          transform: dismissY ? `translate3d(0, ${dismissY}px, 0) scale(${1 - Math.min(Math.abs(dismissY) / 1800, 0.12)})` : undefined,
          transition: dragging ? 'none' : `transform .5s ${EASE}`,
        }}
      >
        <div className={'lb-track' + (dragging ? ' nodrag' : '')} style={{ transform: `translate3d(calc(${-index * 100}% + ${drag}px), 0, 0)` }}>
          {items.map((it, i) => {
            const near = Math.abs(i - index) <= 1
            const active = i === index
            const k = Math.min(1, Math.abs(i - index + drag / stageW))
            return (
              <div className="lb-slide" key={it.src + i} aria-hidden={!active}>
                <div
                  className="lb-pop"
                  style={{
                    transform: `scale(${1 - 0.1 * k})`,
                    opacity: 1 - 0.55 * k,
                    transition: dragging ? 'none' : `transform .6s ${EASE}, opacity .6s ${EASE}`,
                  }}
                >
                  {near && (
                    <div
                      className="lb-fly"
                      ref={(el) => {
                        flyRefs.current[i] = el
                      }}
                    >
                      <div className="lb-zoom" style={active ? { transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})` } : undefined}>
                        <img
                          ref={(el) => {
                            imgRefs.current[i] = el
                          }}
                          src={fullReady[it.src] || it.src === it.thumb ? it.src : it.thumb}
                          alt={`${it.title} — ${t('image')} ${i + 1}`}
                          draggable={false}
                          className={loaded[i] ? 'ready' : ''}
                          style={{ ['--ar' as string]: ratios[i] ?? 1.4 }}
                          onLoad={(e) => {
                            const { naturalWidth: w, naturalHeight: h } = e.currentTarget
                            if (w && h) setRatios((r) => (Math.abs((r[i] ?? 0) - w / h) < 0.001 ? r : { ...r, [i]: w / h }))
                            setLoaded((l) => (l[i] ? l : { ...l, [i]: true }))
                          }}
                        />
                        {!loaded[i] && <span className="lb-spin" aria-hidden="true" />}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <button type="button" className="lb-round lb-nav lb-prev" onClick={() => go(-1)} disabled={index === 0} aria-label={t('Previous image')}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5" /></svg>
      </button>
      <button type="button" className="lb-round lb-nav lb-next" onClick={() => go(1)} disabled={index === items.length - 1} aria-label={t('Next image')}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5" /></svg>
      </button>

      <div className="lb-dock">
        <p className="lb-tip" aria-hidden="true">
          <span className="lb-tip-mouse">{t('Scroll to zoom · ← → to browse')}</span>
          <span className="lb-tip-touch">{t('Pinch to zoom · swipe to browse')}</span>
        </p>
        <div className="lb-pill">
          <div className="lb-dots" role="group" aria-label={`${item.title}: ${t('image')} ${index + 1} ${t('of')} ${items.length}`}>
            {groupItems.map(({ it, i }) => (
              <button
                type="button"
                key={it.src + i}
                className={'lb-dot' + (i === index ? ' on' : '')}
                onClick={() => onIndexChange(i)}
                aria-label={`${t('Show image')} ${i + 1}`}
                aria-current={i === index}
              />
            ))}
          </div>
          <span className="lb-sep" aria-hidden="true" />
          <button type="button" className="lb-tool" onClick={() => zoomAt(tgtRef.current.s / STEP, 0, 0)} disabled={!zoomed} aria-label={t('Zoom out')}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 12h12" /></svg>
          </button>
          <button type="button" className="lb-tool" onClick={() => zoomAt(tgtRef.current.s * STEP, 0, 0)} disabled={view.s >= MAX - 0.01} aria-label={t('Zoom in')}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 12h12M12 6v12" /></svg>
          </button>
          <button type="button" className={'lb-pct' + (zoomed ? ' on' : '')} onClick={() => animateTo(FIT)} tabIndex={zoomed ? 0 : -1} aria-label={t('Reset zoom')}>
            {pct}%
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
