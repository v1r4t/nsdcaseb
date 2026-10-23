# NSDC Site Upgrade Plan — v1

> Status: planned, not started.
> Scope: performance, social/SEO, admin console, accessibility, security, tests/CI.
> Excluded: email delivery, waitlist/guest notifications, event venue, add-to-calendar, event share (track 1).

## Context

Baseline observations from the current codebase:

- Main JS chunk is **871 KB** and includes Three.js/WebGL, because `Landing.tsx` eagerly imports `GlobeNarrative` → `narrative-globe.ts` → `three`.
- Fonts load render-blocking from Google Fonts in `site/index.html`.
- `Media.tsx` loads full-size originals with no `srcset`, thumbnail variant, or reserved aspect ratio.
- The site has no OG/Twitter tags, canonical URLs, `robots.txt`, `sitemap.xml`, or JSON-LD.
- Unknown routes and `/admin` return HTTP 200 because of SPA fallback.
- `--muted: #777777` on `#080808` is **4.47:1**, just below WCAG AA.
- There is no skip link, and the Media lightbox has no focus trap.
- No security headers (`CSP`, `HSTS`, `nosniff`, `Referrer-Policy`) are set.
- No tests or CI pipeline exist.
- The admin dashboard is one long 505-line page; events cannot be edited fully or archived; the audit-log API is unused.
- Email/outbox UI exists, but delivery is still a stub in `worker/mailer.ts` (excluded from this plan).

---

## Phase 0 — Baseline and safety net (~half day)

Goal: measure the current state and create a thin quality gate before changing anything.

### Tasks

- [ ] Record current bundle sizes from `npm run build:site` (main chunk and lazy chunks).
- [ ] Confirm Three.js/WebGL is in the main chunk.
- [ ] Run Lighthouse (mobile + desktop) on `/`, `/registrations`, `/registrations/:id`, `/media`.
- [ ] Save baseline numbers for LCP, CLS, TBT, total JS, and image transfer.
- [ ] Add `vitest.config.ts` and a first unit test folder.
- [ ] Add a minimal GitHub Actions workflow running `npm run typecheck:site` and `npm run build:site`.
- [ ] Add `test` script(s) to `package.json`.

### Acceptance criteria

- CI is green on the untouched code.
- Baseline metrics are documented so later improvements are measurable.

---

## Phase 1 — Performance (~1–1.5 days)

### 1A. Remove Three.js from the main bundle

Problem: every route downloads Three.js because the landing globe is imported eagerly.

Tasks:

- [ ] Add a `LazyGlobe` wrapper around `GlobeNarrative`.
- [ ] Render a fixed-height placeholder matching the globe section to prevent layout shift.
- [ ] Dynamically import `GlobeNarrative` only when the section approaches the viewport
      (`IntersectionObserver`, `rootMargin: 400px`).
- [ ] If `prefers-reduced-motion: reduce`, render the static fallback immediately and never
      fetch the Three.js chunk.
- [ ] Evaluate lazy-loading `CinematicOrigin` as well if it is below the fold.
- [ ] Re-measure bundle sizes.

Acceptance criteria:

- Main chunk target: under ~250 KB.
- Three.js lives in its own lazy chunk.
- No layout jump when the globe loads.
- Navigating to `/registrations`, `/login`, etc. does not download Three.js.

### 1B. Self-host fonts

Tasks:

- [ ] Download Space Grotesk (variable) and Geist Mono (variable) woff2 files into `public/fonts/`.
- [ ] Add `@font-face` rules in `site/src/index.css` with `font-display: swap`.
- [ ] Preload only the display font used above the fold.
- [ ] Remove Google Fonts `<link>` and preconnect tags from `site/index.html`.
- [ ] Keep sensible system-font fallbacks.

Acceptance criteria:

- No render-blocking Google Fonts request.
- Text remains readable during font swap.
- Lighthouse improvement is measurable.

### 1C. Image pipeline

Tasks:

- [ ] Add width/height or fixed aspect wrappers to every `<img>` in:
      `site/src/pages/Media.tsx`, `site/src/pages/EventDetail.tsx`,
      `site/src/pages/Projects.tsx`, and admin previews.
- [ ] Generate image variants:
      - `thumb` (~480w) for media grids,
      - `full` for the lightbox,
      - poster variants for event cards/detail.
- [ ] Serve variants with `srcset` / `sizes`.
- [ ] Prefer Supabase image transforms if the current plan supports them.
      Otherwise:
      - resize on upload via a small canvas step in admin,
      - add a one-off backfill script for existing media.
- [ ] Keep `loading="lazy"` and `decoding="async"`.

Acceptance criteria:

