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
- Cloudflare Worker (static assets + notify API) + Workers KV

## Scripts

- `npm run dev` — start local dev server
- `npm run build` — typecheck + production build
- `npm run preview` — preview the production build

## Structure

- `src/three/DataGlobe.ts` — particle globe engine
  (`constructor(canvas)` / `setProgress(0..1)` / `setRevealed(bool)` / `dispose()`)
- `src/components/Hero.tsx` — canvas + overlay + loader orchestration
- `src/components/Loader.tsx` — progress bar + %
- `src/components/NotifyForm.tsx` — launch-list email capture
- `src/components/Socials.tsx` — real social links
- `worker/index.ts` — `POST /api/notify` (validates, dedupes, stores in KV)
- `wrangler.jsonc` — Worker config (assets + `NOTIFY_KV` binding)
- `site/` — full club site app (auth, landing, later phases); builds to
  `dist-site/`
- `public/nsdc_logo.png` — club logo (favicon source)
- `src/index.css` — vignette, grain, glow, motion prefs

## Notify API

- `POST /api/notify` with `{"email": "..."}` → `{"ok":true}` (idempotent;
  duplicates return `{"ok":true,"already":true}`; bad email → 400).
- Signups live in the `NOTIFY_KV` namespace, keys `sub:<lowercased email>`,
  values `{email, ts, ua}`.
- Read them: `npx wrangler kv key list --namespace-id 9b54a4a0c174444e8b64cb7a2a590d47 --remote`

## Auth (staging only — full site)

- `site/` builds to `dist-site/`, served by the `nsdcaseb-staging` worker on
  `preview.nsdcaseb.xyz`. Production apex stays on the teaser.
- Endpoints: register / login / logout / me / forgot-password /
  reset-password / verify-email under `/api/auth/*`, plus `GET /api/admin/_ping`.
- Passwords: PBKDF2-HMAC-SHA256, 100k iterations (the Workers WebCrypto cap —
  higher values throw at runtime), 16B salt; sessions are HttpOnly cookies
  whose sha256 is stored in D1; rate limits in KV (fail-open).
- Local full stack: `npm run build:site`, then `npx wrangler dev -c wrangler.staging.jsonc`.

## Deploy

- Manual: `npm run build && npx wrangler deploy`
- Live at https://nsdcaseb.xyz and https://www.nsdcaseb.xyz (both attached
  as Worker custom domains)

## Staging environment

Production (`nsdcaseb.xyz` / `www.nsdcaseb.xyz`) serves the coming-soon
teaser only and is **not** affected by site development.

The full club site builds from `site/` to `dist-site/` and deploys to a
separate staging worker `nsdcaseb-staging` (host `preview.nsdcaseb.xyz`),
configured by `wrangler.staging.jsonc`.

| Command | What it does |
| --- | --- |
| `npm run dev:site` | Site dev server on :5174, API proxied to :8787 |
| `npx wrangler dev -c wrangler.staging.jsonc` | Full stack locally (builds the site first) |
| `npm run migrate:staging` | Apply D1 migrations to the staging DB |
| `npm run deploy:staging` | Build `dist-site/` and deploy the staging worker |

Migrations live in `worker/db/migrations/` — apply them before the first
deploy.

## Socials

- Instagram: https://www.instagram.com/nsdc_avvb/
- LinkedIn: https://www.linkedin.com/company/nsdc-avv-b
- Discord: https://discord.gg/XeGgzAu93Z

## Notes

- Globe: ~10k shader points desktop / 4.5k mobile, DPR capped at 2,
  `prefers-reduced-motion` renders a static frame, no-WebGL falls back
  to a static gradient.
- Loader enforces a ~3s minimum for the reveal drama, gated on real
  font/asset readiness.
- To update the tagline, edit the copy in `src/components/Hero.tsx`.
