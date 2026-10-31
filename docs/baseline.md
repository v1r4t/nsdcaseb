# Baseline — ink-on-paper preview site

Date: **2026-10-31**. Measured with Node v24.14.0, npm 11.9.0 and Vite 8.3.1
from the repo root with:

```bash
npm run build:site     # vite build -c site/vite.config.ts
```

All sizes below are from that fresh build of the current working tree
(`dist-site/`). This supersedes every earlier baseline in this file. The
preview is still the ink-on-paper system, but the WebGL globe is **back on the
landing page as a lazy-only chunk** — read "Retired architecture" at the end
before quoting any older table.

## Current architecture (`site/`, preview.nsdcaseb.xyz)

### Design language

- **Ink on paper.** Three tones and nothing else: paper `#F2EEE3`, ink
  `#111110`, seal `#B33C1B`. Secondary text is `faint #67635A` / `quiet
  #5F5B53`; the ink footer uses `footer-muted #98968F` / `footer-accent
  #DD7048`. Mid-tones are `color-mix` of these, never a fourth hue.
  Hairline rules use `--hairline`; there are no shadows, and radius is limited
  to 2px on interactive controls. Seal is an accent (≤10% of a viewport), not
  body copy.
- **One ground.** `body` paints paper; pages and sections are transparent.
  `RoomScene` (landing) or `PageScene` (everything else) supplies the drawing.
  `/admin*` gets plain paper with no motif. Light-only — no theme switch.

### Type

| Role | Family | Weights | Files (`public/fonts/`, served at `/fonts/`) |
| --- | --- | --- | --- |
| Display / serif | Bespoke Serif | 400 roman + 400 italic | `bespoke-serif-latin.woff2` 23,664 B; `bespoke-serif-italic-latin.woff2` 24,372 B |
| Body / sans | Switzer | 400 / 500 / 600 | `switzer-latin.woff2` 16,728 B; `switzer-medium-latin.woff2` 19,564 B; `switzer-semibold-latin.woff2` 19,640 B |
| Metadata / mono | Geist Mono | 300–700 variable | `geist-mono-latin.woff2` 23,128 B |

`design/tokens.css` declares the faces with `font-display: swap` and maps
`--font-display`, `--font-serif`, `--font-sans`, `--font-mono`.
`site/index.html` preloads only Bespoke Serif regular and Switzer regular.
Tailwind (`site/tailwind.config.js`) exposes `paper/ink/faint/seal/quiet/
footer-muted/footer-accent`, the same font families, and the kit utilities
`.mono`, `.mono-sm`, `.serif`, `.sans`, `.hairline`, `.wrap`, `.statement`,
`.statement-sm`.

### Scenes and motion

- **Landing `/` — the globe narrative.** `GlobeStory` renders the paper story
  frame and upgrades it to `GlobeNarrative` after an `IntersectionObserver`
  with a 200px `rootMargin`. `GlobeNarrative` imports `three` through
  `site/src/lib/narrative-globe.ts`; the whole module — three included — is
  one lazy chunk. Under `prefers-reduced-motion` the component never mounts
  the engine: it keeps the static `PaperStory` frame, all three stage cards,
  and requests no globe chunk. The canvas is `aria-hidden`, not focusable and
  pointer-transparent; the three stage cards stay in the accessibility tree at
  every scroll progress (their opacity is visual only).
- **Landing `/` — the room dolly.** `RoomScene` is a Canvas 2D corridor:
  hairline rails, ribs generated from the camera, objects at fixed depths, one
  far door, a light vignette. Scroll drives `cameraAtProgress`; the loop is
  capped at 30 fps, parks itself (cancels rAF) once the camera settles, and
  pauses on `document.hidden`. Under `prefers-reduced-motion` it draws one
  static frame and never starts the loop. `RoomInstrument` prints
  `ROOM NN / Z x.x M / N RIBS` in the margin, is `aria-hidden`, throttles
  updates to 80 ms, and freezes at the initial reading under reduced motion.
  Both are lazy-loaded and only mounted on `/` (`RoomLayer` in
  `site/src/components/SceneLayer.tsx`).