- `/media` grid no longer downloads full-resolution originals.
- No new layout shift.
- Lightbox still loads a high-quality image.

---

## Phase 2 — Social, SEO, and edge behavior (~1–1.5 days)

### 2A. Default metadata

Tasks:

- [ ] Add default OG and Twitter card tags in `site/index.html`.
- [ ] Create a branded default OG image (1200×630) in `public/`.
- [ ] Add `og:site_name`, `og:type`, and canonical support.
- [ ] Add Organization JSON-LD to the shell.
- [ ] Add a `useDocumentMeta` hook so client-side navigation updates
      `document.title` and the description.

### 2B. Per-event previews at the worker

Create `worker/meta.ts` and wire it into `worker/staging.ts`.

Tasks:

- [ ] Detect navigation requests (`Accept: text/html`) to `/registrations/:id`.
- [ ] Fetch the SPA shell from `ASSETS`.
- [ ] Query the event from D1.
- [ ] Use `HTMLRewriter` to inject:
      - `<title>`,
      - meta description,
      - canonical URL,
      - OG/Twitter title, description, image (poster or default),
      - Event JSON-LD.
- [ ] Set `Cache-Control: no-store` on HTML responses.
- [ ] Fall back to default metadata when the event does not exist.

Acceptance criteria:

- Pasting an event URL into WhatsApp/LinkedIn previews the event, not the generic site.
- Direct navigation still hydrates the React app normally.

### 2C. Sitemap, robots, real 404

Tasks:

- [ ] Add `public/robots.txt`.
- [ ] Add worker route `/sitemap.xml`:
      - static routes,
      - all public event URLs,
      - cache ~1 hour.
- [ ] Add a known-route matcher in the worker:
      - known public route → 200,
      - unknown route → SPA shell with HTTP **404**,
      - `/admin` → SPA shell with HTTP **404** (preserves the disguise),
      - assets and `/api/*` unchanged.
- [ ] Keep the visual 404 and the hidden `0` entry exactly as they are.

Acceptance criteria:

- `curl -I /nope` → 404.
- `curl -I /admin` → 404.
- `/registrations/:id` and `/media` → 200.
- The app still renders correctly in all cases.

---

## Phase 3 — Admin console upgrade (~2–3 days)

Constraint: all tabs stay inside the existing `/admin` door. **Do not add client routes**,
otherwise the 404 disguise is weakened.

### 3A. Structure

- [ ] Split the 505-line `site/src/pages/Admin.tsx` into `site/src/components/admin/`:
      - `AdminOverview`
      - `AdminEvents`
      - `AdminRegistrations`
      - `AdminEmail`
      - `AdminContent`
      - `AdminAccounts`
- [ ] `Admin.tsx` becomes the shell: tab state, shared notice, busy state.
- [ ] Tabs use local state, optionally mirrored to the hash after unlock.
- [ ] No `/admin/...` client routes.

### 3B. Events

- [ ] Event list shows title, date, capacity, registered count, open/closed.
- [ ] Create form gains a questions builder (label, required, max length).
- [ ] Edit panel for:
      - title,
      - description,
      - start/end,
      - registration window,
      - capacity,
      - force-closed,
      - questions,
      - poster.
- [ ] Add soft archive:
      - migration `0016_event_archive.sql` adding `archived_at`,
      - public `GET /api/events` excludes archived events,
      - admin can view and unarchive,
      - no hard delete, so registrations/audit remain intact.

### 3C. Registrations

- [ ] Event picker + roster.
- [ ] Search by email/name.
- [ ] Status filter and counts.
- [ ] Format timestamps instead of raw ISO strings.
- [ ] Render answers as readable key/value pairs.
- [ ] Keep CSV download.

### 3D. Email and audit

- [ ] Outbox table: formatted dates, preview text, retry failed rows.
- [ ] Add `POST /api/admin/outbox/:id/retry` resetting attempts/status.
- [ ] Audit log tab using existing `getAuditLog()`.
- [ ] Dependency note: retry only has an effect once real email delivery lands
      (excluded track 1). Show a “delivery not configured” state until then.

### 3E. Mobile admin

- [ ] Tables become stacked cards, or scroll horizontally with sticky headers.
- [ ] Tabs scroll horizontally on small screens.

### Acceptance criteria

- Every existing admin action still works.
- No new public URL reaches the dashboard.
- Archived events disappear from public listings but remain in admin.
- Mobile admin is usable at 390px.

---

## Phase 4 — Accessibility, security, resilience (~1–1.5 days)

### 4A. Accessibility

