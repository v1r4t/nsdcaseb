# Baseline — ink-on-paper preview site

Date: **2026-10-31**. Measured with Node v24.14.0, npm 11.9.0 and Vite 8.3.1
from the repo root with:

```bash
npm run build:site     # vite build -c site/vite.config.ts
```

All sizes below are from that fresh build of the current working tree
(`dist-site/`). This supersedes every earlier baseline in this file: the
preview site no longer uses the dark editorial system or the WebGL globe.

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
  tail is Canvas 2D, and the component returns `null` when inactive, exactly as
  before the split.
- **Chrome and overlays.** Kit `Header` (dossier line, logo, nav, clock, mobile
  menu) and `Footer`; `PreloaderGate` (kit preloader, once per browser
  session); `AnnouncementBanner`; plus `CommandPalette`, `EasterEggs`,
  `HashScroll` and the route `ErrorBoundary`. `PreloaderGate` is deliberately
  **eager** because it is the above-fold first paint.

### Bundle layout

- **Entry (always loaded):** app shell, chrome, preloader, command palette,
  `Landing`, the eagerly imported auth/utility routes (`Login`, `Register`,
  `VerifyPending`, `VerifyEmail`, `ResetPassword`, `Registrations`,
  `AdminDoor`, `NotFound`) and the eager `PageScene` motif modules.
- **Landing-only lazy chunks:** `RoomScene`, `RoomInstrument` and the shared
  `room` geometry/projection module.
- **Device-only lazy chunk:** `Cursor`.
- **Route lazy chunks:** `EventDetail`, `ProjectDetail`, `Archive`, `Projects`,
  `Recruit`; the admin door then splits into `Admin`, `AdminEmail`,
  `AdminEvents`, `AdminMedia`, `AdminRegistrations`, `AdminRecruitment`,
  `AdminProjects`, `AdminContent`, `AdminAccounts`, `AdminOverview`.
- Scene `Suspense` fallbacks are `null` — `body` already paints paper, so there
  is no blank frame. The route fallback keeps its reserved
  `min-h-[100svh] py-12` box (the footer-shift/CLS fix).
- `three` is **not** part of the preview build. It remains a root dependency
  only for the apex teaser app built by `npm run build`.

## Bundle measurement — 2026-10-31

Gzip figures in the build tables are Vite's own report; the standalone probe
sizes below used `esbuild --minify` + zlib level 9.

### Entry JavaScript before / after this change

| | Entry JS raw | Entry JS gzip |
| --- | --- | --- |
| Before (eager scenes + cursor + all GSAP plugins) | 617.72 kB | 206.42 kB |
| **After (split scenes/cursor + pruned GSAP)** | **407.99 kB** | **126.58 kB** |
| Delta | **−209.73 kB (−34%)** | **−79.84 kB (−39%)** |

The change: `RoomScene` + `RoomInstrument` and the device-gated `Cursor` moved
behind `React.lazy`; the unused GSAP plugins were removed; `Reveal` now loads
ScrollTrigger + SplitText on demand through `design/lib/gsap-reveal.ts`, while
the four ScrollTrigger consumers register it themselves. `PreloaderGate` and
`PageScene` remain eager.

CSS is **45.25 kB raw / 9.77 kB gzip** in the final build.

### Current entry assets

| Asset | Raw | Gzip |
| --- | --- | --- |
| `assets/index-Ca67FsrO.js` (entry) | 407.99 kB | 126.58 kB |
| `assets/index-tjIW4VjQ.css` | 45.25 kB | 9.77 kB |
| `index.html` | 3.08 kB | 1.03 kB |
| `assets/gsap-CvDoa17S.js` (shared core/ease, preloaded) | 69.58 kB | 27.29 kB |
| `assets/gsap-reveal-DOioXd74.js` (on-demand) | 50.03 kB | 20.57 kB |

### Chunks added by this split

| Chunk | Role | Raw |
| --- | --- | --- |
| `RoomScene-CKbqy0BK.js` | landing canvas | 5.30 kB |
| `RoomInstrument-DPnu4MX5.js` | landing readout | 1.49 kB |
| `room-Cj39FGGE.js` | shared room geometry/projection | 1.50 kB |
| `Cursor-7nZ7DuWm.js` | fine-pointer cursor | 8.64 kB |
| `gsap-reveal-DOioXd74.js` | SplitText + ScrollTrigger for Reveal | 50.03 kB |

