import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type LightboxItem = {
  /** full-resolution image shown in the viewer */
  src: string
  /** small version (already cached from the page) used as placeholder and in the strip */
  thumb: string
  title: string
  sub?: string
  /** items sharing a group id are shown together in the thumbnail strip */
  group: number
}

type View = { s: number; x: number; y: number }

const MIN = 1
const MAX = 8
const KEY_STEP = 1.25
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

type Props = {
  items: LightboxItem[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}

export default function Lightbox({ items, index, onIndexChange, onClose }: Props) {
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 })
  const [smooth, setSmooth] = useState(true)
  const [drag, setDrag] = useState(0)
  const [dismissY, setDismissY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [loaded, setLoaded] = useState<Record<number, boolean>>({})
  const [ratios, setRatios] = useState<Record<number, number>>({})
  const [fullReady, setFullReady] = useState<Record<string, boolean>>({})

  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRefs = useRef<(HTMLImageElement | null)[]>([])
  const stripRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const viewRef = useRef(view)
  viewRef.current = view
  const indexRef = useRef(index)
  indexRef.current = index
  const gesture = useRef({
    kind: 'none' as 'none' | 'one' | 'pinch',
    sx: 0,
    sy: 0,
    vx: 0,
    vy: 0,
    t0: 0,
    moved: false,
    axis: '' as '' | 'x' | 'y',
    d0: 0,
    s0: 1,
    mx0: 0,
    my0: 0,
    dx: 0,
    dy: 0,
  })
  const lastTap = useRef({ t: 0, x: 0, y: 0 })

  const item = items[index]
  const groupItems = items.map((it, i) => ({ it, i })).filter(({ it }) => it.group === item.group)

  /* ---------- geometry helpers ---------- */
  const stageSize = () => {
    const r = stageRef.current?.getBoundingClientRect()
    return { w: r?.width ?? window.innerWidth, h: r?.height ?? window.innerHeight, left: r?.left ?? 0, top: r?.top ?? 0 }
  }

  const clampView = useCallback((s: number, x: number, y: number): View => {
    s = clamp(s, MIN, MAX)
    if (s <= MIN + 0.001) return { s: MIN, x: 0, y: 0 }
    const st = stageRef.current?.getBoundingClientRect()
    const img = imgRefs.current[indexRef.current]
    const w = (img?.offsetWidth ?? st?.width ?? 0) * s
    const h = (img?.offsetHeight ?? st?.height ?? 0) * s
    const mx = Math.max(0, (w - (st?.width ?? 0)) / 2)
    const my = Math.max(0, (h - (st?.height ?? 0)) / 2)
    return { s, x: clamp(x, -mx, mx), y: clamp(y, -my, my) }
  }, [])

  /** zoom to scale `ns` keeping the point (cx, cy) — relative to the stage centre — fixed */
  const zoomAt = useCallback(
    (ns: number, cx: number, cy: number, animate: boolean) => {
      const v = viewRef.current
      ns = clamp(ns, MIN, MAX)
      const k = ns / v.s
      setSmooth(animate)
      setView(clampView(ns, cx - (cx - v.x) * k, cy - (cy - v.y) * k))
    },
    [clampView],
  )

  const reset = useCallback(() => {
    setSmooth(true)
    setView({ s: 1, x: 0, y: 0 })
  }, [])

  const actualSize = useCallback(() => {
    const img = imgRefs.current[indexRef.current]
    if (!img || !img.offsetWidth) return
    zoomAt(Math.max(1, img.naturalWidth / img.offsetWidth), 0, 0, true)
  }, [zoomAt])

  const go = useCallback(
    (d: number) => {
      const ni = indexRef.current + d
      if (ni < 0 || ni >= items.length) return
      onIndexChange(ni)
    },
    [items.length, onIndexChange],
  )

  /* preload the full-resolution image for the current slide and its neighbours */
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

  /* new slide -> reset zoom */
  useEffect(() => {
    setSmooth(false)
    setView({ s: 1, x: 0, y: 0 })
    setDrag(0)
    setDismissY(0)
  }, [index])

  /* keep active thumbnail in view */
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [index])

  /* ---------- body scroll lock + focus ---------- */
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const sbw = window.innerWidth - document.documentElement.clientWidth
    const prevOverflow = document.body.style.overflow
    const prevPad = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`
    rootRef.current?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPad
      prevFocus?.focus?.()
    }
  }, [])

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key
      const mod = e.ctrlKey || e.metaKey
      if (k === 'Escape') {
        e.preventDefault()
        onClose()
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
        zoomAt(viewRef.current.s * KEY_STEP, 0, 0, true)
      } else if (k === '-' || k === '_' || e.code === 'NumpadSubtract') {
        e.preventDefault()
        zoomAt(viewRef.current.s / KEY_STEP, 0, 0, true)
      } else if ((k === '0' || e.code === 'Numpad0') && !e.shiftKey) {
        e.preventDefault()
        reset()
      } else if (k === '1' && !mod) {
        e.preventDefault()
        actualSize()
      } else if ((k === 'ArrowUp' || k === 'ArrowDown') && viewRef.current.s > 1) {
        e.preventDefault()
        const v = viewRef.current
        setSmooth(true)
        setView(clampView(v.s, v.x, v.y + (k === 'ArrowUp' ? 80 : -80)))
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
  }, [actualSize, clampView, go, items.length, onClose, onIndexChange, reset, zoomAt])

  /* ---------- wheel / trackpad pinch (needs a non-passive listener) ---------- */
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const st = stageSize()
      const cx = e.clientX - st.left - st.w / 2
      const cy = e.clientY - st.top - st.h / 2
      const unit = e.deltaMode === 1 ? 16 : 1
      const speed = e.ctrlKey ? 0.012 : 0.0016
      zoomAt(viewRef.current.s * Math.exp(-e.deltaY * unit * speed), cx, cy, false)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomAt])

  /* ---------- pointer gestures: pan, pinch, swipe, double-tap ---------- */
  const rel = (x: number, y: number) => {
    const st = stageSize()
    return { x: x - st.left - st.w / 2, y: y - st.top - st.h / 2 }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    setSmooth(false)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const m = rel((a.x + b.x) / 2, (a.y + b.y) / 2)
      Object.assign(g, {
        kind: 'pinch',
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        s0: viewRef.current.s,
        vx: viewRef.current.x,
        vy: viewRef.current.y,
        mx0: m.x,
        my0: m.y,
        moved: true,
        axis: '',
      })
      setDrag(0)
      setDismissY(0)
      setDragging(false)
    } else {
      Object.assign(g, {
        kind: 'one',
        sx: e.clientX,
        sy: e.clientY,
        vx: viewRef.current.x,
        vy: viewRef.current.y,
        t0: performance.now(),
        moved: false,
        axis: '',
        dx: 0,
        dy: 0,
      })
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const m = rel((a.x + b.x) / 2, (a.y + b.y) / 2)
      const ns = clamp(g.s0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0), MIN * 0.85, MAX)
      const k = ns / g.s0
      const nx = m.x - (g.mx0 - g.vx) * k
      const ny = m.y - (g.my0 - g.vy) * k
      // allow a little rubber-band below 1x while pinching; settled on release
      setView(ns < MIN ? { s: ns, x: 0, y: 0 } : clampView(ns, nx, ny))
      return
    }
    if (g.kind !== 'one') return
    const dx = e.clientX - g.sx
    const dy = e.clientY - g.sy
    g.dx = dx
    g.dy = dy
    if (!g.moved && Math.hypot(dx, dy) > 6) g.moved = true
    if (!g.moved) return
    if (viewRef.current.s > 1) {
      setView(clampView(viewRef.current.s, g.vx + dx, g.vy + dy))
      setDragging(true)
      return
    }
    if (!g.axis) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    setDragging(true)
    if (g.axis === 'x') setDrag(dx)
    else setDismissY(dy)
  }

  const endPointer = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    setDragging(false)

    if (g.kind === 'pinch') {
      if (pointers.current.size === 1) {
        // continue as a one-finger pan from the remaining pointer
        const [p] = [...pointers.current.values()]
        Object.assign(g, { kind: 'one', sx: p.x, sy: p.y, vx: viewRef.current.x, vy: viewRef.current.y, t0: performance.now(), moved: true, axis: '' })
      } else {
        g.kind = 'none'
      }
      if (viewRef.current.s < MIN) reset()
      else if (pointers.current.size === 0) setSmooth(true)
      return
    }
    if (g.kind !== 'one') return
    g.kind = 'none'
    setSmooth(true)
    const st = stageSize()

    if (!g.moved) {
      // tap: double-tap toggles zoom, tap on the dark backdrop closes
      const now = performance.now()
      const lt = lastTap.current
      const isOnImage = (e.target as HTMLElement).tagName === 'IMG'
      if (now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
        const p = rel(e.clientX, e.clientY)
        if (viewRef.current.s > 1.05) reset()
        else zoomAt(2.5, p.x, p.y, true)
        lastTap.current = { t: 0, x: 0, y: 0 }
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY }
        if (!isOnImage && viewRef.current.s <= 1.05) {
          window.setTimeout(() => {
            if (lastTap.current.t === now) onClose()
          }, 330)
        }
      }
      return
    }

    if (viewRef.current.s > 1) return
    const dt = Math.max(1, performance.now() - g.t0)
    if (g.axis === 'x') {
      const v = g.dx / dt
      if (Math.abs(g.dx) > st.w * 0.18 || Math.abs(v) > 0.5) {
        const dir = g.dx < 0 ? 1 : -1
        const ni = indexRef.current + dir
        if (ni >= 0 && ni < items.length) {
          setDrag(0)
          onIndexChange(ni)
          return
        }
      }
      setDrag(0)
    } else if (g.axis === 'y') {
      if (Math.abs(g.dy) > 110 || Math.abs(g.dy / dt) > 0.6) onClose()
      else setDismissY(0)
    }
  }

  const pct = Math.round(view.s * 100)
  const backdropOpacity = 1 - Math.min(Math.abs(dismissY) / 420, 0.55)
  const canZoomOut = view.s > MIN + 0.001
  const canZoomIn = view.s < MAX - 0.001

  return createPortal(
    <div
      ref={rootRef}
      className="lb"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} — image ${index + 1} of ${items.length}`}
      tabIndex={-1}
      style={{ ['--lb-bg' as string]: backdropOpacity }}
    >
      <div className="lb-top">
        <div className="lb-cap">
          {item.sub && <span className="lb-sub">{item.sub}</span>}
          <span className="lb-title">{item.title}</span>
        </div>
        <div className="lb-tools">
          <button type="button" className="lb-btn" onClick={() => zoomAt(viewRef.current.s / KEY_STEP, 0, 0, true)} disabled={!canZoomOut} aria-label="Zoom out (−)">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12h14" /></svg>
          </button>
          <button type="button" className="lb-zoomval" onClick={reset} aria-label="Reset zoom (0)">
            {pct}%
          </button>
          <button type="button" className="lb-btn" onClick={() => zoomAt(viewRef.current.s * KEY_STEP, 0, 0, true)} disabled={!canZoomIn} aria-label="Zoom in (+)">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
          </button>
          <span className="lb-count" aria-live="polite">
            {index + 1} / {items.length}
          </span>
          <button type="button" className="lb-btn lb-close" onClick={onClose} aria-label="Close (Esc)">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={'lb-stage' + (view.s > 1 ? ' zoomed' : '') + (dragging ? ' grabbing' : '')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        style={{ transform: dismissY ? `translate3d(0, ${dismissY}px, 0)` : undefined, opacity: dismissY ? backdropOpacity : undefined }}
      >
        <div
          className={'lb-track' + (dragging ? ' nodrag' : '')}
          style={{ transform: `translate3d(calc(${-index * 100}% + ${drag}px), 0, 0)` }}
        >
          {items.map((it, i) => {
            const near = Math.abs(i - index) <= 1
            const active = i === index
            return (
              <div className="lb-slide" key={it.src + i} aria-hidden={!active}>
                {near && (
                  <div
                    className="lb-zoom"
                    style={
                      active
                        ? {
                            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})`,
                            transition: smooth && !dragging ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none',
                          }
                        : undefined
                    }
                  >
                    <img
                      ref={(el) => {
                        imgRefs.current[i] = el
                      }}
                      src={fullReady[it.src] || it.src === it.thumb ? it.src : it.thumb}
                      alt={`${it.title} — image ${i + 1}`}
                      draggable={false}
                      className={loaded[i] ? 'ready' : ''}
                      style={{ ['--ar' as string]: ratios[i] ?? 1.4 }}
                      onLoad={(e) => {
                        const { naturalWidth: w, naturalHeight: h } = e.currentTarget
                        if (w && h) setRatios((r) => (r[i] === w / h ? r : { ...r, [i]: w / h }))
                        setLoaded((l) => (l[i] ? l : { ...l, [i]: true }))
                      }}
                      onDoubleClick={(e) => e.preventDefault()}
                    />
                    {!loaded[i] && <span className="lb-spin" aria-hidden="true" />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <button type="button" className="lb-nav lb-prev" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous image (←)">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <button type="button" className="lb-nav lb-next" onClick={() => go(1)} disabled={index === items.length - 1} aria-label="Next image (→)">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>

      <div className="lb-bottom">
        <div className="lb-strip" ref={stripRef}>
          {groupItems.map(({ it, i }) => (
            <button
              type="button"
              key={it.src + i}
              className="lb-thumb"
              data-active={i === index}
              onClick={() => onIndexChange(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
            >
              <img src={it.thumb} alt="" loading="lazy" decoding="async" draggable={false} />
            </button>
          ))}
        </div>
        <p className="lb-hint">
          <kbd>←</kbd> <kbd>→</kbd> browse · <kbd>+</kbd> <kbd>−</kbd> zoom · <kbd>0</kbd> fit · <kbd>1</kbd> actual size · scroll / pinch / double-click to zoom · drag to move · <kbd>Esc</kbd> close
        </p>
      </div>
    </div>,
    document.body,
  )
}