- **Other public routes — `PageScene` motifs.** `motifFor(pathname)` picks one
  drawing: `seats` (`/registrations`), `form` (`/registrations/:id`),
  `dossier` (`/recruit`), `plot-field` (`/projects`), `case-sheet`
  (`/projects/:id`), `contact-sheet` (`/archive`), `door` (login / register /
  reset / verify-pending), `door-ajar` (every other path, including the 404 and
  `/verify-email`). The motif renders inside one fixed `<svg>` frame
  (`0 0 1440 900`, `slice`) that also paints the paper ground. `PageScene`
  stays **eager**: an esbuild probe of the motif subtree measures **10.8 kB
  raw / 3.4 kB gzip** minified (React external), and every non-landing route
  needs it. It is not a significant entry cost.
- **Cursor.** The kit's ink dot + lagging ring + seal tail. It is lazy-loaded
  and *device-gated*: `CursorLayer` reads `useDeviceTier()` (which reads
  `matchMedia` in its initial state) and returns `null` for coarse pointers or
  `prefers-reduced-motion: reduce`, so those devices never fetch the chunk and
  keep the native cursor. On a fine pointer the ring uses GSAP `quickTo`, the
  tail is Canvas 2D, and the component returns `null` when inactive.
- **Chrome and overlays.** Kit `Header` (dossier line, logo, nav, clock, mobile
  menu) and `Footer`; `PreloaderGate` (kit preloader, once per browser
  session); `AnnouncementBanner`; plus `CommandPalette`, `EasterEggs`,
  `HashScroll` and the route `ErrorBoundary`. `PreloaderGate` is deliberately
  **eager** because it is the above-fold first paint.

### Bundle layout

- **Entry (always loaded):** app shell, chrome, preloader, command palette,
  `Landing` (including the index/stage components), the eagerly imported
  auth/utility routes (`Login`, `Register`, `VerifyPending`, `VerifyEmail`,
  `ResetPassword`, `Registrations`, `AdminDoor`, `NotFound`) and the eager
  `PageScene` motif modules.
- **Landing-only lazy chunks:** `GlobeNarrative` (three + the narrative
  engine), `RoomScene`, `RoomInstrument` and the shared `room`
  geometry/projection module.
- **Device-only lazy chunk:** `Cursor`.
- **Route lazy chunks:** `EventDetail`, `ProjectDetail`, `Archive`, `Projects`,
  `Recruit`; the admin door then splits into `Admin`, `AdminEmail`,
  `AdminEvents`, `AdminMedia`, `AdminRegistrations`, `AdminRecruitment`,
  `AdminProjects`, `AdminContent`, `AdminAccounts`, `AdminOverview`.
- Scene `Suspense` fallbacks are `null` — `body` already paints paper, so there
  is no blank frame. The route fallback keeps its reserved
  `min-h-[100svh] py-12` box (the footer-shift/CLS fix).
- `three` is a dependency of **both** apps: the apex teaser
  (`src/three/DataGlobe.ts`, built by `npm run build`) and the preview globe
  (`site/src/lib/narrative-globe.ts`). In the preview build it appears **only**
  inside the lazy `GlobeNarrative` chunk — a string search finds
  `WebGLRenderer` there and zero times in the entry.

## Bundle measurement — 2026-10-31

Gzip figures in the build tables are Vite's own report. Filenames carry a
content hash, so use the byte sizes when comparing builds; the hashes below
are from this run only.

### Entry and shared assets

| Asset | Raw | Gzip |
| --- | --- | --- |
| `assets/index-DpuELuj0.js` (entry) | 417.60 kB | 126.60 kB |
| `assets/index-BffNECDA.css` | 48.44 kB | 10.39 kB |
| `index.html` (includes the no-JS `<noscript>` fallback) | 4.68 kB | 1.60 kB |
| `assets/gsap-CvDoa17S.js` (shared core/ease, preloaded) | 69.58 kB | 27.29 kB |
| `assets/gsap-reveal-B-Fd9Q3h.js` (on-demand) | 56.64 kB | 23.77 kB |
| `assets/jsx-runtime-Dk72oS4N.js` (shared) | 8.77 kB | 3.33 kB |

### Landing-only lazy chunks

