# NSDC — Coming Soon

National Student Data Corps teaser page. Cinematic full-screen particle
data-globe (Three.js) behind a minimal `COMING SOON` overlay with loader
and social links. This page will grow into the full NSDC hub — intros,
achievements, projects, event registration.

## Stack

- Vite 6 + React 19 + TypeScript (strict)
- Tailwind CSS 3
- Three.js (raw, custom globe shaders — no R3F)
- GSAP (entrance timeline)
- Inline brand SVGs (Instagram / LinkedIn / Discord)

## Scripts

- `npm run dev` — start local dev server
- `npm run build` — typecheck + production build
- `npm run preview` — preview the production build

## Structure

- `src/three/DataGlobe.ts` — particle globe engine
  (`constructor(canvas)` / `setProgress(0..1)` / `setRevealed(bool)` / `dispose()`)
- `src/components/Hero.tsx` — canvas + overlay + loader orchestration
- `src/components/Loader.tsx` — progress bar + %
- `src/components/Socials.tsx` — real social links
- `public/nsdc_logo.png` — club logo (favicon source)
- `src/index.css` — vignette, grain, glow, motion prefs

## Socials

- Instagram: https://www.instagram.com/nsdc_avvb/
- LinkedIn: https://www.linkedin.com/company/nsdc-avv-b
- Discord: https://discord.gg/XeGgzAu93Z

## Notes

- Globe: ~10k shader points desktop / 4.5k mobile, DPR capped at 2,
  `prefers-reduced-motion` renders a static frame, no-WebGL falls back
  to a static gradient.
- Loader enforces a ~1.8s minimum for the reveal drama, gated on real
  font/asset readiness.
- To update the tagline, edit the copy in `src/components/Hero.tsx`.