- [ ] Change `--muted` from `#777777` to `#8a8a8a` (4.47:1 → 5.80:1).
- [ ] Audit `text-muted/70` and placeholder colors after the token change.
- [ ] Add a skip link to `#main`.
- [ ] Give `<main>` `id="main"` and `tabIndex={-1}`.
- [ ] Extract a shared focus-trap hook from `FullscreenMenu` / `CommandPalette`.
- [ ] Apply the focus trap to the Media lightbox.
- [ ] Add `aria-current="page"` to the active menu item.
- [ ] 320px audit: compress the header so Sign in / Search / Menu never clip
      (icon-only controls below ~400px, or reduced padding).

### 4B. Security headers

Wrap worker responses with:

- `Content-Security-Policy`:
  - `default-src 'self'`
  - `script-src 'self'`
  - `style-src 'self' 'unsafe-inline'` (React inline styles)
  - `img-src 'self' data: blob: <supabase-host>`
  - `frame-src https://www.youtube-nocookie.com`
  - `font-src 'self'`
  - `object-src 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`
  - `frame-ancestors 'none'`
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`

Ordering note: land Phase 1B (self-hosted fonts) before enforcing the strict CSP.

### 4C. Resilience

- [ ] Add a React error boundary around `<Routes>` with a branded fallback and reload action.
- [ ] Audit empty/error states for every data-fetching page.

### Acceptance criteria

- Axe reports no serious/critical issues on key pages.
- Keyboard-only navigation works through the lightbox and header.
- No layout clipping at 320px.
- Security headers present on HTML responses.

---

## Phase 5 — Tests and CI (~1–2 days)

### 5A. Unit / component tests (Vitest + React Testing Library)

- [ ] `statusFor` / `statusOf` logic.
- [ ] Search scoring and matching.
- [ ] Date/time formatting.
- [ ] `NotFound`: normal 404 has an inert `0`; admin variant has an accessible button.
- [ ] `AdminDoor`: locked → unlocked → reload re-locks.
- [ ] Admin error mapping and filter helpers.

### 5B. E2E (Playwright, local wrangler + seeded D1)

1. [ ] `/admin` → 404 → `0` → Admin; refresh → 404.
2. [ ] `/nope` → 404 and no button.
3. [ ] Guest event registration, including required questions.
4. [ ] Capacity → waitlist; cancellation promotes the next person.
5. [ ] Login / register / logout.
6. [ ] Mobile 390px: event titles full width, no horizontal scroll.
7. [ ] HTTP status assertions for 404/200 routes.
8. [ ] Axe checks on `/`, `/registrations`, `/media`, `/admin`.

### 5C. CI

- [ ] `quality` job:
      install, typecheck root + site, build root + site, unit tests.
- [ ] `e2e` job:
      build site, apply local D1 migrations, start wrangler, run Playwright.
- [ ] Cache npm and Playwright browsers.
- [ ] Optional: ESLint/Prettier, non-blocking for the first pass.

### Acceptance criteria

- CI blocks merges when typecheck, build, or tests fail.
- Critical flows are covered.
- Accessibility checks are automated.

---

## Suggested execution order

| Order | Phase | Why |
|---|---|---|
| 1 | Phase 0 | Baseline + CI so improvements are measurable |
| 2 | Phase 1 | Biggest user-facing performance win |
| 3 | Phase 2 | Sharing/SEO and correct 404 semantics |
| 4 | Phase 4A/4B | Low-risk polish, after fonts for CSP |
| 5 | Phase 3 | Largest UI refactor; do it on a stable base |
| 6 | Phase 5 | Broaden coverage once the surface is settled |

---

## Decisions needed

1. **Image variants:** use Supabase image transforms if the current plan supports them,
   or generate thumbnails on upload? This changes Phase 1C.
2. **Event archive:** soft archive (`archived_at`) is recommended; hard delete loses
   registration history.
3. **Admin outbox retry:** build it now with a “delivery not configured” state, or defer
   until the email seam is implemented?

---

## Out of scope

- Real email delivery (M365 Graph / Resend).
- Waitlist-promotion and guest-confirmation emails.
- Event venue/location field.
- Add-to-calendar / `.ics`.
- Event share button.
- Any production deployment changes.

---

## Risks

- **HTMLRewriter on asset responses:** must preserve streaming and headers; test carefully.
- **Per-event D1 lookup on navigation:** adds a small latency; consider a short KV cache.
- **Image variants:** may depend on the Supabase plan or require a backfill.
- **Bundle split:** lazy globe needs a correctly sized placeholder to avoid CLS.
- **Archive migration:** must be applied before deploying admin changes.
- **CI E2E with D1:** seeding and local wrangler add complexity; unit + build can land first.
