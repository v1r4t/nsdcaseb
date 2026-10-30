# Ink-on-paper preview site — design

**Status:** approved 2026-10-31
**Scope:** `site/` (preview.nsdcaseb.xyz) only

## Intent

Replace the current dark editorial system (`design/design.md`) on the full club
site with the ink-on-paper package in `design/` (README, tokens, chrome, scenes,
motifs, motion, primitives). Content, routes, data, auth, admin, search,
accessibility and tests are preserved; only the visual language and the landing
experience change.

## Goals

- Whole preview site in ink-on-paper: `#F2EEE3` paper ground, `#111110` ink
  type, `#B33C1B` seal accent.
- Bespoke Serif display, Switzer body, Geist Mono metadata.
- Landing becomes the room dolly (`RoomScene` + `RoomInstrument`); every other
  public route gets its `PageScene` motif.
- Header, Footer, Preloader and Cursor come from the kit.
- Admin stays fully functional in the new palette and type.
- Existing tests pass; no regressions in routes, forms, auth or registration.

## Non-goals

- No backend, API or schema changes.
- No content rewrite. The origin copy and globe-narrative copy are kept (see
  “Narrative adaptation”).
- No transactional email redesign.
- No new OG artwork. `theme-color` is updated; OG regeneration is separate.
- No theme switch, sound, or second ground.
- No production cutover. Preview only.

## Anti-goals

- A dark site repainted light (old layouts, new colours). Phases 2–3 recompose.
- Two competing design systems left in the tree.
- Seal everywhere; seal occupies ≤10% of any viewport.
- Shadows, rounded cards, glassmorphism.

## Constraints

- Tailwind 3 → adapt `design/tailwind-v3.cjs` into `site/tailwind.config.js`.
  Do not use the v4 CSS bridge.
- The kit lives at repo-root `design/`; the site builds from `site/` with
  `publicDir ../public`. Import kit CSS/TSX by relative path and add
  `../design/**/*.{ts,tsx}` to Tailwind content.
- Brand masks must exist at `public/brand/`.
- Kit is light-only. Page and section backgrounds are transparent because
  `RoomScene` / `PageScene` owns the ground.
- `lenis` is not installed; skip smooth scroll. `gsap` is installed.
- Keep React Router 7, Tailwind 3 and the existing data layer.
- Honour `prefers-reduced-motion`.

## Chosen approach

B, staged: foundation and chrome → landing → public pages → cleanup. Rejected:
A (reskin in place; reads as a repaint) and C (parallel app; duplicates routing,
auth, admin and e2e).

## Decisions

1. **Every phase ships readable.** Phase 1 sweeps every route, because
   `paper`/`ink` invert. Ink slabs (footer, announcement banner, primary
   buttons) keep `bg-ink text-paper`; everything on paper becomes `text-ink`.
   Compatibility aliases during migration: `muted → #5f5b53`, `line →
   var(--hairline)`.
2. **Host data wins over kit placeholders.** Archive and event media keep their
   real Supabase images, `srcSet`, video and the existing carousel/lightbox —
   reskinned, not replaced. Kit `DrawnPlaceholder` is used only for empty or
   failed media. Event state keeps `StatusDot` plus text labels, extended to
   FILLING FAST / REGISTERED / WAITLISTED. Kit `StatusPill` is not forced over
   it.
3. **Accessible contracts preserved.** Existing e2e names and roles
   (`Archive photos`, `Next photo`, `Open the archive`, a real `main img`) stay
   via props on re-skinned components. Specs change only where a component is
   deliberately retired; that list goes in the PR.
4. **AnnouncementBanner stays** — a paper strip with a hairline and a seal
   marker, directly under the header.
5. **Fonts are stable-path and preloaded.** The six kit woff2 files are copied
   to `public/fonts/`; `design/tokens.css` points at `/fonts/…`; Bespoke Serif
   regular and Switzer regular are preloaded. Keep `swap`; add `size-adjust`
   fallbacks only if measured CLS > 0.1.