| Chunk | Role | Raw | Gzip |
| --- | --- | --- | --- |
| `GlobeNarrative-DaJLN-1T.js` | three + narrative globe engine | 545.07 kB | 136.98 kB |
| `RoomScene-DtdYtPMa.js` | landing canvas | 5.29 kB | 2.37 kB |
| `RoomInstrument-CFihs97m.js` | landing readout | 1.49 kB | 0.81 kB |
| `room-Cj39FGGE.js` | shared room geometry/projection | 1.50 kB | 0.65 kB |
| `Cursor-BfcBMBGW.js` | fine-pointer cursor | 8.64 kB | 3.36 kB |

`GlobeNarrative` is requested only on `/` and only when the story section
approaches the viewport with motion enabled. It is **not** requested on
`/projects`, `/registrations`, `/archive` or `/recruit`, and it is not
requested at all under reduced motion. `RoomScene`/`RoomInstrument` remain
landing-only; `Cursor` is fetched only on fine pointers with motion enabled.

### Route and admin chunks

| Chunk | Raw | Gzip |
| --- | --- | --- |
| `Admin-uhAtPGeP.js` (door) | 4.48 kB | 1.48 kB |
| `AdminRegistrations-C_fpQdVU.js` | 5.71 kB | 2.05 kB |
| `ProjectDetail-DqwXzTUD.js` | 5.81 kB | 2.00 kB |
| `AdminAccounts-CslyZbO3.js` | 5.82 kB | 1.79 kB |
| `AdminOverview-Dv0pcxHs.js` | 6.50 kB | 2.47 kB |
| `Projects-C4wAkHCB.js` | 8.02 kB | 2.57 kB |
| `AdminRecruitment-BlmPZoX_.js` | 8.69 kB | 2.74 kB |
| `AdminProjects-D1Q-S-9j.js` | 8.79 kB | 2.97 kB |
| `Archive-DMetZ6My.js` | 10.53 kB | 3.54 kB |
| `AdminContent-B1IxG2B-.js` | 11.06 kB | 2.90 kB |
| `AdminEvents-2TaYHoF_.js` | 11.38 kB | 3.34 kB |
| `AdminMedia-ur0rroBJ.js` | 13.84 kB | 4.16 kB |
| `EventDetail-CXWNYtRE.js` | 18.80 kB | 4.89 kB |
| `Recruit-BIUjNS5Z.js` | 19.35 kB | 5.36 kB |
| `AdminEmail-D9k2i7NF.js` | 415.98 kB | 131.66 kB |

`AdminEmail` is TipTap + ProseMirror, lazy and fetched only when an admin
opens the Email tab.

## Remaining large chunks and why

- **Entry — 417.60 kB raw / 126.60 kB gzip.** Mostly React 19 + React Router
  DOM, the eager route components, the `PageScene` motifs, GSAP core +
  `CustomEase` pulled in by `RisingText`, and the index/stage landing
  components. ScrollTrigger and SplitText are not in the entry: `Reveal` loads
  `gsap-reveal` on demand. `three` is not in the entry.
- **`GlobeNarrative` — 545.07 kB raw / 136.98 kB gzip.** `three` r186 plus the
  narrative-globe engine (sphere, markers, network, dissolve). It is the only
  chunk above Vite's 500 kB threshold and it is lazy, landing-only.
- **`AdminEmail` — 415.98 kB raw / 131.66 kB gzip.** TipTap + ProseMirror,
  below the threshold and admin-only.
- **Build warning — exactly one.** Vite reports "Some chunks are larger than
  500 kB" for `GlobeNarrative` only. The entry (417.60 kB) and `AdminEmail`
  (415.98 kB) are under the limit; do not "fix" the warning by raising
  `chunkSizeWarningLimit`, and do not treat the globe chunk as entry cost.

### Live preview reference (older build)

The preview reviewed on 2026-10-31 (`e3babbc5`) served a **424.10 kB**
(127.9 kB brotli) entry, `index-D1s5uPX6.js`, and
`GlobeNarrative-cWxo_9Dq.js` at **545.14 kB** (138.2 kB brotli). The current
tree builds a 417.60 kB entry (`index-DpuELuj0.js`) because landing/admin code
changed after that deployment; the globe chunk is unchanged. Cite ~424 kB only
for the deployed preview, ~418 kB for the current tree — both are the same
architecture, and neither number includes the lazy globe.

