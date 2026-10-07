# Maryna Yatsenko — portfolio

Product UX/UI design portfolio, migrated from Framer to a static React + Vite site that deploys on Vercel.

Pages: `/` (home), `/ui-gallery`, `/case-admin-system`, `/case-claim-statement`, `/massage-chair`.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

## Deploy on Vercel

1. Vercel → **Add New… → Project** → import this GitHub repository.
2. Framework preset is detected as **Vite** (build `npm run build`, output `dist`). No env vars needed.
3. Deploy. `vercel.json` rewrites every path to `index.html` so client-side routes work on refresh.
4. Domain: Project → **Settings → Domains** to attach a custom domain.

The Vercel *production branch* is configured under Settings → Git (merge to it to publish).

## Gallery viewer

Clicking a screen in `/ui-gallery` opens a full-screen carousel (`src/components/Lightbox.tsx`):

- `←` `→` / `PageUp` `PageDown` / `Home` `End` or swipe to browse, `Esc`, a tap on the backdrop or a swipe down to close
- `+` `−` (hold to keep zooming), `0` fit, `1` actual size; mouse wheel / trackpad / pinch to zoom, double-click or double-tap to toggle, drag to move
- 3D cover-flow carousel: the centre picture is flat, neighbours tilt back in perspective; position is driven by a spring (drag follows the finger, fast flicks spin across several pictures, soft resistance at the ends)
- a thumbnail strip at the bottom glides in sync with the carousel (click a thumbnail or a side picture to jump)
- the picture flies out of its thumbnail and back; zoom/pan glide with inertia
- the grid uses light 1100px images; the viewer loads the full-resolution ones from `public/assets/img/full/`

## Languages (EN / UA)

The selector (globe · code · chevron → dropdown card with a check mark) sits in the floating nav (home, gallery) and top-right on the case pages; it opens upwards when the nav is at the bottom of the screen and is keyboard accessible (↑ ↓ Enter Esc). The choice is remembered in `localStorage`; the first visit follows the browser language. English is the source text; Ukrainian lives in `src/i18n/uk-content.json` (page content, keyed by the English string) and `src/i18n/ui.ts` (interface). Every translated text renders both versions in one grid cell (`components/Bi.tsx`) and shows only the active one, so the layout is pixel-identical in EN and UA and nothing moves when the language is switched (English pages therefore keep a little spare room under paragraphs that are longer in Ukrainian). To add or fix a translation, edit the value next to its English key. Cyrillic is rendered with Manrope (Satoshi has no Cyrillic glyphs).

## Structure

- `src/pages/Home.tsx` — hero + project cards (decorative icons are positioned from measurements of the original, with hover motion on desktop).
- `src/pages/CasePage.tsx`, `src/pages/Gallery.tsx` — render `src/data/pages.json` through `components/BlockRenderer.tsx`.
- `src/data/*.json` — page content/layout exported from the Framer site (desktop + mobile layouts).
- `src/styles/` — `base.css` (fonts), `layout.css` (layout/breakpoints), `*-gen.css` (generated text styles and card decor positions).
- `public/assets/` — images (WebP), SVG icons, Satoshi font files.

Breakpoints follow Framer: desktop ≥ 1200px, tablet 810–1199px, mobile < 810px.