6. **Admin is token/type only**, plain paper ground, no motif. All panels,
   forms, tables and the rich-text editor become light and must stay usable.
7. **Chrome:** kit Header (dossier line, logo, inline nav, clock, mobile nav)
   with Search and Sign in/out in the right cluster; kit Footer, Preloader and
   Cursor. `FullscreenMenu` and `FolioRail` retire. `CommandPalette`,
   `EasterEggs`, `HashScroll` and `ErrorBoundary` stay.
8. **Scenes:** `RoomScene` on `/`; `PageScene motifFor(pathname)` elsewhere;
   plain paper for `/admin*`. Extend the motif map for `/verify-email`.
9. **Preloader** mounts at app root, gated to once per browser session.
10. **Class migration is per-file, not a blind global rename.** Mapping:
    `bg-ink` → `bg-paper`, `text-paper` → `text-ink` (except on ink slabs),
    `border-line` → `hairline`, `text-muted` → `text-quiet` (or
    `text-footer-muted` on ink), `signal` → `seal`, `label` → `mono`,
    `shell` → `wrap`.

## Narrative adaptation

Both hardcoded narratives survive; only their typography, ground and motion
change.

### “We started with a question”

- Becomes an editorial sequence over `RoomScene`.
- Mono label `02 / THE ORIGIN`; the three question lines in Bespoke Serif via
  kit `RisingText` (staggered, no pinning); the CMS `body` below in Switzer
  17px; the existing scroll-linked opacity bands kept, transparent over the
  room.
- Reduced motion renders the same copy as a static stack.
- The “Skip the story” affordance stays as a small mono link when the sequence
  is tall enough.
- `CinematicOrigin.tsx` retires; its copy moves into the recomposed section.

### Globe narrative stages

- Becomes a three-part dossier over the room, preserving exact copy:
  `01 / A CHAPTER IN BENGALURU`, `02 / STUDENTS, CONNECTED`,
  `03 / WHAT WE BUILD TOGETHER`.
- Mono index + serif statement + body, alternating left/right asymmetry,
  entering via kit `Reveal` / `RisingText` on scroll. No sticky 170vh stage, no
  globe, no scroll-jack.
- `12.894702° N, 77.675574° E` / `BENGALURU` becomes a seal coordinate line
  under stage 02.
- `GlobeNarrative.tsx`, `LazyGlobe.tsx` and `lib/narrative-globe.ts` retire.
  `three` remains in the repo for the apex teaser only.

## Phases

1. **Foundation and shell.** Tailwind preset + utilities; `index.css` imports
   kit tokens/components and drops the dark base; light `a11y-eggs.css`; brand
   masks and fonts in `public/`; app shell = scene switch, kit Header/Footer,
   Preloader, Cursor; remove Backdrop, ContextCursor, FullscreenMenu,
   FolioRail; full class sweep.
2. **Landing.** Room dolly replaces `CinematicOrigin` + globe; story sequences
   adapted; existing sections keep their data and order and are recomposed in
   kit type and primitives.
3. **Public routes.** Events list/detail, Archive, Projects/detail, Recruit,
   auth, 404 — recomposed with kit primitives.
4. **Cleanup and verification.** Delete unused chrome, CSS and fonts; retire
   `design/design.md` in favour of the kit README; update README; run tests.

## Verification

- `npm run typecheck:site`
- `npm run build:site`
- `npm test`
- `npm run test:e2e` against wrangler dev
- axe checks on public routes
- Manual: every route, reduced motion, 320px, keyboard focus, contrast, admin
  CRUD smoke
- Contrast: ink/paper ≈15:1; quiet/paper ≥4.5; seal reserved for large text
  and graphics if small-text AA fails
- No layout shift from the font swap (measure CLS; add `size-adjust` only if
  needed)