## Asset caching (Workers static assets)

`public/_headers` is copied to `dist-site/_headers` by `npm run build:site`.
Cloudflare Workers static assets supports `_headers` (it is parsed by the
asset layer and is not itself served), including for responses returned by
`env.ASSETS.fetch()` — which is how `worker/staging.ts` and `worker/index.ts`
serve files. The current rules:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```

- `/assets/*` is safe because Vite fingerprints every filename; a deploy
  produces a new name, so a one-year immutable cache cannot serve stale code.
- `/fonts/*` is deliberately included (typography is part of the first paint).
  Font filenames are **not** hashed, so replacing a face must also rename the
  file or add a version query, otherwise returning visitors keep the old bytes
  for a year.
- **HTML is deliberately not listed.** It keeps the Workers default
  `Cache-Control: public, max-age=0, must-revalidate`, so navigation always
  revalidates. The worker-generated HTML paths keep that too: the event pages
  and 404s set `no-store`; `injectDefaultMeta` clones the shell headers and
  removes validators only because it rewrites the body.
- `_headers` rules do not apply to responses the Worker constructs itself. The
  staging worker passes asset responses through unchanged for `/assets/*` and
  `/fonts/*`, so the rules do take effect there.

## Retired / superseded numbers (history only)

- The 2026-10-22 dark-editorial table ("main 356 kB + GlobeNarrative 531 kB /
  three.js") describes the **pre-redesign** site. It is history, not a
  baseline for this build.
- The 407.99 kB entry (`index-Ca67FsrO.js`) and the "no `three` chunk" claim
  described the brief no-globe build. Both are superseded: the current entry is
  417.60 kB and `three` ships inside the lazy `GlobeNarrative` chunk. Do not
  cite "there is no three chunk" as a property of the current preview.
- The 617.72 kB / 206.42 kB entry is the **before** row of the earlier split,
  not a globe build.
- The old dark fonts, dark page ground, `/media` page (now a redirect to
  `/archive`) and the 2026-10-23 / 2026-10-25 Lighthouse or CLS tables all
  predate the ink-on-paper redesign. Re-measure before citing performance
  numbers.

## Verification on 2026-10-31

- `npx tsc -b` — **pass** (root `./src` + `vite.config.ts`).
- `npx tsc -p worker` — **pass** (the worker is not in the root project graph).
- `npm run typecheck:site` — **pass** (`tsc -p site`).
- `npm test` — **pass**, 164/164 across 11 files (Vitest, jsdom + the worker's
  node-environment suites).
- `npm run build:site` — **pass**; **24 JS chunks + 1 CSS chunk**. The only
  warning is the >500 kB notice for the lazy `GlobeNarrative`.
- E2E was **not run** for this change (Playwright requires `wrangler dev` and
  seeded local D1 state). No dev server was started.
- Lighthouse was **not run**; no headless Chrome was used for this bundle-only
  change.

## Reproduce

```bash
# Bundle + typecheck + unit tests (no server):
npm run build:site
npx tsc -b
npx tsc -p worker
npm run typecheck:site
npm test

# Optional performance pass against the built site (start preview yourself):
npx vite preview -c site/vite.config.ts --port 4174
npx -y lighthouse http://localhost:4174/ --preset=desktop \
  --output=json --output-path=./lighthouse-desktop.json \
  --chrome-flags="--no-sandbox --headless=new"
npx -y lighthouse http://localhost:4174/ \
  --output=json --output-path=./lighthouse-mobile.json \
  --chrome-flags="--no-sandbox --headless=new"

# Verify the cache rules once deployed (or under `wrangler dev`):
curl -sI https://preview.nsdcaseb.xyz/assets/<entry>.js   # immutable, max-age=31536000
curl -sI https://preview.nsdcaseb.xyz/                    # public, max-age=0, must-revalidate
```

Record raw/gzip for the entry, CSS, `GlobeNarrative`, `RoomScene`,
`RoomInstrument`, `room` and `Cursor`; for route work also cold-load one lazy
route (`/registrations`, `/archive`, `/recruit`) and confirm the globe chunk is
not requested.
