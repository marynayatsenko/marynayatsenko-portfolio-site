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

## Structure

- `src/pages/Home.tsx` — hero + project cards (decorative icons are positioned from measurements of the original, with hover motion on desktop).
- `src/pages/CasePage.tsx`, `src/pages/Gallery.tsx` — render `src/data/pages.json` through `components/BlockRenderer.tsx`.
- `src/data/*.json` — page content/layout exported from the Framer site (desktop + mobile layouts).
- `src/styles/` — `base.css` (fonts), `layout.css` (layout/breakpoints), `*-gen.css` (generated text styles and card decor positions).
- `public/assets/` — images (WebP), SVG icons, Satoshi font files.

Breakpoints follow Framer: desktop ≥ 1200px, tablet 810–1199px, mobile < 810px.
