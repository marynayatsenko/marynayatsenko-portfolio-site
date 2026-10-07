import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'

export type LightboxItem = {
  /** full-resolution image shown in the viewer */
  src: string
  /** small version (already cached from the page) used as placeholder and in the strip */
  thumb: string
  /** width / height of the image */
  ratio: number
  title: string
  sub?: string
  /** items sharing a group id belong to one project */
  group: number
}

type View = { s: number; x: number; y: number }

const MIN = 1
const MAX = 8
const STEP = 1.25
const FIT: View = { s: 1, x: 0, y: 0 }
/** iOS-like deceleration curve used for the fly-in / fly-out of the picture */
const EASE = 'cubic-bezier(.32,.72,0,1)'
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* thumbnail strip geometry */
const THUMB_W = 88
const THUMB_GAP = 10
const GROUP_GAP = 22

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
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([])
  const stripRef = useRef<HTMLDivElement>(null)
  const stripInRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())

  /* zoom engine (eased towards a target) */
  const curRef = useRef<View>(FIT)
  const tgtRef = useRef<View>(FIT)
  const raf = useRef(0)
  const lastT = useRef(0)

  /* carousel position engine (spring) — position is measured in slides */
  const posRef = useRef(index)
  const posTgt = useRef(index)
  const posVel = useRef(0)
  const posRaf = useRef(0)
  const posLast = useRef(0)
  const stageW = useRef(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const wheelSettle = useRef(0)

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
    slide: -1,
    pos0: 0,
    d0: 1, s0: 1, mx0: 0, my0: 0,
  })

  const item = items[index]
  const last = items.length - 1

  /* thumbnail positions (left edge of every thumb inside the strip) */
  const offsets = useMemo(() => {
    const out: number[] = []
    let x = 0
    items.forEach((it, i) => {
      if (i > 0) x += THUMB_GAP + (it.group !== items[i - 1].group ? GROUP_GAP : 0)
      out.push(x)
      x += THUMB_W
    })
    return out
  }, [items])

  /* ---------- 3D cover-flow layout, written straight to the DOM every frame ---------- */
  const applyLayout = useCallback(
    (pos: number) => {
      const W = stageW.current
      const small = W < 810
      const K = W * (small ? 0.76 : 0.34)
      const angle = small ? 30 : 34
      for (let i = 0; i < items.length; i++) {
        const el = slideRefs.current[i]
        if (!el) continue
        const o = i - pos
        const ao = Math.abs(o)
        if (ao > 2.6) {
          el.style.visibility = 'hidden'
          continue
        }
        const near = Math.min(ao, 1)
        const far = clamp(ao - 1, 0, 1)
        const x = Math.sign(o) * (near * K + far * K * 0.5)
        const rot = clamp(o, -1, 1) * angle
        const z = -(near * 150 + far * 120)
        const sc = 1 - near * 0.1 - far * 0.07
        const op = ao <= 1 ? 1 - ao * 0.1 : Math.max(0, 0.9 - (ao - 1) * 1.0)
        el.style.visibility = 'visible'
        el.style.transform = `translate3d(${x.toFixed(2)}px,0,${z.toFixed(1)}px) rotateY(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`
        el.style.opacity = op.toFixed(3)
        el.style.zIndex = String(100 - Math.round(ao * 10))
      }
      // thumbnail strip glides in sync with the carousel
      const strip = stripRef.current
      const inner = stripInRef.current
      if (strip && inner && items.length) {
        const p = clamp(pos, 0, last)
        const lo = Math.floor(p)
        const hi = Math.min(last, lo + 1)
        const f = p - lo
        const center = offsets[lo] + (offsets[hi] - offsets[lo]) * f + THUMB_W / 2
        inner.style.transform = `translate3d(${(strip.clientWidth / 2 - center).toFixed(2)}px,0,0)`
        for (let i = 0; i < items.length; i++) {
          const th = thumbRefs.current[i]
          if (!th) continue
          const a = 1 - Math.min(Math.abs(i - pos), 1)
          th.style.transform = `scale(${(1 + 0.14 * a).toFixed(3)})`
          th.style.opacity = (0.5 + 0.5 * a).toFixed(3)
        }
      }
    },
    [items.length, last, offsets],
  )

  const springStep = useCallback(
    (now: number) => {
      let dt = Math.min(0.05, (now - posLast.current) / 1000 || 0.016)
      posLast.current = now
      const k = 190
      const c = 27
      const h = 1 / 240
      let x = posRef.current
      let v = posVel.current
      const tgt = posTgt.current
      while (dt > 0) {
        const s = Math.min(h, dt)
        v += (-k * (x - tgt) - c * v) * s
        x += v * s
        dt -= s
      }
      const done = Math.abs(x - tgt) < 0.0006 && Math.abs(v) < 0.004
      posRef.current = done ? tgt : x
      posVel.current = done ? 0 : v
      applyLayout(posRef.current)
      posRaf.current = done ? 0 : requestAnimationFrame(springStep)
    },
    [applyLayout],
  )
  const moveTo = useCallback(
    (target: number) => {
      posTgt.current = target
      if (reducedMotion()) {
        cancelAnimationFrame(posRaf.current)
        posRaf.current = 0
        posRef.current = target
        posVel.current = 0
        applyLayout(target)
        return
      }
      if (!posRaf.current) {
        posLast.current = performance.now()
        posRaf.current = requestAnimationFrame(springStep)
      }
    },
    [applyLayout, springStep],
  )
  const setPosDirect = useCallback(
    (p: number) => {
      cancelAnimationFrame(posRaf.current)
      posRaf.current = 0
      posRef.current = p
      posTgt.current = p
      posVel.current = 0
      applyLayout(p)
    },
    [applyLayout],
  )
  useEffect(() => () => cancelAnimationFrame(posRaf.current), [])

  /* first layout before paint + keep widths fresh */
  useLayoutEffect(() => {
    stageW.current = stageRef.current?.clientWidth || window.innerWidth
    applyLayout(posRef.current)
    const ro = new ResizeObserver(() => {
      stageW.current = stageRef.current?.clientWidth || window.innerWidth
      applyLayout(posRef.current)
    })
    if (stageRef.current) ro.observe(stageRef.current)
    return () => ro.disconnect()
  }, [applyLayout])

  /* slide changed from outside (keys, arrows, thumbnails, release of a swipe) → spring there */
  useEffect(() => {
    moveTo(index)
  }, [index, moveTo])

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
    const tg = tgtRef.current
    const n = { s: c.s + (tg.s - c.s) * f, x: c.x + (tg.x - c.x) * f, y: c.y + (tg.y - c.y) * f }
    const done = Math.abs(tg.s - n.s) < 0.002 && Math.abs(tg.x - n.x) < 0.25 && Math.abs(tg.y - n.y) < 0.25
    commit(done ? tg : n)
    raf.current = done ? 0 : requestAnimationFrame(step)
  }, [])
  const animateTo = useCallback(
    (tg: View) => {
      tgtRef.current = tg
      if (reducedMotion()) {
        cancelAnimationFrame(raf.current)
        raf.current = 0
        commit(tg)
        return
      }
      if (!raf.current) {
        lastT.current = performance.now()
        raf.current = requestAnimationFrame(step)
      }
    },
    [step],
  )
  const jumpTo = useCallback((tg: View) => {
    cancelAnimationFrame(raf.current)
    raf.current = 0
    tgtRef.current = tg
    commit(tg)
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
      const tg = tgtRef.current
      ns = clamp(ns, MIN, MAX)
      const k = ns / tg.s
      const next = clampView(ns, cx - (cx - tg.x) * k, cy - (cy - tg.y) * k)
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
      const a = fly.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx}px,${dy}px) scale(${s})` }], { duration: 480, easing: EASE, fill: 'forwards' })
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
    const r = (imgRefs.current[index] ?? fly).getBoundingClientRect()
    const s = origin.width / r.width
    const dx = origin.left + origin.width / 2 - (r.left + r.width / 2)
    const dy = origin.top + origin.height / 2 - (r.top + r.height / 2)
    fly.animate([{ transform: `translate(${dx}px,${dy}px) scale(${s})` }, { transform: 'translate(0,0) scale(1)' }], { duration: 640, easing: EASE, fill: 'backwards' })
    imgRefs.current[index]?.animate([{ borderRadius: `${6 / s}px` }, { borderRadius: '16px' }], { duration: 640, easing: EASE, fill: 'backwards' })
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
        const tg = tgtRef.current
        animateTo(clampView(tg.s, tg.x, tg.y + (k === 'ArrowUp' ? 90 : -90)))
      } else if (k === 'Tab') {
        const f = rootRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
        if (!f || !f.length) return
        const first = f[0]
        const lastEl = f[f.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === rootRef.current)) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actualSize, animateTo, clampView, go, items.length, onIndexChange, requestClose, zoomAt])

  /* ---------- wheel: zoom (mouse) · sideways trackpad swipe browses ---------- */
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : 1
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2 && curRef.current.s <= 1.02) {
        const K = stageW.current * (stageW.current < 810 ? 0.76 : 0.34)
        const p = clamp(posRef.current + (e.deltaX * unit) / (K * 1.1), -0.3, last + 0.3)
        setPosDirect(p)
        window.clearTimeout(wheelSettle.current)
        wheelSettle.current = window.setTimeout(() => {
          const ni = clamp(Math.round(posRef.current), 0, last)
          if (ni !== indexRef.current) onIndexChange(ni)
          else moveTo(ni)
        }, 110)
        return
      }
      const st = el.getBoundingClientRect()
      const cx = e.clientX - st.left - st.width / 2
      const cy = e.clientY - st.top - st.height / 2
      const speed = e.ctrlKey ? 0.012 : 0.0017
      zoomAt(tgtRef.current.s * Math.exp(-e.deltaY * unit * speed), cx, cy)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [last, moveTo, onIndexChange, setPosDirect, zoomAt])

  /* ---------- pointer gestures: pan (with inertia), pinch, swipe, double-tap ---------- */
  const rel = (x: number, y: number) => {
    const st = stageRect()
    return { x: x - (st?.left ?? 0) - (st?.width ?? 0) / 2, y: y - (st?.top ?? 0) - (st?.height ?? 0) / 2 }
  }
  const unitPx = () => stageW.current * (stageW.current < 810 ? 0.76 : 0.34) * 0.95

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
      setDismissY(0)
      setDragging(false)
      if (Math.abs(posRef.current - indexRef.current) > 0.001) moveTo(indexRef.current)
    } else {
      const slide = Number((e.target as HTMLElement).closest<HTMLElement>('.lb-slide')?.dataset.i ?? -1)
      Object.assign(g.current, {
        kind: 'one', sx: e.clientX, sy: e.clientY, vx: c.x, vy: c.y, t0: performance.now(), dx: 0, dy: 0, moved: false, axis: '',
        onImage: (e.target as HTMLElement).tagName === 'IMG', slide, pos0: posRef.current,
      })
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
      // the carousel follows the finger 1:1, with a soft resistance past the ends
      let p = s.pos0 - dx / unitPx()
      if (p < 0) p *= 0.35
      if (p > last) p = last + (p - last) * 0.35
      setPosDirect(p)
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

    if (!s.moved) {
      // tap: a neighbour comes to the front, double-tap zooms, a tap on the backdrop closes
      const now = performance.now()
      const lt = lastTap.current
      if (s.onImage && s.slide >= 0 && s.slide !== indexRef.current) {
        onIndexChange(s.slide)
        lastTap.current = { t: 0, x: 0, y: 0 }
        return
      }
      if (now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
        const p = rel(e.clientX, e.clientY)
        if (tgtRef.current.s > 1.05) animateTo(FIT)
        else zoomAt(2.5, p.x, p.y)
        lastTap.current = { t: 0, x: 0, y: 0 }
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY }
        if (!s.onImage && curRef.current.s <= 1.05) {
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

    if (s.axis === 'x') {
      // a fast flick can travel across several pictures, like a spinning wheel
      const vUnits = -vel.current.x / unitPx() // slides per ms
      const projected = posRef.current + vUnits * 170
      const target = clamp(Math.round(projected), Math.max(0, indexRef.current - 4), Math.min(last, indexRef.current + 4))
      posVel.current = vUnits * 1000
      if (target !== indexRef.current) onIndexChange(target)
      else moveTo(indexRef.current)
    } else if (s.axis === 'y') {
      const dt = Math.max(1, performance.now() - s.t0)
      if (Math.abs(s.dy) > 110 || Math.abs(s.dy / dt) > 0.6) requestClose()
      else setDismissY(0)
    }
  }

  const zoomed = view.s > 1.02
  const pct = Math.round(view.s * 100)
  const bg = 1 - Math.min(Math.abs(dismissY) / 420, 0.6)

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
        {items.map((it, i) => {
          const active = i === index
          const near = Math.abs(i - index) <= 3
          return (
            <div
              className={'lb-slide' + (active ? ' on' : '')}
              key={it.src + i}
              data-i={i}
              aria-hidden={!active}
              ref={(el) => {
                slideRefs.current[i] = el
              }}
            >
              <div className="lb-veil">
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

      <button type="button" className="lb-round lb-nav lb-prev" onClick={() => go(-1)} disabled={index === 0} aria-label={t('Previous image')}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5" /></svg>
      </button>
      <button type="button" className="lb-round lb-nav lb-next" onClick={() => go(1)} disabled={index === last} aria-label={t('Next image')}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5" /></svg>
      </button>

      <div className="lb-foot">
        <p className="lb-tip" aria-hidden="true">
          <span className="lb-tip-mouse">{t('Scroll to zoom · ← → to browse')}</span>
          <span className="lb-tip-touch">{t('Pinch to zoom · swipe to browse')}</span>
        </p>
        <div className="lb-count" aria-live="polite">
          <b>{index + 1}</b>
          <span> / {items.length}</span>
        </div>
        <div className="lb-strip" ref={stripRef}>
          <div className="lb-strip-in" ref={stripInRef} style={{ width: offsets[last] + THUMB_W }}>
            {items.map((it, i) => (
              <button
                type="button"
                key={it.src + i}
                ref={(el) => {
                  thumbRefs.current[i] = el
                }}
                className={'lb-thumb' + (i === index ? ' on' : '')}
                style={{ left: offsets[i], width: THUMB_W }}
                onClick={() => onIndexChange(i)}
                aria-label={`${t('Show image')} ${i + 1}`}
                aria-current={i === index}
              >
                <img src={it.thumb} alt="" loading="lazy" decoding="async" draggable={false} />
              </button>
            ))}
          </div>
        </div>
        <div className="lb-zoomctl">
          <button type="button" className={'lb-pct' + (zoomed ? ' on' : '')} onClick={() => animateTo(FIT)} tabIndex={zoomed ? 0 : -1} aria-label={t('Reset zoom')}>
            {pct}%
          </button>
          <div className="lb-pill">
            <button type="button" className="lb-tool" onClick={() => zoomAt(tgtRef.current.s / STEP, 0, 0)} disabled={!zoomed} aria-label={t('Zoom out')}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 12h12" /></svg>
            </button>
            <button type="button" className="lb-tool" onClick={() => zoomAt(tgtRef.current.s * STEP, 0, 0)} disabled={view.s >= MAX - 0.01} aria-label={t('Zoom in')}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 12h12M12 6v12" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