All are loaded on demand (the room group only on `/`, the cursor only on
non-touch, non-reduced-motion devices, and the reveal chunk only when a reveal
actually runs with motion enabled).

### Current lazy route/admin chunks

| Chunk | Raw | Gzip |
| --- | --- | --- |
| `ProjectDetail-C9A-BxiY.js` | 5.77 kB | 1.98 kB |
| `Admin-WhPMNrZE.js` | 4.39 kB | 1.47 kB |
| `AdminAccounts--09Arzd0.js` | 5.78 kB | 1.77 kB |
| `AdminRegistrations-DIuOgtDM.js` | 5.68 kB | 2.03 kB |
| `AdminOverview-Dy5XZ7ve.js` | 6.50 kB | 2.47 kB |
| `Projects-DQfF_Pe_.js` | 7.96 kB | 2.55 kB |
| `AdminRecruitment-M8RNApYy.js` | 8.65 kB | 2.72 kB |
| `AdminProjects-RFUUGFfM.js` | 8.75 kB | 2.95 kB |
| `AdminContent-BmKj-esk.js` | 9.60 kB | 2.50 kB |
| `Archive-Cl3G4zbM.js` | 10.40 kB | 3.44 kB |
| `AdminEvents-BVSxoC41.js` | 11.34 kB | 3.33 kB |
| `AdminMedia-Cfgt7kuU.js` | 13.80 kB | 4.14 kB |
| `EventDetail-BLAoncB5.js` | 18.77 kB | 4.86 kB |
| `Recruit-WUj-dPKf.js` | 19.25 kB | 5.32 kB |
| `AdminEmail-CgW4WW9f.js` | 415.94 kB | 131.65 kB |

## Remaining large chunks and why

- **Entry — 407.99 kB raw / 126.58 kB gzip.** The largest single contributor is
  GSAP 3.15 core + `CustomEase`, pulled in by `RisingText` (used by the landing
  story sequence). ScrollTrigger and SplitText are no longer in the entry:
  `Reveal` loads `gsap-reveal` on demand, and the other ScrollTrigger consumers
  register it themselves. Flip, Observer, Draggable and MotionPathPlugin were
  removed entirely. The rest is React 19 + React Router DOM, the eager route
  components and the `PageScene` motifs.
- **`AdminEmail` — 415.99 kB raw / 131.65 kB gzip.** TipTap + ProseMirror rich
  text editor (verified by string search: both names are in this chunk only).
  It is lazy and only fetched when an admin opens the Email tab.
- Build warning: none. Both the entry (407.99 kB) and `AdminEmail` (415.99 kB)
  are under Vite's 500 kB threshold.

## Retired architecture (do not use as a baseline)

- `GlobeNarrative`, `LazyGlobe` and `lib/narrative-globe.ts` are gone from the
  preview app. A string search over every `dist-site/assets/*.js` finds no
  `WebGLRenderer` or `BufferGeometry`, and there is no `three` chunk. The old
  "main 356 kB + GlobeNarrative 531 kB / three.js" table from 2026-10-22
  describes a deleted architecture and must not be compared with the numbers
  above.
- The old dark-editorial fonts, dark page ground, `/media` page (now a
  redirect to `/archive`) and the 2026-10-23 / 2026-10-25 Lighthouse or CLS
  tables all predate the ink-on-paper redesign. They remain useful history for
  the pre-redesign site only; re-measure before citing performance numbers.
  In particular, the earlier `617.72 kB / 206.42 kB` entry is the **before**
  row above, not a globe build.

## Verification on 2026-10-31

- `npm run typecheck:site` — **pass** (`tsc -p site`).
- `npm test` — **140/140 pass across 10 files** (Vitest, jsdom).
- `npm run build:site` — **pass**; 20 JS chunks + one CSS chunk. The only
  warning is the >500 kB chunk notice described above.
- E2E was **not run** for this change (19 Playwright specs exist; they require
  `wrangler dev` and seeded local D1 state). No dev server was started.
- Lighthouse was **not run**; no headless Chrome was used for this bundle-only
  change.

## Reproduce

```bash
# Bundle + typecheck + unit tests (no server):
npm run build:site
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
```

Record raw/gzip for the entry, CSS, `RoomScene`, `RoomInstrument`, `room` and
`Cursor`; for route work also cold-load one lazy route (`/registrations`,
`/archive`, `/recruit`) and the admin door.
